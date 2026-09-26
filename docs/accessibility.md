# Accessibility verification

The September 25 [release CI run](https://github.com/safwanasif/FootyIQ/actions/runs/36205753253) passed axe checks for WCAG 2 A/AA and WCAG 2.1 AA rules at desktop (1280 px) and mobile (360 px) widths, with explanatory disclosures expanded. It also checked for horizontal page overflow. The review corrected invalid definition-list markup in the model evidence.

Browser regression tests verify keyboard activation of the competition disclosure, prediction/history error recovery, and understandable unsupported-distance feedback. The pitch supports arrow keys and Shift for larger steps, context selectors have labels, predictions use a polite live region, and the page has a skip link.

These checks do not establish full WCAG conformance. A hands-on NVDA/VoiceOver review has not been completed; in particular, the usability of pitch navigation and live prediction announcements with a screen reader remains unverified. This limitation must remain visible in release documentation rather than being represented as a passed manual screen-reader test.

## Manual release check

Run this after the cold-start check, so opening the page does not interrupt the idle period. Use a screen reader available on the tester's computer, and record its name, browser, date and any failures.

1. Use Tab from the page start. Confirm the skip link is announced and moves to shot analysis, and that focus is visible.
2. Reach the interactive pitch. Confirm its label and keyboard instructions are understandable. Move with arrow keys (and Shift for larger steps); confirm the updated chance is announced without trapping focus.
3. Reach the Body part selector and change to Head. Confirm its label, selected value and resulting probability are understandable.
4. Choose Long range. Confirm the unsupported-distance message is announced and saving is unavailable. Return to Central chance.
5. Reach the collection controls and a saved shot's Revisit button. Confirm meaningful labels and successful keyboard activation.
6. Open a model-evidence disclosure using the keyboard. Confirm its expanded state and content can be read, then move onward normally.

Report actual outcomes rather than marking this passed solely because the accessibility tree contains labels. A failed item should include the control, expected behavior and what was heard or observed.
