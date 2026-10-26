'use client'; // Error boundaries must be Client Components

/**
 * Shown in place of a page of the (app) group that threw; the layout with the menu stays and supplies
 * the <main>. Nothing of `error` is rendered: its message can carry server details, its digest is for the log.
 */
export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <>
      <h1>Nastala chyba</h1>
      <p>Skúste to znova, alebo sa vráťte na zákazky.</p>
      <button type="button" onClick={() => retry()}>
        Skúsiť znova
      </button>{' '}
      <a href="/zakazky" className="button">
        Späť na zákazky
      </a>
    </>
  );
}
