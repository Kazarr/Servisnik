import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const read = (file: string) => readFileSync(new URL(`../src/app/${file}`, import.meta.url), 'utf8');

// Design values (frontend-design): the rules of globals.css take colours, lengths and opacities from the
// custom properties of :root, so a value changes in one place. This finds the raw ones outside :root:
// an opacity number, a viewport length, a multiplier on a token and a hex colour.
const RAW_VALUE = /opacity:\s*[\d.]+|\b\d*\.?\d+(?:vh|vw|dvh|svh|vmin|vmax)\b|calc\(\s*[\d.]+\s*\*|#[0-9a-f]{3,8}\b/gi;
const rawValues = (css: string) => css.replace(/:root\s*\{[^}]*\}/, '').match(RAW_VALUE) ?? [];

test('the raw-value check finds what it is meant to find, and lets tokens pass', () => {
  const raw = ':root { --a: 0.6; } .x { opacity: .6; min-height: 100vh; border-top: calc(2 * var(--b)) solid #fff; }';
  const tokens = ':root { --a: 0.6; --h: 100vh; } .x { opacity: var(--a); min-height: var(--h); margin: 0; }';

  expect(rawValues(raw)).toEqual(['opacity: .6', '100vh', 'calc(2 *', '#fff']);
  expect(rawValues(tokens)).toEqual([]);
});

test('globals.css keeps its design values in :root', () => {
  expect(rawValues(read('globals.css'))).toEqual([]);
});

// icon.svg is loaded as an image, so it cannot read the custom properties of the page; its fills must
// equal the tokens instead.
test('icon.svg paints with the accent tokens of globals.css', () => {
  const token = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(read('globals.css'))![1]!.trim();
  const fills = [...read('icon.svg').matchAll(/fill="([^"]+)"/g)].map(([, fill]) => fill);

  expect(fills).toEqual([token('--color-accent'), token('--color-accent-text')]);
});
