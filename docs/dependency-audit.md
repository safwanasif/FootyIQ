# Dependency audit

Checked on September 25, 2026, against the current repository dependency files.

| Scope | Command | Result |
| --- | --- | --- |
| npm workspace dependency tree | `npm audit --json` | 0 reported vulnerabilities; 583 dependencies reported by npm |
| ML runtime requirements and resolved dependencies | `python -m pip_audit -r services/ml/requirements.txt --progress-spinner off` | No known vulnerabilities found |

The Python audit used pip-audit 2.10.1 in an isolated temporary Python 3.12 environment on Windows. It resolved the requirements with dependencies enabled; it did not modify the application environment. Platform-specific Linux packages and container OS packages are not covered by this result. Advisory results are a point-in-time check, not proof that software is vulnerability-free.

The first npm attempt could not reach the advisory endpoint from the restricted environment. The successful network-enabled retry produced the result above.
