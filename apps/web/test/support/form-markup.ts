import { textOf } from './page-markup.ts';

// Reading the markup of a form rendered with renderToStaticMarkup, for the tests of the forms of items.

/** The `<input>` of the field with this name, as markup, or null when the form has none. */
export function input(html: string, name: string) {
  return new RegExp(`<input[^>]*\\sname="${name}"[^>]*>`).exec(html)?.[0] ?? null;
}

/** What the `value` of the `<input>` of the field with this name starts with, or null when the form has no such input or it has no value. */
export function valueOf(html: string, name: string) {
  return /\svalue="([^"]*)"/.exec(input(html, name) ?? '')?.[1] ?? null;
}

/**
 * The reason a field was refused, as a screen reader reads it: the text of the element the control's `aria-describedby`
 * names. Null when the form has no such control, or the control has no reason.
 */
export function reasonOf(html: string, name: string) {
  const control = new RegExp(`<(?:input|select|textarea)[^>]*\\sname="${name}"[^>]*>`).exec(html)?.[0];
  const id = /\saria-describedby="([^"]*)"/.exec(control ?? '')?.[1];
  const reason = id && new RegExp(`<p id="${id}"[^>]*>([\\s\\S]*?)</p>`).exec(html)?.[1];
  return reason ? textOf(reason) : null;
}

/** The options of the `<select>` of the field with this name: their values in order, and which one is selected. */
export function options(html: string, name: string) {
  const select = new RegExp(`<select[^>]*\\sname="${name}"[^>]*>(.*?)</select>`).exec(html)?.[1];
  if (select === undefined) throw new Error(`No select named ${name}.`);
  const all = [...select.matchAll(/<option([^>]*)>/g)].map(([, attributes]) => attributes!);
  return { values: all.map((attributes) => /value="([^"]*)"/.exec(attributes)![1]), selected: all.filter((attributes) => /selected/.test(attributes)).map((attributes) => /value="([^"]*)"/.exec(attributes)![1]) };
}
