/**
 * The text a form shows in the field `name`: what the last send of the form carried, so a refused save
 * keeps what was typed; before any send, `initial`, the values the form starts with (the record it
 * edits, or the defaults of a new one); else nothing.
 */
export function valueIn<Values extends Record<string, string>>(state: { values: Values } | null, initial?: Partial<Record<keyof Values, string | null>>) {
  return (name: keyof Values) => (state ? state.values[name] : (initial?.[name] ?? ''));
}
