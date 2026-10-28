'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Field, FormError } from '../field.tsx';

type Outcome = { error: string } | { saved: string };

/**
 * The logo goes to the Route Handler /api/logo as the bytes of the file, because a Server Action takes
 * at most 1 MB. Only a 204 is a success: a redirect (a session that ended) or any other answer is not,
 * and an answer with a message from the server shows it.
 */
async function send(request: () => Promise<Response>, saved: string, failed: string): Promise<Outcome> {
  try {
    const response = await request();
    if (response.status === 204) return { saved };
    const body = await response.json().catch(() => null);
    return { error: typeof body?.error === 'string' ? body.error : failed };
  } catch {
    return { error: failed };
  }
}

/** Uploads a file as the logo, replaces the one there is, or removes it; `hasLogo` says whether there is one. */
export function LogoForm({ hasLogo }: { hasLogo: boolean }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pending, setPending] = useState(false);

  async function run(request: () => Promise<Response>, saved: string, failed: string) {
    setPending(true);
    setOutcome(null);
    const result = await send(request, saved, failed);
    setOutcome(result);
    setPending(false);
    if ('saved' in result) router.refresh();
    return result;
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = new FormData(form).get('logo');
    if (!(file instanceof File) || file.size === 0) return setOutcome({ error: 'Vyberte súbor s logom.' });
    // `redirect: 'manual'`: a redirect to the login page must not be followed and taken for an answer.
    const result = await run(() => fetch('/api/logo', { method: 'PUT', body: file, redirect: 'manual' }), 'Logo je uložené.', 'Logo sa nepodarilo uložiť. Skúste to znova.');
    if ('saved' in result) form.reset();
  }

  const remove = () =>
    run(() => fetch('/api/logo', { method: 'DELETE', redirect: 'manual' }), 'Logo je odstránené.', 'Logo sa nepodarilo odstrániť. Skúste to znova.');

  return (
    <form onSubmit={upload} className="form" noValidate>
      <FormError message={outcome && 'error' in outcome ? outcome.error : undefined} />
      <Field label="Súbor loga (PNG alebo JPEG do 1 MB)" name="logo" type="file" accept="image/png,image/jpeg" />
      {outcome && 'saved' in outcome && <p role="status">{outcome.saved}</p>}
      <button type="submit" disabled={pending}>
        {hasLogo ? 'Nahradiť logo' : 'Nahrať logo'}
      </button>
      {hasLogo && (
        <button type="button" onClick={remove} disabled={pending}>
          Odstrániť logo
        </button>
      )}
    </form>
  );
}
