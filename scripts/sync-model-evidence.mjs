// Keep the browser payload small and derive every displayed count from reports.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const manifest = read("services/ml/serving-model.json");
const dataset = read("services/ml/reports/expanded/dataset.json");
const comparison = read("services/ml/reports/expanded/comparison.json");
const expanded = read("services/ml/reports/expanded/evaluation.json");
const contextTest = read("services/ml/reports/context/final-test.json");
const contextSelection = read("services/ml/reports/context/selection.json");
const finalTest = read("services/ml/reports/model-selection/final-test.json");
const selection = read("services/ml/reports/model-selection/selection.json");
if (selection.dataset_sha256 !== dataset.dataset_sha256 || selection.candidate_sha256 !== finalTest.artifact_hashes.candidate) {
  throw new Error("Final model review does not match the selected model/development dataset.");
}
if (finalTest.promotion_eligible || finalTest.selected !== "boosted") {
  throw new Error("The model decision changed; update the review copy before publishing.");
}
const servingHash = createHash("sha256").update(readFileSync(new URL(`services/ml/artifacts/${manifest.artifact}`, root))).digest("hex");
if (servingHash !== manifest.artifact_sha256 || servingHash !== contextSelection.artifact_sha256 || !contextTest.promotion_eligible || contextTest.selection_sha256 !== createHash("sha256").update(readFileSync(new URL("services/ml/reports/context/selection.json", root))).digest("hex") || manifest.dataset_sha256 !== dataset.dataset_sha256 || manifest.training_shots !== dataset.shots || manifest.training_matches !== dataset.matches.length) {
  throw new Error("Serving model changed: update its evidence mapping before publishing the frontend.");
}
if (dataset.dataset_sha256 !== comparison.dataset_sha256 || dataset.dataset_sha256 !== expanded.dataset_sha256) {
  throw new Error("Research reports refer to different datasets; regenerate them together.");
}
const groups = new Map();
for (const match of dataset.matches) {
  const group = groups.get(match.competition_name) ?? { name: match.competition_name, matches: 0, shots: 0, seasons: new Set() };
  group.matches++;
  group.shots += match.shots;
  group.seasons.add(match.season_name);
  groups.set(group.name, group);
}
const competitions = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "en"))
  .map((group) => ({ ...group, seasons: [...group.seasons].sort() }));
if (competitions.reduce((sum, item) => sum + item.shots, 0) !== dataset.shots) throw new Error("Dataset totals disagree");
const contextContract = read("services/ml/shot-context.json");
const audited = read("services/ml/reports/context/audit.json").context_combinations;
const contextKeys = ["body_part", "technique", "shot_type", "play_pattern"];
const expected = audited.filter(row => row.shots >= 100).map(row => ({...Object.fromEntries(contextKeys.map((key, i) => [key, row.values[i]])), shots: row.shots}));
if (JSON.stringify(contextContract.combinations) !== JSON.stringify(expected)) throw new Error("Context support policy drifted from the audited data");
for (const path of ["services/api/src/shot-context.json", "apps/web/lib/shot-context.json"]) {
  if (JSON.stringify(read(path)) !== JSON.stringify(contextContract)) throw new Error("Context contracts are out of sync");
}
const summary = {
  serving: { id: manifest.model_id, shots: manifest.training_shots, matches: manifest.training_matches, folds: expanded.fold_count,
    auc: contextTest.candidate.metrics.roc_auc, brierImprovement: (1 - contextTest.candidate.metrics.brier_score / contextTest.serving.metrics.brier_score) * 100,
    calibration20to30: contextTest.candidate.calibration.find((bin) => bin.lower === .2)?.goal_rate },
  research: { shots: dataset.shots, matches: dataset.matches.length, revision: dataset.revision,
    competitions, testShots: comparison.test_shots, testMatches: comparison.test_matches,
    small: comparison.experiments.mixed_3770, large: comparison.experiments.mixed_all,
    brierDifference: comparison.paired_brier_large_minus_small },
  modelReview: { selected: contextTest.selected, shots: contextTest.test_shots, matches: contextTest.test_matches,
    promotionEligible: contextTest.promotion_eligible,
    competitions: Object.entries(contextTest.candidate.slices.competition_name).map(([name, metrics]) => ({name, shots: metrics.shots})),
    metrics: {candidate: contextTest.candidate.metrics, serving: contextTest.serving.metrics},
    brierInterval: contextTest.paired_brier },
};
// Do not ship fold membership, match IDs or the complete source manifest to browsers.
for (const key of ["small", "large"]) {
  const item = summary.research[key];
  summary.research[key] = { trainingShots: item.training_shots, brier: item.metrics.brier_score };
}
const output = new URL("apps/web/lib/model-evidence.json", root);
const text = JSON.stringify(summary, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (readFileSync(output, "utf8") !== text) throw new Error("Frontend evidence is stale. Run npm run evidence:sync.");
} else {
  writeFileSync(output, text);
  console.log(`Updated ${fileURLToPath(output)}`);
}
