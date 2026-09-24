# Shot-context audit

Audited all 30,011 development shots across 1,206 matches against the pinned cached source hashes and exact event membership. No new test event outcomes were inspected. Detailed counts by competition and observed context combinations are in [audit.json](audit.json).

| Input | Coverage / finding |
| --- | --- |
| Body part | Complete: 4,966 headers, 9,464 left-foot, 15,483 right-foot, 98 other |
| Technique | Complete: 23,038 normal, 4,329 half volleys, 1,936 volleys; four smaller categories |
| Shot type | Complete: 28,615 open play, 1,386 direct free kicks, 10 direct corners |
| Play pattern | Complete: nine build-up categories, including 4,856 from corners |
| Pressure | 7,321 true; 22,690 absent keys |
| First time | 9,238 true; 20,773 absent keys |

Body part, technique, shot type and play pattern are suitable for the bounded experiment. Complete recording does not prove consistent annotation quality or predictive value. Rare categories and sparse combinations must not become confidently presented UI options. Pressure and first-time flags are excluded pending a separate semantic/coverage investigation; absence is not treated as an observed negative in this audit.

## Fresh-test feasibility

The same pinned eligible catalog has 926 matches outside development, original World Cup evaluation, and the previous final test: La Liga 347, Ligue 1 229, Premier League 174, Serie A 176. No eligible new-match coverage remains in the other sampled competitions. These are candidate matches, not verified eligible shot counts, and cannot establish generalization across all 12 competitions.

Proceed with the [frozen experiment protocol](protocol.md). Select and freeze the candidate before acquiring the new 3,000-shot test. If that target cannot be met, retain the current serving model.

## Reproduction

From the repository root in PowerShell, with the existing pinned source cache and expanded CSV:

```powershell
.\services\ml\venv\Scripts\python.exe services/ml/audit_context.py
```

This audit has no network fetching and does not train or replace a model. Missing cached files or mismatched hashes fail the audit instead of silently changing its data.
