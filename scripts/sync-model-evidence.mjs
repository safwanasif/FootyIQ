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
const finalTest = read("services/ml/reports/model-selection/final-test.json");
const selection = read("services/ml/reports/model-selection/selection.json");
if (selection.dataset_sha256 !== dataset.dataset_sha256 || selection.candidate_sha256 !== finalTest.artifact_hashes.candidate) {
  throw new Error("Final model review does not match the selected model/development dataset.");
}
if (finalTest.promotion_eligible || finalTest.selected !== "boosted") {
  throw new Error("The model decision changed; update the review copy before publishing.");
}
const servingHash = createHash("sha256").update(readFileSync(new URL(`services/ml/artifacts/${manifest.artifact}`, root))).digest("hex");
if (servingHash !== manifest.artifact_sha256 || servingHash !== finalTest.artifact_hashes.expanded_linear || manifest.dataset_sha256 !== dataset.dataset_sha256 || manifest.training_shots !== dataset.shots || manifest.training_matches !== dataset.matches.length) {
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
const summary = {
  serving: { id: manifest.model_id, shots: manifest.training_shots, matches: manifest.training_matches, folds: expanded.fold_count,
    auc: expanded.model.roc_auc, brierImprovement: (1 - expanded.model.brier_score / expanded.goal_rate_baseline.brier_score) * 100,
    calibration20to30: expanded.calibration.find((bin) => bin.lower === .2)?.goal_rate },
  research: { shots: dataset.shots, matches: dataset.matches.length, revision: dataset.revision,
    competitions, testShots: comparison.test_shots, testMatches: comparison.test_matches,
    small: comparison.experiments.mixed_3770, large: comparison.experiments.mixed_all,
    brierDifference: comparison.paired_brier_large_minus_small },
  modelReview: { selected: finalTest.selected, shots: finalTest.test_shots, matches: finalTest.test_matches,
    promotionEligible: finalTest.promotion_eligible,
    competitions: Object.entries(finalTest.results.candidate.by_competition).map(([name, metrics]) => ({ name, shots: metrics.shots })),
    metrics: Object.fromEntries(Object.entries(finalTest.results).map(([name, item]) => [name, item.metrics])),
    brierInterval: finalTest.paired_brier_candidate_minus_reference.expanded_linear },
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
