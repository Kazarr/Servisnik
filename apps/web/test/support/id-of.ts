/** The id of a record a DAL function saved. The test fails right there when it was not saved. */
export function idOf(result: { ok: true; id: string } | { ok: false }) {
  if (!result.ok) throw new Error('The record was expected to be saved.');
  return result.id;
}
