import { maxLogoBytes } from '@servisnik/domain/settings';
import { getLogo, removeLogo, saveLogo } from './dal/logo.ts';
import { assertCan, type User } from './dal/user.ts';
import type { Database } from './db/index.ts';
import { failure, guarded } from './route-guard.ts';

// The answers of the Route Handler of the logo (app/api/logo/route.ts), which only finds the user in the
// session. Uploading and removing go through a Route Handler because a Server Action takes at most 1 MB
// (docs/adr/0001-stack.md). Every error is `{ error }` with a message for the admin to read.

const noContent = () => new Response(null, { status: 204 });

/** What a refused file is told. */
const messages = {
  'too-large': 'Súbor je väčší ako 1 MB. Vyberte menšie logo.',
  'unsupported-type': 'Logo musí byť obrázok PNG alebo JPEG. Rozhoduje obsah súboru, nie jeho prípona.',
};
const statuses = { 'too-large': 413, 'unsupported-type': 415 };

/**
 * The body of `request`, or null when it is longer than `limit`. A Content-Length over the limit is
 * refused before anything is read. Otherwise it reads whole chunks, as the sender made them, and stops at
 * the first one that takes the total over `limit`: it holds at most `limit` bytes and that one chunk, and
 * a body that declares nothing, lies or never ends is cut there and its stream cancelled.
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

/**
 * Replaces the logo with the body of the request. The Rola is asked first, and the body is read only for
 * the admin. That holds because proxy.ts does not run for /api/logo: for a path it covers, Next copies
 * the body before this function is called.
 */
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
