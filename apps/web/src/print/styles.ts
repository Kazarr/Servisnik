// The look of a printed form. Chromium prints a form from a string of HTML, outside the page of the app, so it
// cannot read globals.css: the tokens are repeated here, and test/design-tokens.test.ts holds them to the app's.

/** The margins of every printed page. The footer lives in the bottom one. */
export const pageMargins = { top: '15mm', right: '15mm', bottom: '20mm', left: '15mm' } as const;

/**
 * The `:root` of a printed page: the app's tokens that it uses, with their values, and the ones only print
 * needs. The root size is 10 pt, so every length in rem is a length on the paper. The font is not the app's
 * `system-ui`, which is whatever the machine has (in the image it was a Chinese font): a form names Arial, and
 * a machine without it, like the image, answers with Liberation Sans, which has the same metrics and the Slovak letters.
 */
export const printTokens = `:root {
  --color-text: #1c2430;
  --color-text-muted: #5a6677;
  --color-border: #d3d9e2;
  --color-surface: #f3f5f8;
  --color-letterhead-bar: #050505;
  --color-letterhead-text: #ffffff;
  --color-letterhead-line: #e0a446;
  --font-family-print: Arial, 'Liberation Sans', Helvetica, sans-serif;
  --font-size-base: 1rem;
  --font-size-title: 1.5rem;
  --font-size-heading: 1.25rem;
  --font-weight-medium: 500;
  --font-weight-bold: 700;
  --line-height-base: 1.5;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 1rem;
  --space-4: 1.5rem;
  --space-5: 2rem;
  --border-width: 1px;
  --border-width-strong: 2px;
  --width-full: 100%;
  --track-fill: minmax(0, 1fr);

  --font-size-print: 10pt;
  --font-size-footer: 8pt;
  --page-margin-x: ${pageMargins.left};
  --logo-print-width: 6rem;
  --logo-print-height: 2.75rem;
  --write-line-width: 10rem;
  --signature-width: 16rem;
  --signature-space: 3rem;
}`;

/**
 * The style of a printed document: the header with the details of the autoservis, the customer and the vehicle,
 * and what every form is made of (facts, a block of text, a line to write on, a line to sign on).
 */
export const documentCss = `${printTokens}

html {
  font-size: var(--font-size-print);
}

body {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-family-print);
  font-size: var(--font-size-base);
  line-height: var(--line-height-base);
}

p,
h1,
h2,
dl,
dd {
  margin: 0;
}

.letterhead {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  padding-bottom: var(--space-3);
  border-bottom: var(--border-width-strong) solid var(--color-text);
}

/*
 * The two Hlavičky tlačív. The paper is white, and the logo of the autoservis is white on a black square, so on the
 * white header it is inverted (black on white), and on the black bar the square takes the colour of the bar (screen
 * leaves the lighter of the two, which is the white letters). The bar spans the text of the page: Chromium clips a
 * page to its margins, so it cannot run to the edge of the paper. The thin line under it is gold.
 */
.letterhead-white .logo {
  filter: invert(1);
}

.letterhead-black-bar {
  padding: var(--space-3);
  border-bottom-color: var(--color-letterhead-line);
  background: var(--color-letterhead-bar);
  color: var(--color-letterhead-text);
}

.letterhead-black-bar .logo {
  mix-blend-mode: screen;
}

.letterhead-black-bar .facts dt {
  color: var(--color-letterhead-text);
}

.workshop {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

/* A box of one size, filled by the logo and cut to it: the logo of the demo is a square with an empty margin, which "cover" takes off. */
.logo {
  display: block;
  width: var(--logo-print-width);
  height: var(--logo-print-height);
  object-fit: cover;
}

.workshop-details p {
  white-space: pre-line;
}

.workshop-name {
  font-size: var(--font-size-heading);
  font-weight: var(--font-weight-bold);
}

.identity {
  text-align: right;
}

.identity h1 {
  font-size: var(--font-size-title);
}

.identity .facts {
  justify-content: end;
  margin-top: var(--space-2);
}

/* A term and its value on one row, the terms aligned: the number of the order, the VIN, the kilometres. */
.facts {
  display: grid;
  grid-template-columns: max-content var(--track-fill);
  gap: var(--space-1) var(--space-3);
}

.facts div {
  display: contents;
}

.facts dt {
  color: var(--color-text-muted);
  text-align: left;
}

.facts dd {
  font-weight: var(--font-weight-medium);
  overflow-wrap: anywhere;
  text-align: left;
}

.parties {
  display: grid;
  grid-template-columns: var(--track-fill) var(--track-fill);
  gap: var(--space-4);
  margin: var(--space-4) 0;
}

.party {
  padding: var(--space-3);
  border: var(--border-width) solid var(--color-border);
  background: var(--color-surface);
}

.party h2,
main h2 {
  color: var(--color-text-muted);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
}

.party-name {
  font-size: var(--font-size-heading);
  font-weight: var(--font-weight-bold);
}

/* A part of a form does not break across two pages. */
main section {
  margin-bottom: var(--space-4);
  break-inside: avoid;
}

.request {
  margin-top: var(--space-1);
  padding: var(--space-3);
  border: var(--border-width) solid var(--color-border);
  white-space: pre-line;
}

.write-line {
  display: inline-block;
  width: var(--write-line-width);
  border-bottom: var(--border-width) solid var(--color-text);
}

.signature {
  padding-top: var(--signature-space);
}

.signature-line {
  width: var(--signature-width);
  padding-top: var(--space-1);
  border-top: var(--border-width) solid var(--color-text);
  color: var(--color-text-muted);
}

/* Two signatures side by side: the customer's and the autoservis's. */
.signatures {
  display: flex;
  justify-content: space-between;
  padding-top: var(--signature-space);
}

/*
 * The list of items of a form. It is the one part that may break across pages, and it does so between rows: the
 * head of the table (a thead) is printed again on each page, a row stays whole, and a name longer than its column wraps.
 */
main h2 {
  break-after: avoid;
}

main section.items {
  break-inside: auto;
}

.lines {
  width: var(--width-full);
  margin-top: var(--space-2);
  border-collapse: collapse;
}

.lines th,
.lines td {
  padding: var(--space-1) var(--space-2);
  border-bottom: var(--border-width) solid var(--color-border);
  text-align: left;
  vertical-align: top;
}

.lines th {
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-weight: var(--font-weight-medium);
}

.lines tr {
  break-inside: avoid;
}

.lines td:not(.amount) {
  overflow-wrap: anywhere;
}

.lines .amount {
  text-align: right;
}

.lines td.amount {
  white-space: nowrap;
}

.code {
  color: var(--color-text-muted);
}

/* The sums under the list of items, to the right, with the total with VAT in bold. */
.totals .facts {
  grid-template-columns: max-content max-content;
  justify-content: end;
}

.totals dd {
  text-align: right;
}

.totals .grand dt,
.totals .grand dd {
  color: var(--color-text);
  font-weight: var(--font-weight-bold);
}
`;

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
  font-family: var(--font-family-print);
  font-size: var(--font-size-footer);
  text-align: right;
}
</style>
<div class="footer">Strana <span class="pageNumber"></span>/<span class="totalPages"></span></div>`;
