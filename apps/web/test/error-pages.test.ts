import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import ErrorPage from '../src/app/error.tsx';
import NotFound from '../src/app/not-found.tsx';

type Element = ReactElement<{ children?: ReactNode; onClick?: () => void }>;

// The pages are plain function components without hooks, so they render here without Next.
test('the not-found page speaks Slovak and links back to the Zákazky', () => {
  const html = renderToStaticMarkup(NotFound());

  expect(html).toContain('<h1>Stránka sa nenašla</h1>');
  expect(html).toContain('href="/zakazky"');
  expect(html).not.toMatch(/not found|could not/i);
});

test('the error page speaks Slovak, hides what went wrong and tries again on the button', () => {
  const retry = vi.fn();
  const page = ErrorPage({ error: new Error('connect ECONNREFUSED 10.0.0.5:5432'), retry }) as Element;

  const html = renderToStaticMarkup(page);
  expect(html).toContain('<h1>Niečo sa pokazilo</h1>');
  expect(html).not.toContain('ECONNREFUSED');
  expect(html).not.toMatch(/something went wrong|try again/i);

  const button = Children.toArray(page.props.children).find((child): child is Element => isValidElement(child) && child.type === 'button');
  button!.props.onClick!();
  expect(retry).toHaveBeenCalledOnce();
});
