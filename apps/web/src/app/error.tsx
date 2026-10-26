'use client'; // Error boundaries must be Client Components

/** Shown in place of a page that threw. `error` is never rendered: its message can carry server details. */
export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="content">
      <h1>Niečo sa pokazilo</h1>
      <p>Na serveri nastala chyba. Skúste to znova.</p>
      <button type="button" onClick={() => retry()}>
        Skúsiť znova
      </button>
    </main>
  );
}
