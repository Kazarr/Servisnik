import { redirect } from 'next/navigation';
import { expect, test } from 'vitest';
import { ForbiddenError } from '../src/dal/user.ts';

// A page redirects a user whose Rola may not open it (docs/adr/0001-stack.md, packages/domain/src/access).
// currentUserWith does that before the page reads anything; this is the other way in, a DAL function
// the page calls that refuses. Next sends the user on when the error a page throws carries the digest of
// the error redirect() throws, so the test takes the expected digest from redirect() itself.

/** The digest of the error that `redirect(path)` throws. */
function digestOfRedirect(path: string) {
  try {
    redirect(path);
  } catch (error) {
    return (error as { digest?: string }).digest;
  }
}

test('a ForbiddenError thrown while a page renders redirects to Zákazky, the page every Rola may open', () => {
  const error = new ForbiddenError('customers.read');

  expect(error.digest).toMatch(/^NEXT_REDIRECT;.*\/zakazky;/);
  expect(error.digest).toBe(digestOfRedirect('/zakazky'));
});

test('the ForbiddenError still names the refused capability, for the log and for orForbidden', () => {
  const error = new ForbiddenError('customers.read');

  expect(error).toBeInstanceOf(ForbiddenError);
  expect(error.message).toBe('Zakázané: customers.read');
});
