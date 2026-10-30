import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { PoweredBy } from '../src/app/powered-by.tsx';
import { productName } from '../src/product.ts';

// The name the app is shown under (tickets #154 and #156). The literals are on purpose: the decision, not the code, is the source of
// them. When MG changes the name, the one edit is `productName` of src/product.ts, and the tests below and the e2e specs that
// name it follow with their literal.

test('the product is called Garage24Hub', () => {
  expect(productName).toBe('Garage24Hub');
});

// The line is English inside a page that says lang="sk", so a screen reader needs its language (WCAG 3.1.2).
test('the line "powered by" names the product in English, for the login page and the bottom of the menu', () => {
  expect(renderToStaticMarkup(PoweredBy())).toBe('<p class="powered-by" lang="en">powered by Garage24Hub</p>');
});

test('the icon of the app says G24 until there is a logo of the product', () => {
  const icon = readFileSync(new URL('../src/app/icon.svg', import.meta.url), 'utf8');

  expect([...icon.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(([, text]) => text)).toEqual(['G24']);
});
