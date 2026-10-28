// Reading the markup of a form rendered with renderToStaticMarkup, for the tests of the forms of items.

/** The `<input>` of the field with this name, as markup, or null when the form has none. */
export function input(html: string, name: string) {
  return new RegExp(`<input[^>]*\\sname="${name}"[^>]*>`).exec(html)?.[0] ?? null;
}

/** The options of the `<select>` of the field with this name: their values in order, and which one is selected. */
export function options(html: string, name: string) {
  const select = new RegExp(`<select[^>]*\\sname="${name}"[^>]*>(.*?)</select>`).exec(html)?.[1];
  if (select === undefined) throw new Error(`No select named ${name}.`);
  const all = [...select.matchAll(/<option([^>]*)>/g)].map(([, attributes]) => attributes!);
  return { values: all.map((attributes) => /value="([^"]*)"/.exec(attributes)![1]), selected: all.filter((attributes) => /selected/.test(attributes)).map((attributes) => /value="([^"]*)"/.exec(attributes)![1]) };
}
