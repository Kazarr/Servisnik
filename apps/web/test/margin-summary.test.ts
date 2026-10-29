import type { Margin } from '@servisnik/domain/work-order';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { MarginSummary } from '../src/app/(app)/zakazky/[id]/margin-summary.tsx';

// The Marža and the purchase of the Diely under the items of a Zákazka (spec #95, Sumy, zľava a marža). The page is an async
// Server Component, which Vitest cannot run (docs/adr/0001-stack.md); the rule of the percentage (none at a sale of 0) is in the
// domain (marginOf), and what the page does with it is this plain component, rendered over a Margin the domain made.

const render = (margin: Margin) => renderToStaticMarkup(createElement(MarginSummary, { margin }));

/** What a person reads of the markup: no tags, one space between the words, and no-break spaces as plain ones. */
const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/** The text of the `<dd>` of the term `label` in the markup. */
const valueOf = (html: string, label: string) => textOf(new RegExp(`<dt>${label}</dt><dd>(.*?)</dd>`).exec(html)![1]!).trim();

const complete: Margin = { purchaseNet: 2500, cents: 7650, percentTenths: 765, partsWithoutPurchasePrice: 0 };

test('the purchase of the Diely and the Marža in € are shown, with the Marža in % beside it', () => {
  const html = render(complete);

  expect(valueOf(html, 'Nákup dielov bez DPH')).toBe('25,00 €');
  expect(valueOf(html, 'Marža')).toBe('76,50 € (76,5 %)');
});

test('at a sale of 0 the Marža is shown without a percentage: there is none, and no empty or zero one stands in for it', () => {
  const html = render({ purchaseNet: 0, cents: 0, percentTenths: null, partsWithoutPurchasePrice: 0 });

  expect(valueOf(html, 'Marža')).toBe('0,00 €');
  expect(html).not.toContain('%');
});

test('a Marža of 0 on a sale above 0 is shown with its 0,0 %, which is a percentage', () => {
  expect(valueOf(render({ purchaseNet: 1000, cents: 0, percentTenths: 0, partsWithoutPurchasePrice: 0 }), 'Marža')).toBe('0,00 € (0,0 %)');
});

test('a loss is shown with its sign in € and in %', () => {
  expect(valueOf(render({ purchaseNet: 4000, cents: -1000, percentTenths: -333, partsWithoutPurchasePrice: 0 }), 'Marža')).toBe('-10,00 € (-33,3 %)');
});

test('a Marža that counts every Diel says nothing of an incomplete one', () => {
  const html = render(complete);

  expect(html).not.toContain('role="status"');
  expect(textOf(html)).not.toContain('neúplná');
});

test.each([
  [1, '1 diel'],
  [2, '2 diely'],
  [4, '4 diely'],
  [5, '5 dielov'],
])('a Marža that counts %i Diely as bought for 0 € is announced as incomplete, with their number: "%s"', (partsWithoutPurchasePrice, counted) => {
  const html = render({ ...complete, partsWithoutPurchasePrice });

  expect(html).toContain('role="status"');
  expect(textOf(html)).toContain(`Marža je neúplná: ${counted} bez nákupnej ceny`);
});
