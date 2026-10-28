// The HTML of a printed form is built here, not with React: Next refuses `react-dom/server` in a Route
// Handler, and the forms are plain HTML for Chromium anyway. `html` escapes every value it is given, so a
// text of a customer can only ever be text; markup is what `html` itself made, or what a caller wraps in `Html`.

/** Markup that is safe to put in a page as it is. */
export class Html {
  readonly text: string;

  constructor(text: string) {
    this.text = text;
  }
}

const escapes: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** A value as it goes into a page: `Html` as it is, a list item by item, nothing for null, undefined and false, anything else as escaped text. */
const part = (value: unknown): string =>
  value instanceof Html
    ? value.text
    : Array.isArray(value)
      ? value.map(part).join('')
      : value === null || value === undefined || value === false
        ? ''
        : String(value).replace(/[&<>"']/g, (character) => escapes[character]!);

/** A template literal that makes `Html`: the literal parts are markup, the `${values}` are escaped. */
export const html = (strings: TemplateStringsArray, ...values: unknown[]) =>
  new Html(strings.reduce((text, string, index) => text + string + (index < values.length ? part(values[index]) : ''), ''));
