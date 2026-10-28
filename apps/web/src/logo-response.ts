import { maxLogoBytes } from '@servisnik/domain/settings';
import { forbiddenMessage } from './app/(app)/forbidden.ts';
import { getLogo, removeLogo, saveLogo } from './dal/logo.ts';
import { assertCan, ForbiddenError, UnauthenticatedError, type User } from './dal/user.ts';
import type { Database } from './db/index.ts';

// The answers of the Route Handler of the logo (app/api/logo/route.ts), which only finds the user in the
// session. Uploading and removing go through a Route Handler because a Server Action takes at most 1 MB
// (docs/adr/0001-stack.md). Every error is `{ error }` with a message for the admin to read.

const failure = (error: string, status: number) => Response.json({ error }, { status });
const noContent = () => new Response(null, { status: 204 });

/** What a refused file is told. */
const messages = {
  'too-large': 'Súbor je väčší ako 1 MB. Vyberte menšie logo.',
  'unsupported-type': 'Logo musí byť obrázok PNG alebo JPEG. Rozhoduje obsah súboru, nie jeho prípona.',
};
const statuses = { 'too-large': 413, 'unsupported-type': 415 };

/** `answer`, or 401 for nobody signed in and 403 for a Rola that may not: the DAL refuses before it reads or writes anything. */
async function guarded(answer: () => Promise<Response>) {
  try {
    return await answer();
  } catch (error) {
    if (error instanceof UnauthenticatedError) return failure('Nie ste prihlásený.', 401);
    if (error instanceof ForbiddenError) return failure(forbiddenMessage, 403);
    throw error;
  }
}

/**
 * The body of `request`, or null when it is longer than `limit`. It never reads more than `limit` + 1
 * bytes: a sender that declares nothing, or lies, cannot make it hold a body without end.
 */
async function readBody(request: Request, limit: number) {
  if (Number(request.headers.get('Content-Length')) > limit) return null;
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks);
      size += value.length;
      if (size > limit) return null;
      chunks.push(value);
    }
  } finally {
    await reader.cancel(); // closes the stream of a body that was too long; there is nothing to close after the last chunk
  }
}

/** The image, with the type the domain read from its content and `nosniff`, so a browser never takes it for anything else. */
export const getLogoResponse = (user: User | null, db: Database) =>
  guarded(async () => {
    const logo = await getLogo(user, db);
    if (!logo) return failure('Logo nie je nahrané.', 404);
    // `no-cache`: a replaced logo is shown at once, and `private` keeps it out of shared caches.
    return new Response(logo.bytes as Uint8Array<ArrayBuffer>, {
      headers: { 'Content-Type': logo.contentType, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-cache' },
    });
  });

/** Replaces the logo with the body of the request. The Rola is asked before the body is read. */
export const putLogoResponse = (user: User | null, request: Request, db: Database) =>
  guarded(async () => {
    assertCan(user, 'settings.write');
    const body = await readBody(request, maxLogoBytes);
    const saved = body ? await saveLogo(user, body, db) : ({ ok: false, error: 'too-large' } as const);
    return saved.ok ? noContent() : failure(messages[saved.error], statuses[saved.error]);
  });

export const deleteLogoResponse = (user: User | null, db: Database) =>
  guarded(async () => {
    await removeLogo(user, db);
    return noContent();
  });
