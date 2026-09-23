# FootyIQ portfolio guide

## A two-minute demo

1. Start the backend with Docker Compose, then run `npm run dev:web` and open `http://localhost:3000`.
2. Choose **Central chance**. Explain that xG is a probability estimate based on distance and angle, rather than a prediction that this specific shot will score.
3. Pin the central chance, then choose **Tight angle**. Point out the lower xG and the difference in **percentage points**. The outlined marker keeps the reference position visible.
4. Drag the marker or use the arrow keys. The API returns model predictions; outdated requests are cancelled or ignored.
5. Save a chance. Revisit it from the collection, reload the page, and export the visible page as CSV.
6. Open **The model**. Explain match-grouped evaluation, the baseline comparison, and the calibration limitations. Follow the link to the reproducible report.
7. Show the green GitHub Actions run and the API/database integration test. Distinguish local verification from a production deployment.

## Resume bullets

Use the claims that match what you can explain and demonstrate:

- Built a full-stack football analytics app with Next.js, a TypeScript/Express gateway, a FastAPI inference service, and PostgreSQL; implemented interactive shot placement, probability comparisons, persistent history, and CSV export.
- Evaluated a distance-and-angle logistic regression on 3,770 shots across 147 matches using grouped cross-validation, achieving 0.758 ROC-AUC and a 9.7% lower Brier score than a training-fold goal-rate baseline.
- Added idempotent saves, transactional schema migrations, database readiness checks, API failure tests, and GitHub Actions checks; verified PostgreSQL persistence and the browser save/revisit workflow.

The performance numbers describe cross-validation of the training procedure on the local dataset. Do not describe them as production accuracy, an external benchmark, or proof of generalization to every competition. The app currently separates anonymous browser collections with private cookies; do not describe that as user accounts, cross-device recovery, or public deployment.

## Engineering decisions worth discussing

- **Gateway boundary:** the browser only calls Express. It does not hold database credentials or call the Python service directly.
- **Server-owned saved results:** saves accept coordinates and an ID; the gateway derives geometry and requests the prediction before storing it.
- **Safe retries:** a unique save ID returns the existing record on retry and rejects reuse for a different position.
- **Migration safety:** startup applies versioned migrations inside a transaction with a PostgreSQL advisory lock.
- **Interaction correctness:** shot requests are debounced, aborted when superseded, and guarded against stale results. Pointer conversion accounts for the SVG viewBox.
- **Honest evaluation:** matches stay together across folds, and the baseline learns its goal rate only from each training fold. Calibration bins show where estimates are unreliable.

## Remaining release work

- Review anonymous collection behavior for the public demo, including cookie retention and the lack of account recovery.
- Configure production secrets, request limits, HTTPS, database backups, and service monitoring.
- Deploy and test a clean installation and full workflow on the public URL.
- Record the demo and add the public URL and screenshots to the README and resume.

## Expanded research evidence

- Built a reproducible StatsBomb acquisition pipeline for 30,011 unique non-penalty shots across 1,206 matches and 12 men's competitions; compared nested training sizes using a fixed match holdout and paired match-bootstrap uncertainty.

This is a valid additional résumé bullet. Do not claim that scaling improved accuracy: the experiment did not establish a gain. See the [comparison](../services/ml/reports/expanded/comparison.md) and [remaining release checklist](release-checklist.md).
