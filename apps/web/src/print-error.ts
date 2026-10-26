/** Prints a failure for the operator: an Error as its message, so a missing variable reads as one line; anything else as it is. */
export function printError(error: unknown) {
  console.error(error instanceof Error ? error.message : error);
}
