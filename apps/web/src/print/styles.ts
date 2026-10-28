// The look of a printed form. Chromium prints a form from a string of HTML, outside the page of the app, so it
// cannot read globals.css: the tokens are repeated here, and test/design-tokens.test.ts holds them to the app's.

/** The margins of every printed page. The footer lives in the bottom one. */
export const pageMargins = { top: '15mm', right: '15mm', bottom: '20mm', left: '15mm' } as const;

/** The `:root` of a printed page: the app's tokens that it uses, and the ones only print needs. */
export const printTokens = `:root {
  --color-text: #1c2430;
  --color-text-muted: #5a6677;
  --font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-size-footer: 8pt;
  --page-margin-x: ${pageMargins.left};
  --width-full: 100%;
}`;

/**
 * The footer of every page, "Strana X/Y": Chromium fills the two spans with the number of the page and
 * the number of pages. It is a document of its own, so it brings the tokens along; a size it does not
 * set is not printed at all.
 */
export const footerTemplate = `<style>
${printTokens}
.footer {
  box-sizing: border-box;
  width: var(--width-full);
  padding: 0 var(--page-margin-x);
  color: var(--color-text-muted);
  font-family: var(--font-family);
  font-size: var(--font-size-footer);
  text-align: right;
}
</style>
<div class="footer">Strana <span class="pageNumber"></span>/<span class="totalPages"></span></div>`;
