import { forbiddenMessage } from './app/(app)/forbidden.ts';
import { ForbiddenError, requireUser, UnauthenticatedError } from './dal/user.ts';

// What every Route Handler answers when the request has no right to what it asks. Every error is `{ error }`
// with a message for the person to read.

export const failure = (error: string, status: number) => Response.json({ error }, { status });

/** The Používateľ of the session of `request`, or null, which `guarded` turns into a 401 when the DAL refuses it. */
export const sessionUser = (request: Request) =>
  requireUser(request.headers).catch((error) => (error instanceof UnauthenticatedError ? null : Promise.reject(error)));

/** `answer`, or 401 for nobody signed in and 403 for a Rola that may not: the DAL refuses before it reads or writes anything. */
export async function guarded(answer: () => Promise<Response>) {
  try {
    return await answer();
  } catch (error) {
    if (error instanceof UnauthenticatedError) return failure('Nie ste prihlásený.', 401);
    if (error instanceof ForbiddenError) return failure(forbiddenMessage, 403);
    throw error;
  }
}
