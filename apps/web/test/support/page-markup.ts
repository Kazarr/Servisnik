// Reading the markup of a page rendered over real data (see render-page.ts): its tables, its detail lists and its links, as text.

/** The text of `markup` as a reader sees it: the tags are gone and the entities React wrote are the characters again. */
export const textOf = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&amp;', '&');

/** The cells of every row of the body of every table in the markup, as text. The rows of a header have `<th>` and are not among them. */
export const rowsOf = (html: string) =>
  [...html.matchAll(/<tr[^>]*>\s*<td[^>]*>[\s\S]*?<\/tr>/g)].map(([row]) => [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(([, cell]) => textOf(cell!)));

/** The label and the value of every line of the detail lists in the markup, as text. */
export const detailsOf = (html: string) => [...html.matchAll(/<dt>([\s\S]*?)<\/dt><dd>([\s\S]*?)<\/dd>/g)].map(([, label, value]) => [textOf(label!), textOf(value!)]);

/** The text and the address of every link in the markup. */
export const linksIn = (html: string) =>
  [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attributes, inner]) => ({ text: textOf(inner!), href: textOf(/href="([^"]*)"/.exec(attributes!)![1]!) }));

/** The address of the link with exactly this text; the test fails right there when the markup has none. */
export function hrefOf(html: string, text: string) {
  const found = linksIn(html).find((link) => link.text === text);
  if (!found) throw new Error(`No link with the text ${text}.`);
  return found.href;
}
