import { ArrowUpRight } from "lucide-react";
import report from "../../../services/ml/reports/evaluation.json";

export default function ModelEvidence() {
  const improvement = (1 - report.model.brier_score / report.goal_rate_baseline.brier_score) * 100;
  return (
    <section className="model-section" aria-labelledby="model-title">
      <div className="model-intro"><p className="eyebrow">04 / Behind the prediction</p><h2 id="model-title">A model you can <br />look inside.</h2><p>Two inputs: distance and angle. One interpretable logistic regression model, evaluated on shots from held-out matches.</p><a className="text-link" href="https://github.com/safwanasif/FootyIQ/blob/main/services/ml/reports/evaluation.md" target="_blank" rel="noreferrer">Read the evaluation report <ArrowUpRight size={16} /></a></div>
      <div className="model-details">
        <dl className="evidence-grid"><div><dt>Shots evaluated</dt><dd>{report.shots.toLocaleString("en-US")}</dd><small>Across {report.matches} matches</small></div><div><dt>ROC-AUC</dt><dd>{report.model.roc_auc.toFixed(3)}</dd><small>Ranking discrimination</small></div><div><dt>Lower Brier score</dt><dd>{improvement.toFixed(1)}<span>%</span></dd><small>Vs. goal-rate baseline</small></div></dl>
        <details className="model-disclosure"><summary>What these numbers mean</summary><p>Each shot receives a prediction from a model trained on other matches, using {report.fold_count}-fold grouped cross-validation. ROC-AUC measures how well the model ranks goals above non-goals. Brier score measures probability error; lower is better. This evaluates the training procedure on the local dataset, not an independent test of the serving model.</p></details>
        <details className="model-disclosure"><summary>Where the model falls short</summary><p>Distance and angle leave out defenders, goalkeeper position, body part and game context. Penalties and shootouts are excluded from the evaluation. Calibration is imperfect: the 20–30% bin scored about 17.6% of the time. High-probability bins contain few shots. Performance on other competitions and future seasons is not established.</p></details>
        <p className="data-credit">Training data: StatsBomb open data · Geometry-only baseline</p>
      </div>
    </section>
  );
}
