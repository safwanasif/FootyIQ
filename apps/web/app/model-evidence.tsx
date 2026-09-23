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
        <p>Explore the model making your predictions and the larger dataset we use to test improvements. Research results stay separate until a new model earns its place.</p>
        <a className="text-link" href="https://github.com/statsbomb/open-data" target="_blank" rel="noreferrer">Explore StatsBomb Open Data <ArrowUpRight size={16} /></a>
      </div>
      <div className="model-details">
        <div className="evidence-heading"><h3>Current prediction model</h3><span className="evidence-tag">Live in this app</span></div>
        <p className="evidence-description">Distance-and-angle logistic regression. Evaluation dataset: men’s FIFA World Cup shots.</p>
        <dl className="evidence-grid">
          <div><dt>Shots evaluated</dt><dd>{format(serving.shots)}</dd><small>Across {format(serving.matches)} matches</small></div>
          <div><dt>ROC-AUC</dt><dd>{serving.auc.toFixed(3)}</dd><small>Ranking discrimination</small></div>
          <div><dt>Lower Brier score</dt><dd>{serving.brierImprovement.toFixed(1)}<span>%</span></dd><small>Vs. goal-rate baseline</small></div>
        </dl>
        <details className="model-disclosure"><summary>How the current model was evaluated</summary><p>Each shot receives a prediction from a model trained on other matches, using {serving.folds}-fold grouped cross-validation. ROC-AUC measures ranking; Brier score measures probability error, where lower is better. These are scores for the training procedure, not an independent test of the serving artifact.</p><a className="text-link evidence-link" href={`${reportUrl}evaluation.md`} target="_blank" rel="noreferrer">Original evaluation <ArrowUpRight size={14} /></a></details>
        <details className="model-disclosure"><summary>Limitations of today’s predictions</summary><p>Distance and angle omit defenders, goalkeeper position, body part and game context. Penalties and shootouts are excluded. The 20–30% probability bin scored {(serving.calibration20to30 * 100).toFixed(1)}% of the time; higher-probability bins have few shots. Generalization to other competitions and future seasons is not established.</p></details>

        <div className="research-evidence" aria-labelledby="research-title">
          <div className="evidence-heading"><h3 id="research-title">Expanded development dataset</h3><span className="evidence-tag research-tag">Candidate research</span></div>
          <dl className="evidence-grid research-counts">
            <div><dt>Unique shots</dt><dd>{format(research.shots)}</dd><small>Penalties and shootouts excluded</small></div>
            <div><dt>Matches</dt><dd>{format(research.matches)}</dd><small>Whole matches stay together</small></div>
            <div><dt>Competitions</dt><dd>{research.competitions.length}</dd><small>Senior men’s football</small></div>
          </dl>
          <p className="research-finding"><strong>{uncertain ? "More shots alone did not establish a gain." : "The scaling comparison is available below."}</strong> The larger candidate has not replaced the current model. On the same {format(research.testShots)} held-out shots, Brier score was {research.small.brier.toFixed(5)} with {format(research.small.trainingShots)} training shots and {research.large.brier.toFixed(5)} with {format(research.large.trainingShots)}. Lower is better.{uncertain ? " The uncertainty interval includes no difference." : ""}</p>
          <details className="model-disclosure">
            <summary>See all {research.competitions.length} competitions, seasons and shot counts</summary>
            <p>StatsBomb Open Data, seasons starting in 2015 onward. Coverage is selective: some competitions include only certain teams or finals. These counts describe our sample, not complete league coverage.</p>
            <div className="source-table-wrap"><table className="source-table"><caption>Expanded dataset by competition</caption><thead><tr><th scope="col">Competition / seasons</th><th scope="col">Matches</th><th scope="col">Shots</th></tr></thead><tbody>{research.competitions.map((item) => <tr key={item.name}><th scope="row">{item.name}<small>{item.seasons.join(", ")}</small></th><td>{format(item.matches)}</td><td>{format(item.shots)}</td></tr>)}</tbody></table></div>
          </details>
          <details className="model-disclosure"><summary>Source, reproducibility and fair comparisons</summary><p>Data source: StatsBomb. The acquisition pipeline pins source revision <code>{research.revision.slice(0, 12)}</code>, checks unique shot IDs and records source hashes. The scaling experiment uses the same {format(research.testMatches)} test matches for each training size. Its scores cannot be directly compared with the World Cup-only scores above because the test populations differ.</p><div className="evidence-links"><a className="text-link" href={`${reportUrl}expanded/comparison.md`} target="_blank" rel="noreferrer">Scaling experiment <ArrowUpRight size={14} /></a><a className="text-link" href={`${reportUrl}expanded/evaluation.md`} target="_blank" rel="noreferrer">Expanded evaluation <ArrowUpRight size={14} /></a><a className="text-link" href={`${reportUrl}expanded/dataset.json`} target="_blank" rel="noreferrer">Dataset manifest <ArrowUpRight size={14} /></a></div></details>
        </div>
        <details className="model-disclosure final-review">
          <summary>Final v1 model review: current model retained</summary>
          <p>We compared linear, spline and boosted geometry models. A boosted candidate was selected using match-grouped cross-validation before testing {format(modelReview.shots)} previously unused shots across {format(modelReview.matches)} matches. Its measured scores were slightly better, but the uncertainty interval did not meet our predefined replacement rule. Model experimentation for v1 is complete.</p>
          <div className="source-table-wrap"><table className="source-table"><caption>Same final test, lower probability error is better</caption><thead><tr><th scope="col">Model</th><th scope="col">Log loss</th><th scope="col">Brier</th></tr></thead><tbody><tr><th scope="row">Current model</th><td>{modelReview.metrics.serving.log_loss.toFixed(5)}</td><td>{modelReview.metrics.serving.brier_score.toFixed(5)}</td></tr><tr><th scope="row">Boosted candidate</th><td>{modelReview.metrics.candidate.log_loss.toFixed(5)}</td><td>{modelReview.metrics.candidate.brier_score.toFixed(5)}</td></tr></tbody></table></div>
          <p>Final-test sources: {modelReview.competitions.map((item) => `${item.name} (${format(item.shots)} shots)`).join("; ")}. Candidate minus current-model Brier difference: {modelReview.brierInterval.difference.toFixed(6)}, with a 95% interval from {modelReview.brierInterval.lower_95.toFixed(6)} to {modelReview.brierInterval.upper_95.toFixed(6)}. The interval includes zero.</p>
          <a className="text-link evidence-link" href={`${reportUrl}model-selection/decision.md`} target="_blank" rel="noreferrer">Final model decision <ArrowUpRight size={14} /></a>
        </details>
        <p className="data-credit">Source: StatsBomb Open Data · Counts and metrics generated from versioned reports</p>
      </div>
    </section>
  );
}
