import { Writable } from 'node:stream';
import type { ReactElement } from 'react';
import { renderToPipeableStream } from 'react-dom/server';

/**
 * A page, or a component, as HTML, with every async Server Component under it awaited. `renderToStaticMarkup` throws on one
 * ("A component suspended while responding to synchronous input"), and a page whose child is async, like the owner search
 * of a new Vozidlo, has one; `renderToPipeableStream` (Fizz) waits for it. docs/adr/0001-stack.md says that Vitest cannot
 * render an async Server Component: with this helper it can, and the ADR is Kazarr's to change. Fizz puts `<!-- -->`
 * between two texts so that the browser can hydrate them; it is taken out, so that the markup reads as the page does.
 */
export function renderPage(element: ReactElement) {
  return new Promise<string>((resolve, reject) => {
    let html = '';
    const sink = new Writable({
      write(chunk, _encoding, done) {
        html += chunk.toString();
        done();
      },
      final(done) {
        resolve(html.replaceAll('<!-- -->', ''));
        done();
      },
    });
    const stream = renderToPipeableStream(element, { onAllReady: () => stream.pipe(sink), onError: reject, onShellError: reject });
  });
}
