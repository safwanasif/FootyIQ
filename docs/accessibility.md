# Accessibility verification

The September 25 [release CI run](https://github.com/safwanasif/FootyIQ/actions/runs/36205753253) passed axe checks for WCAG 2 A/AA and WCAG 2.1 AA rules at desktop (1280 px) and mobile (360 px) widths, with explanatory disclosures expanded. It also checked for horizontal page overflow. The review corrected invalid definition-list markup in the model evidence.

Browser regression tests verify keyboard activation of the competition disclosure, prediction/history error recovery, and understandable unsupported-distance feedback. The pitch supports arrow keys and Shift for larger steps, context selectors have labels, predictions use a polite live region, and the page has a skip link.

These checks do not establish full WCAG conformance. A hands-on NVDA/VoiceOver review has not been completed; in particular, the usability of pitch navigation and live prediction announcements with a screen reader remains unverified. This limitation must remain visible in release documentation rather than being represented as a passed manual screen-reader test.
