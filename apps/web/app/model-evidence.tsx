import { ArrowUpRight } from "lucide-react";
import evidence from "../lib/model-evidence.json";

const format = (value: number) => value.toLocaleString("en-US");
const reportUrl = "https://github.com/safwanasif/FootyIQ/blob/main/services/ml/reports/";

export default function ModelEvidence() {
  const { serving, research, modelReview } = evidence;
  const uncertain = research.brierDifference.lower_95 <= 0 && research.brierDifference.upper_95 >= 0;
  return (
    <section className="model-section" aria-labelledby="model-title">
      <div className="model-intro">
        <p className="eyebrow">04 / Behind the prediction</p>
        <h2 id="model-title">Evidence behind <br />every estimate.</h2>
        <p>A shot-context model trained on real shots across multiple competitions. Explore its training data, measured performance and limitations.</p>
        <a className="text-link" href="https://github.com/statsbomb/open-data" target="_blank" rel="noreferrer">Explore StatsBomb Open Data <ArrowUpRight size={16} /></a>
      </div>
      <div className="model-details">
        <div className="evidence-heading"><h3>Current prediction model</h3><span className="evidence-tag">Live in this app</span></div>
        <p className="evidence-description">Gradient boosting using distance, angle, body part, technique, shot type and build-up, trained across {research.competitions.length} men’s competitions. Model: {serving.id}.</p>
        <dl className="evidence-grid">
          <div><dt>Training shots</dt><dd>{format(serving.shots)}</dd><small>Across {format(serving.matches)} matches</small></div>
          <div><dt>ROC-AUC</dt><dd>{serving.auc.toFixed(3)}</dd><small>On the fresh test set</small></div>
          <div><dt>Lower Brier score</dt><dd>{serving.brierImprovement.toFixed(1)}<span>%</span></dd><small>Vs. previous geometry model</small></div>
        </dl>
        <details className="model-disclosure"><summary>How the current model was evaluated</summary><p>The model was selected using nested match-grouped cross-validation, then fitted on all 30,011 development shots. Headline scores come from its separate test on 3,009 previously unused shots across 121 matches. These test shots were never used for training. ROC-AUC measures ranking, not percent accuracy; lower Brier means lower probability error.</p><a className="text-link evidence-link" href={`${reportUrl}context/selection.md`} target="_blank" rel="noreferrer">Training evaluation <ArrowUpRight size={14} /></a></details>
        <details className="model-disclosure"><summary>Limitations of today’s predictions</summary><p>The model includes shot context but omits defender and goalkeeper positions. Penalties and shootouts are excluded. On the fresh test, the 20–30% probability bin scored {(serving.calibration20to30 * 100).toFixed(1)}% of the time; higher-probability bins have few shots. The sample is selective; future-season and all-competition performance is not established.</p></details>

        <div className="research-evidence" aria-labelledby="research-title">
          <div className="evidence-heading"><h3 id="research-title">Training data & sources</h3><span className="evidence-tag research-tag">Used by this model</span></div>
          <dl className="evidence-grid research-counts">
            <div><dt>Unique shots</dt><dd>{format(research.shots)}</dd><small>Penalties and shootouts excluded</small></div>
            <div><dt>Matches</dt><dd>{format(research.matches)}</dd><small>Whole matches stay together</small></div>
            <div><dt>Competitions</dt><dd>{research.competitions.length}</dd><small>Senior men’s football</small></div>
          </dl>
          <p className="research-finding"><strong>{uncertain ? "More shots alone did not establish a gain." : "The scaling comparison is available below."}</strong> That earlier geometry-only experiment is separate from the subsequent context-model improvement. On the same {format(research.testShots)} held-out shots, Brier score was {research.small.brier.toFixed(5)} with {format(research.small.trainingShots)} training shots and {research.large.brier.toFixed(5)} with {format(research.large.trainingShots)}. Lower is better.{uncertain ? " The uncertainty interval includes no difference." : ""}</p>
          <details className="model-disclosure">
            <summary>See all {research.competitions.length} competitions, seasons and shot counts</summary>
            <p>StatsBomb Open Data, seasons starting in 2015 onward. Coverage is selective: some competitions include only certain teams or finals. These counts describe our sample, not complete league coverage.</p>
            <div className="source-table-wrap"><table className="source-table"><caption>Expanded dataset by competition</caption><thead><tr><th scope="col">Competition / seasons</th><th scope="col">Matches</th><th scope="col">Shots</th></tr></thead><tbody>{research.competitions.map((item) => <tr key={item.name}><th scope="row">{item.name}<small>{item.seasons.join(", ")}</small></th><td>{format(item.matches)}</td><td>{format(item.shots)}</td></tr>)}</tbody></table></div>
          </details>
          <details className="model-disclosure"><summary>Source, reproducibility and fair comparisons</summary><p>Data source: StatsBomb. The acquisition pipeline pins source revision <code>{research.revision.slice(0, 12)}</code>, checks unique shot IDs and records source hashes. The scaling experiment uses the same {format(research.testMatches)} test matches for each training size. Scaling, cross-validation and final-test scores use different test populations and must not be compared directly.</p><div className="evidence-links"><a className="text-link" href={`${reportUrl}expanded/comparison.md`} target="_blank" rel="noreferrer">Scaling experiment <ArrowUpRight size={14} /></a><a className="text-link" href={`${reportUrl}expanded/evaluation.md`} target="_blank" rel="noreferrer">Expanded evaluation <ArrowUpRight size={14} /></a><a className="text-link" href={`${reportUrl}expanded/dataset.json`} target="_blank" rel="noreferrer">Dataset manifest <ArrowUpRight size={14} /></a></div></details>
        </div>
        <details className="model-disclosure final-review">
          <summary>Final v1 model review: context model</summary>
          <p>The context model passed the predefined promotion rule on {format(modelReview.shots)} unused shots from {format(modelReview.matches)} matches. Log loss was {modelReview.metrics.candidate.log_loss.toFixed(4)} versus {modelReview.metrics.serving.log_loss.toFixed(4)} for the previous geometry model on the same shots.</p>
          <p>Test coverage: {modelReview.competitions.map(item => item.name).join(", ")}. Brier difference: {modelReview.brierInterval.difference.toFixed(6)}, with a 95% match-bootstrap interval from {modelReview.brierInterval.lower_95.toFixed(6)} to {modelReview.brierInterval.upper_95.toFixed(6)}. This supports improvement on this test population; calibration and broader generalization remain limited.</p>
          <a className="text-link evidence-link" href={`${reportUrl}context/decision.md`} target="_blank" rel="noreferrer">Final model decision <ArrowUpRight size={14} /></a>
        </details>
        <p className="data-credit">Source: StatsBomb Open Data · Counts and metrics generated from versioned reports</p>
      </div>
    </section>
  );
}
