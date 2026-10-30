/** The digest Next puts on the error that `redirect()` or `notFound()` throws, which is what a Server Action's call ends in. */
export const digestOf = async (call: Promise<unknown>) => {
  try {
    await call;
  } catch (error) {
    return (error as { digest?: string }).digest;
  }
  return undefined;
};
