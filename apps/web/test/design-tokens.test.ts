import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const read = (file: string) => readFileSync(new URL(`../src/app/${file}`, import.meta.url), 'utf8');

// Design values (frontend-design): the rules of globals.css take colours, lengths, percentages, font weights,
// line heights and mix ratios from the custom properties of :root, so a value changes in one place. One rule
// per value type; this finds the raw ones outside :root and outside comments. The percentage rule is also
// the one for the ratio of a color-mix(), and the multiplier rule for calc(var(--x) * n), which is a raw
// value in disguise unless it defines a token in :root.
const RULES = {
  opacity: /opacity:\s*[\d.]+/,
  viewport: /(?<![\w.#])-?\d*\.?\d+(?:vh|vw|dvh|svh|vmin|vmax)\b/,
  length: /(?<![\w.#])-?\d*\.?\d+(?:px|rem|em|ch|ex|pt|cm|mm|in|pc)\b/,
  percentage: /\d*\.?\d+%/,
  fontWeight: /font-weight:\s*(?:\d+|normal|bold|bolder|lighter)\b/,
  lineHeight: /line-height:\s*[\d.]+(?![\w.%])/,
  colorFunction: /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([^)]*\)/,
  multiplier: /(?<![\w.-])[\d.]+\s*\*|\*\s*[\d.]+(?![\w.%])/,
  hex: /#[0-9a-f]{3,8}\b/,
};
type Rule = keyof typeof RULES;

const rawValues = (css: string, rules: Record<string, RegExp> = RULES) => {
  const outside = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/:root\s*\{[^}]*\}/g, '');
  const raw = new RegExp(Object.values(rules).map((rule) => rule.source).join('|'), 'gi');
  return outside.match(raw) ?? [];
};

// Typed over every rule: a rule without a case does not compile.
const CASES: Record<Rule, { raw: string; found: string[]; token: string }> = {
  opacity: {
    raw: '.x { opacity: .6; }',
    found: ['opacity: .6'],
    token: '.x { opacity: var(--opacity-disabled); }',
  },
  viewport: {
    raw: '.x { min-height: 100vh; width: .5vw; }',
    found: ['100vh', '.5vw'],
    token: '.x { min-height: var(--viewport-height); }',
  },
  length: {
    raw: '.x { padding: 0.5rem 8px -1em; margin: 0; }',
    found: ['0.5rem', '8px', '-1em'],
    token: '.x { padding: var(--space-2) var(--space-3); margin: 0; grid-template-columns: minmax(0, 1fr); }',
  },
  percentage: {
    raw: '.x { width: 100%; background: color-mix(in srgb, var(--a) 40%, var(--b)); }',
    found: ['100%', '40%'],
    token: '.x { width: var(--width-full); background: color-mix(in srgb, var(--a) var(--mix-ratio), var(--b)); }',
  },
  fontWeight: {
    raw: '.x { font-weight: 700; } .y { font-weight: bold; }',
    found: ['font-weight: 700', 'font-weight: bold'],
    token: '.x { font-weight: var(--font-weight-bold); }',
  },
  lineHeight: {
    raw: '.x { line-height: 1.5; }',
    found: ['line-height: 1.5'],
    token: '.x { line-height: var(--line-height-base); }',
  },
  colorFunction: {
    raw: '.x { color: rgb(0 0 0 / 50%); border-color: hsl(210, 20%, 50%); }',
    found: ['rgb(0 0 0 / 50%)', 'hsl(210, 20%, 50%)'],
    token: '.x { color: var(--color-text); }',
  },
  multiplier: {
    raw: '.x { margin: calc(var(--space-1) * 1.5); padding: calc(2 * var(--space-1)); }',
    found: ['* 1.5', '2 *'],
    token: '.x { margin: var(--space-6); } *, *::before { box-sizing: border-box; }',
  },
  hex: {
    raw: '.x { color: #fff; background: #1D5FC4; }',
    found: ['#fff', '#1D5FC4'],
    token: '.x { color: var(--color-text); }',
  },
};

test.each(Object.entries(CASES))('the %s rule finds exactly the raw values, and lets the tokens pass', (rule, { raw, found, token }) => {
  expect(rawValues(raw, { [rule]: RULES[rule as Rule] })).toEqual(found);
  expect(rawValues(token)).toEqual([]);
});

test('raw values are fine where tokens are defined, in :root and in comments, and nowhere else', () => {
  const css = `
    /* 100% of #69: opacity: 0.6; 8px */
    :root { --a: 0.6; --b: #fff; --space-6: calc(var(--space-1) * 1.5); }
    .x { margin: 2px; }
    @media (forced-colors: active) { :root { --c: 2px; } }
    .y { margin: 3px; }`;

  expect(rawValues(css)).toEqual(['2px', '3px']);
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
