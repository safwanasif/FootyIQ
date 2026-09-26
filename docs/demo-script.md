# FootyIQ: two-minute recording script

Record the public app at https://footy-iq-web.vercel.app in a normal desktop browser. Start with Right Foot / Normal / In-play shot / Regular play and Central chance. Wait until Connected. Hide personal tabs and notifications; do not show provider dashboards or credentials.

| Time | Action | Narration |
| --- | --- | --- |
| 0:00–0:15 | Show the title and central chance | "FootyIQ lets you explore the quality of a football chance. It estimates the probability of scoring using shot location and context." |
| 0:15–0:35 | Pin the central chance, then choose Tight angle | "Moving wider changes the view of goal. The pinned comparison shows the difference in percentage points." |
| 0:35–0:55 | Return to Central chance, select Head | "Body part and technique matter too. These are associations learned from match data, not a claim that changing one action causes this exact difference." |
| 0:55–1:10 | Choose Long range while Head is selected | "For this header, the distance is outside the training range. The app withholds an estimate instead of presenting unsupported precision." |
| 1:10–1:30 | Return to Central chance; save, revisit and reload | "Saved chances retain their original context and model version. Collections persist in PostgreSQL and are separated by a private browser cookie." |
| 1:30–1:50 | Open The model | "The model was trained on 30,011 shots from 12 competitions. On 3,009 separate test shots it achieved 0.819 ROC-AUC and 6.2 percent lower Brier score than the geometry baseline. ROC-AUC is a ranking metric, not percent accuracy." |
| 1:50–2:00 | Show README architecture and passing CI | "Next.js connects through an Express gateway to FastAPI inference and PostgreSQL. CI checks the model, API, browser workflow, container and database recovery." |

Use the actual displayed results; do not edit in fabricated responses or remove a failure to imply the recording was uninterrupted. Free hosting can sleep, so record a warm walkthrough and mention that limitation in the accompanying description. Keep a separate cold-start check as release evidence.

Suggested recording description: "Independent expected-goals explorer using StatsBomb Open Data. Live demo: https://footy-iq-web.vercel.app. Code and reproducible model evidence: https://github.com/safwanasif/FootyIQ. Free backend may take about a minute to wake after inactivity."

Recording status: script prepared; no video has been recorded yet.
