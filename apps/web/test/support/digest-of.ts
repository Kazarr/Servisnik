/** The digest Next puts on the error that `redirect()` or `notFound()` throws, which is what a Server Action's call ends in. */
export const digestOf = async (call: Promise<unknown>) => {
  try {
    await call;
  } catch (error) {
    return (error as { digest?: string }).digest;
  }
  return undefined;
};

/**
 * The id in the address `/<path>/<id>` that a saved form leads to: the call ends in `redirect()`, whose digest names the address.
 * The test fails right there when the call leads anywhere else.
 */
export async function ledTo(call: Promise<unknown>, path: string) {
  const id = new RegExp(`^NEXT_REDIRECT;[^;]*;/${path}/([0-9a-f-]{36});`).exec((await digestOf(call)) ?? '')?.[1];
  if (!id) throw new Error(`The form was expected to lead to a page of ${path}.`);
  return id;
}
