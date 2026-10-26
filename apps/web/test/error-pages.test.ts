import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import ErrorPage from '../src/app/(app)/error.tsx';
import NotFound from '../src/app/not-found.tsx';

type Element = ReactElement<{ children?: ReactNode; onClick?: () => void }>;

// The pages are plain function components without hooks, so they render here without Next.
test('the not-found page speaks Slovak and links back to the Zákazky', () => {
  const html = renderToStaticMarkup(NotFound());

  expect(html).toContain('<h1>Stránka sa nenašla</h1>');
  expect(html).toContain('href="/zakazky"');
  expect(html).not.toMatch(/not found|could not/i);
});

// The error page sits in the (app) group, inside the layout with the menu, which supplies the <main>.
test('the error page says an error occurred, shows nothing of it, links back and tries again on the button', () => {
  const retry = vi.fn();
  const error = Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432'), { digest: 'd1g3st0123' });
  const page = ErrorPage({ error, retry }) as Element;

  const html = renderToStaticMarkup(page);
  expect(html).toContain('<h1>Nastala chyba</h1>');
  expect(html).toContain('href="/zakazky"');
  expect(html).not.toContain('<main');
  expect(html).not.toMatch(/something went wrong|try again|na serveri/i);
  for (const detail of [error.message, error.digest, error.stack!]) expect(html).not.toContain(detail);

  const button = Children.toArray(page.props.children).find((child): child is Element => isValidElement(child) && child.type === 'button');
  button!.props.onClick!();
  expect(retry).toHaveBeenCalledOnce();
});
