'use client'; // Error boundaries must be Client Components

import ErrorPage from './(app)/error.tsx';
import './globals.css';

/**
 * For an error in the root layout, which no error.tsx catches. It replaces the layout, so it brings the
 * document, its language, its styles and its <main> itself; the page in it is the one of the (app) group.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="sk">
      <body>
        <main className="content">
          <ErrorPage error={error} retry={retry} />
        </main>
      </body>
    </html>
  );
}
