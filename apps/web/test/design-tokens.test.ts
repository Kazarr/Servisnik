import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { documentCss, footerTemplate, printTokens } from '../src/print/styles.ts';

const read = (file: string) => readFileSync(new URL(`../src/app/${file}`, import.meta.url), 'utf8');

// Design values (frontend-design): the rules of globals.css take colours, lengths, percentages, font weights,
// line heights and mix ratios from the custom properties of :root, so a value changes in one place. One rule
// per value type; this finds the raw ones outside :root and outside comments. The percentage rule is also
// the one for the ratio of a color-mix(), and the multiplier rule for calc(var(--x) * n), which is a raw
// value in disguise unless it defines a token in :root.
const RULES = {
  opacity: /opacity:\s*[\d.]+/,
  viewport: /(?<![\w.#-])-?\d*\.?\d+(?:vh|vw|dvh|svh|vmin|vmax)\b/,
  length: /(?<![\w.#-])-?\d*\.?\d+(?:px|rem|em|ch|ex|pt|cm|mm|in|pc)\b/,
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

// Typed over every rule: a rule without a case does not compile. `miss` holds the near-misses a guard of
// the rule exists to let pass (a class name that ends in a number, a selector that looks like a hex
// colour); the rule alone must not report them, even when another rule would.
const CASES: Record<Rule, { raw: string; found: string[]; token: string; miss?: string }> = {
  opacity: {
    raw: '.x { opacity: .6; }',
    found: ['opacity: .6'],
    token: '.x { opacity: var(--opacity-disabled); }',
  },
  viewport: {
    raw: '.x { min-height: 100vh; width: .5vw; }',
    found: ['100vh', '.5vw'],
    token: '.x { min-height: var(--viewport-height); }',
    miss: '.w-2vh-x { margin: 0; } .a2vw { margin: 0; }',
  },
  length: {
    raw: '.x { padding: 0.5rem 8px -1em; margin: 0; }',
    found: ['0.5rem', '8px', '-1em'],
    token: '.x { padding: var(--space-2) var(--space-3); margin: 0; grid-template-columns: minmax(0, 1fr); }',
    miss: '.w-2px-x { margin: 0; } .a2em { margin: 0; } .y { background: url(icon.5px.png); }',
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
    miss: '.x { line-height: 1.5rem; } .y { line-height: 150%; }',
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
    miss: 'h1 * { margin: 0; } .col-2 * { margin: 0; } *.x { margin: 0; }',
  },
  hex: {
    raw: '.x { color: #fff; background: #1D5FC4; }',
    found: ['#fff', '#1D5FC4'],
    token: '.x { color: var(--color-text); }',
    miss: '#main { margin: 0; } #feedbag { margin: 0; }',
  },
};

test.each(Object.entries(CASES))('the %s rule finds exactly the raw values, and lets the tokens and the near-misses pass', (rule, { raw, found, token, miss = '' }) => {
  const only = { [rule]: RULES[rule as Rule] };

  expect(rawValues(raw, only)).toEqual(found);
  expect(rawValues(miss, only)).toEqual([]);
  expect(rawValues(token)).toEqual([]);
});

test('raw values are fine where tokens are defined, in :root and in comments, and nowhere else', () => {
  const css = `
    /* 100% of #219: opacity: 0.6; 8px */
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

// The printed forms are HTML that Chromium prints from a string, outside the page of the app, so they cannot
// read globals.css: they carry a :root of their own (src/print/styles.ts), and it must be the app's. As with
// icon.svg, what they share by name must equal the tokens, and a colour, font, weight or line height they
// have must be one the app has too.
const tokensOf = (css: string) => Object.fromEntries([...css.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name!, value!.trim()]));

test('the tokens of a printed form that the app has too have the same value, and a form invents no colour, font, weight or line height', () => {
  const app = tokensOf(read('globals.css'));
  const print = tokensOf(printTokens);
  const shared = Object.keys(print).filter((name) => name in app);

  expect(shared).toEqual(expect.arrayContaining(['--color-text', '--color-text-muted', '--font-family']));
  for (const name of shared) expect(print[name], name).toBe(app[name]);
  expect(Object.keys(print).filter((name) => /^--(color|font-family|font-weight|line-height)/.test(name) && !(name in app))).toEqual([]);
});

test('the footer of a printed page keeps its design values in :root', () => {
  const style = /<style>([\s\S]*)<\/style>/.exec(footerTemplate)![1]!;

  expect(style).toContain('var(--');
  expect(rawValues(style)).toEqual([]);
});

test('the style of a printed document keeps its design values in :root', () => {
  expect(documentCss).toContain('var(--');
  expect(rawValues(documentCss)).toEqual([]);
});
