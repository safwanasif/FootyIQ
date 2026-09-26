# FootyIQ portfolio guide

## A two-minute demo

Use the [timed narration and recording script](demo-script.md) when capturing a video. A [silent automated walkthrough](media/footyiq-demo.webm) is included; it demonstrates the app against isolated CI services.

1. Open [the live demo](https://footy-iq-web.vercel.app/). If the free backend is waking up, retry after about a minute. For a local demo, start Docker Compose and `npm run dev:web`.
2. Choose **Central chance**. Explain that xG is a probability estimate based on geometry and the displayed shot context, rather than a prediction that this specific shot will score.
3. Pin the central chance, then choose **Tight angle**. Point out the lower xG and the difference in **percentage points**. The outlined marker keeps the reference position visible.
4. Drag the marker or use the arrow keys. The API returns model predictions; outdated requests are cancelled or ignored.
5. Save a chance. Revisit it from the collection, reload the page, and export the visible page as CSV.
6. Open **The model**. Explain match-grouped evaluation, the baseline comparison, and the calibration limitations. Follow the link to the reproducible report.
7. Show a passing GitHub Actions run and the API/database integration test. Explain the Vercel frontend, Render backend, and Neon database, including free-tier sleeping behavior.

## Resume bullets

Use the claims that match what you can explain and demonstrate:

- Built and deployed a full-stack expected-goals app with an interactive pitch, shot comparisons, persistent collections, and CSV export.
- Trained a gradient-boosted model on 30,011 StatsBomb shots across 12 competitions, achieving 0.819 ROC-AUC and 6.2% lower Brier score than the geometry baseline on 3,009 held-out shots.
- Implemented validated API requests, idempotent saves, transactional database migrations, and cookie-scoped collections; verified isolation and persistence after a service restart.
- Automated API, model, browser, and container checks with GitHub Actions; deployed the frontend, inference backend, and database on Vercel, Render, and Neon.

Suggested heading: **FootyIQ — Soccer Analytics | Next.js, TypeScript, FastAPI, PostgreSQL, Docker**. Link the project title to the live demo and add the GitHub repository if space permits.

The performance numbers describe the frozen context model's fresh, match-separated test set, following nested match-grouped model selection. They are not cross-validation scores, production accuracy, an external benchmark, or proof of generalization to every competition. The 6.2% figure is a relative reduction in Brier score against the geometry baseline on the same test set, not a percentage-point increase in classification accuracy. Anonymous cookie-scoped collections are not user accounts or cross-device recovery.

## Engineering decisions worth discussing

- **Gateway boundary:** the deployed browser calls same-origin Next.js routes, which authenticate requests to Express; Python listens inside the backend container. The browser holds no database or proxy credentials.
- **Server-owned saved results:** saves accept coordinates, shot context, and an ID; the gateway derives geometry and requests the prediction before storing it.
- **Safe retries:** a unique save ID returns the existing record on retry and rejects reuse for a different position or context.
- **Migration safety:** startup applies versioned migrations inside a transaction with a PostgreSQL advisory lock.
- **Interaction correctness:** shot requests are debounced, aborted when superseded, and guarded against stale results. Pointer conversion accounts for the SVG viewBox.
- **Honest evaluation:** matches stay together across folds, and the baseline learns its goal rate only from each training fold. Calibration bins show where estimates are unreliable.

## Remaining release work

- Production backup/restore and the idle-to-awake recovery check both passed.
- Finish manual assistive-technology review; automated accessibility checks, dependency audits and attribution are complete.
- Screenshots and a silent demo are included. Tag the release after the remaining checklist gates are resolved.

The public URL, HTTPS, production secrets, proxy-aware request limits, cookie isolation, CSV export, and persistence after a backend restart were verified on September 25. See [deployment evidence](free-deployment.md).

## Expanded research evidence

- Built a reproducible StatsBomb acquisition pipeline for 30,011 unique non-penalty shots across 1,206 matches and 12 men's competitions; compared nested training sizes using a fixed match holdout and paired match-bootstrap uncertainty.

This is a valid additional résumé bullet. Do not claim that scaling improved accuracy: the experiment did not establish a gain. See the [comparison](../services/ml/reports/expanded/comparison.md) and [remaining release checklist](release-checklist.md).

## Completed v1 model comparison

Compared three fixed geometry models using nested match-grouped validation, then evaluated the selected candidate on 3,014 previously unused shots. The boosted candidate improved point estimates but failed the predefined uncertainty-based promotion rule; kept the linear algorithm and subsequently released its 30,011-shot fit for broader competition coverage. This supports an interview discussion of selection bias, probability scoring, grouped evaluation, and release decisions, without claiming a statistically established accuracy improvement.

This geometry-only experiment is historical. The subsequent bounded context experiment qualified the current gradient-boosted model on a separate 3,009-shot test set. Its [decision](../services/ml/reports/context/decision.md) supports the current resume metrics. The [fixed release roadmap](release-roadmap.md) controls remaining release work; further model searches are deferred.
