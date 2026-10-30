import { textOf } from './page-markup.ts';

// Reading the markup of a form rendered with renderToStaticMarkup, or of a page that holds one rendered with renderPage.

/** The `<input>` of the field with this name, as markup, or null when the form has none. */
export function input(html: string, name: string) {
  return new RegExp(`<input[^>]*\\sname="${name}"[^>]*>`).exec(html)?.[0] ?? null;
}

/** The control of the field with this name, an `<input>`, a `<select>` or a `<textarea>`, as markup, or null when the form has none. */
const control = (html: string, name: string) => new RegExp(`<(?:input|select|textarea)[^>]*\\sname="${name}"[^>]*>`).exec(html)?.[0] ?? null;

/** What the `value` of the `<input>` of the field with this name starts with, or null when the form has no such input or it has no value. */
export function valueOf(html: string, name: string) {
  return /\svalue="([^"]*)"/.exec(input(html, name) ?? '')?.[1] ?? null;
}

/** What the `<textarea>` of the field with this name holds, as text, or null when the form has none. */
export function areaValue(html: string, name: string) {
  const held = new RegExp(`<textarea[^>]*\\sname="${name}"[^>]*>([\\s\\S]*?)</textarea>`).exec(html)?.[1];
  return held === undefined ? null : textOf(held);
}

/**
 * What names the control of the field with this name, as a screen reader reads it: the text of the `<label>` whose `for` is the control's
 * `id`, so that a label that points anywhere else is none. Null when the form has no such control, or nothing labels it.
 */
export function labelOf(html: string, name: string) {
  const id = /\sid="([^"]*)"/.exec(control(html, name) ?? '')?.[1];
  const label = id && new RegExp(`<label for="${id}"[^>]*>([\\s\\S]*?)</label>`).exec(html)?.[1];
  return label ? textOf(label) : null;
}

/**
 * The reason a field was refused, as a screen reader reads it: the text of the element the control's `aria-describedby`
 * names, which announces itself (`role="alert"`). Null when the form has no such control, or the control has no reason.
 */
export function reasonOf(html: string, name: string) {
  const id = /\saria-describedby="([^"]*)"/.exec(control(html, name) ?? '')?.[1];
  const reason = id && new RegExp(`<p id="${id}" role="alert"[^>]*>([\\s\\S]*?)</p>`).exec(html)?.[1];
  return reason ? textOf(reason) : null;
}

/** The options of the `<select>` of the field with this name: their values and their texts in order, and which values are selected. */
export function options(html: string, name: string) {
  const select = new RegExp(`<select[^>]*\\sname="${name}"[^>]*>(.*?)</select>`).exec(html)?.[1];
  if (select === undefined) throw new Error(`No select named ${name}.`);
  const all = [...select.matchAll(/<option([^>]*)>([^<]*)<\/option>/g)].map(([, attributes, text]) => ({
    value: /value="([^"]*)"/.exec(attributes!)![1],
    selected: /selected/.test(attributes!),
    text: textOf(text!),
  }));
  return { values: all.map(({ value }) => value), labels: all.map(({ text }) => text), selected: all.filter(({ selected }) => selected).map(({ value }) => value) };
}
