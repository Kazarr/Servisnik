import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import NotFound from '../src/app/not-found.tsx';

// The pages are plain function components without hooks, so they render here without Next.
test('the not-found page speaks Slovak and links back to the Zákazky', () => {
  const html = renderToStaticMarkup(NotFound());

  expect(html).toContain('<h1>Stránka sa nenašla</h1>');
  expect(html).toContain('href="/zakazky"');
  expect(html).not.toMatch(/not found|could not/i);
});
