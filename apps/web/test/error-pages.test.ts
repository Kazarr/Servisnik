import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import ErrorPage from '../src/app/(app)/error.tsx';
import GlobalError from '../src/app/global-error.tsx';
import NotFound from '../src/app/not-found.tsx';

type PageElement = ReactElement<{ children?: ReactNode; onClick?: () => void }>;

// The pages are plain function components without hooks, so they render here without Next.
test('the not-found page speaks Slovak and links back to the Zákazky', () => {
  const html = renderToStaticMarkup(NotFound());

  expect(html).toContain('<h1>Stránka sa nenašla</h1>');
  expect(html).toContain('<p>Takú adresu Garage24Hub nepozná.</p>');
  expect(html).toContain('href="/zakazky"');
  expect(html).not.toMatch(/not found|could not|Servisník/i);
});

// The error page sits in the (app) group, inside the layout with the menu, which supplies the <main>.
test('the error page says an error occurred, shows nothing of it, links back and tries again on the button', () => {
  const retry = vi.fn();
  const error = Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432'), { digest: 'd1g3st0123' });
  const page = ErrorPage({ error, retry }) as PageElement;

  const html = renderToStaticMarkup(page);
  expect(html).toContain('<h1>Nastala chyba</h1>');
  expect(html).toContain('href="/zakazky"');
  expect(html).not.toContain('<main');
  expect(html).not.toMatch(/something went wrong|try again|na serveri/i);
  for (const detail of [error.message, error.digest, error.stack!]) expect(html).not.toContain(detail);

  const button = Children.toArray(page.props.children).find((child): child is PageElement => isValidElement(child) && child.type === 'button');
  button!.props.onClick!();
  expect(retry).toHaveBeenCalledOnce();
});

// An error in the root layout reaches no error.tsx; global-error.tsx replaces the layout, so it brings the
// document, its language and its <main> itself.
test('the global error page is a Slovak document with the error page in it and nothing of the error', () => {
  const error = Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432'), { digest: 'd1g3st0123' });

  const html = renderToStaticMarkup(GlobalError({ error, retry: vi.fn() }));

  expect(html).toContain('<html lang="sk">');
  expect(html).toMatch(/<main class="content">.*<h1>Nastala chyba<\/h1>.*href="\/zakazky".*<\/main>/);
  for (const detail of [error.message, error.digest]) expect(html).not.toContain(detail);
});
