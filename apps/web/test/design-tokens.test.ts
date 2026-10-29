import { globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { documentCss, footerTemplate, printTokens } from '../src/print/styles.ts';

const srcDir = fileURLToPath(new URL('../src/', import.meta.url));
const read = (file: string) => readFileSync(new URL(`../src/app/${file}`, import.meta.url), 'utf8');
const cssFiles = (dir: string) => globSync('**/*.css', { cwd: dir }).map((file) => file.split(sep).join('/')).sort();

// Design values (frontend-design): the rules of globals.css take colours, lengths, percentages, font weights,
// line heights and mix ratios from the custom properties of :root, so a value changes in one place. One rule
// per value type; this finds the raw ones outside :root and outside comments. The percentage rule is also
// the one for the ratio of a color-mix(), and the multiplier rule for calc(var(--x) * n), which is a raw
// value in disguise unless it defines a token in :root.
const RULES = {
  opacity: /opacity:\s*[\d.]+/,
  viewport: /(?<![\w.#-])-?\d*\.?\d+(?:[sld]?v(?:[whib]|min|max)|cq(?:[whib]|min|max))\b/,
  length: /(?<![\w.#-])-?\d*\.?\d+(?:px|r?em|r?ex|r?ch|r?cap|r?ic|r?lh|pt|cm|mm|Q|in|pc)\b/,
  percentage: /\d*\.?\d+%/,
  fontWeight: /font-weight:\s*(?:\d+|normal|bold|bolder|lighter)\b/,
  lineHeight: /line-height:\s*[\d.]+(?![\w.%])/,
  colorFunction: /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^)]*\)/,
  multiplier: /(?<![\w.-])[\d.]+\s*\*|\*\s*[\d.]+(?![\w.%])/,
  // A hex colour is a value: an ID selector that spells one (#add, #cafe) has a `{` after it before any `;` or `}`.
  hex: /#[0-9a-f]{3,8}(?![\w-])(?![^;{}]*\{)/,
};
type Rule = keyof typeof RULES;

// What is not a value to turn into a token: comments, the :root blocks that define the tokens (also with an
// attribute or a pseudo-class: `:root[data-theme='dark']`, `:root:not(...)`), the condition of a @media or
// @container and the step of a @keyframes, none of which can hold a var().
const COMMENT = /\/\*[\s\S]*?\*\//g;
const ROOT_BLOCK = /:root(?:\[[^\]]*\]|:[\w-]+(?:\([^)]*\))?)*\s*\{[^}]*\}/g;
const AT_RULE_CONDITION = /@(?:media|container)\b[^{]*(?=\{)/g;
const KEYFRAMES_STEP = /\d*\.?\d+%(?:\s*,\s*\d*\.?\d+%)*(?=\s*\{)/g;

const rawValues = (css: string, rules: Record<string, RegExp> = RULES) => {
  const outside = css.replace(COMMENT, '').replace(ROOT_BLOCK, '').replace(AT_RULE_CONDITION, '').replace(KEYFRAMES_STEP, '');
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
    raw: '.x { min-height: 100vh; width: .5vw; height: 50dvh 20svw 10lvh; margin: 1vi 2vb 3vmin; padding: 4cqi 5cqh 6cqmax; }',
    found: ['100vh', '.5vw', '50dvh', '20svw', '10lvh', '1vi', '2vb', '3vmin', '4cqi', '5cqh', '6cqmax'],
    token: '.x { min-height: var(--viewport-height); }',
    miss: '.w-2vh-x { margin: 0; } .a2vw { margin: 0; } .x { width: 4vww; height: 2cqiz; }',
  },
  length: {
    raw: '.x { padding: 0.5rem 8px -1em; margin: 0; height: 2lh 3rlh; width: 4Q 5cap; }',
    found: ['0.5rem', '8px', '-1em', '2lh', '3rlh', '4Q', '5cap'],
    token: '.x { padding: var(--space-2) var(--space-3); margin: 0; grid-template-columns: minmax(0, 1fr); }',
    miss: '.w-2px-x { margin: 0; } .a2em { margin: 0; } .y { background: url(icon.5px.png); } .x { margin: 2lhx; }',
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
    raw: '.x { color: rgb(0 0 0 / 50%); border-color: hsl(210, 20%, 50%); fill: color(display-p3 1 0 0); }',
    found: ['rgb(0 0 0 / 50%)', 'hsl(210, 20%, 50%)', 'color(display-p3 1 0 0)'],
    token: '.x { color: var(--color-text); }',
    miss: '.x { color: var(--color-text); background: color-mix(in srgb, var(--a), var(--b)); }',
  },
  multiplier: {
    raw: '.x { margin: calc(var(--space-1) * 1.5); padding: calc(2 * var(--space-1)); }',
    found: ['* 1.5', '2 *'],
    token: '.x { margin: var(--space-6); } *, *::before { box-sizing: border-box; }',
    miss: 'h1 * { margin: 0; } .col-2 * { margin: 0; } *.x { margin: 0; }',
  },
  hex: {
    raw: '.x { color: #fff; .y { margin: 0; } background: #1D5FC4 } .z { margin: 0; }',
    found: ['#fff', '#1D5FC4'],
    token: '.x { color: var(--color-text); }',
    miss: '#main { margin: 0; } #feedbag { margin: 0; } #add { margin: 0; } a:hover #cafe > .x, #fade { margin: 0; } .y { background: url(#add-btn); }',
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

// A block of tokens is any rule whose selector is :root with attributes or pseudo-classes: a dark theme is
// `:root[data-theme='dark']` or `:root:not([data-theme='light'])`. A rule that merely starts with :root is not.
test('every :root block defines tokens, whatever attribute or pseudo-class it carries, and a rule below :root does not', () => {
  const css = `
    :root[data-theme='dark'] { --c: #000; --w: 2px; }
    :root:not([data-theme='light']) { --c: #000; }
    @media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { --d: 2px; } }
    :root .x { margin: 4px; }
    :root > .y { margin: 5px; }
    :rooted { margin: 6px; }`;

  expect(rawValues(css)).toEqual(['4px', '5px', '6px']);
});

// var() does not work in the condition of an at-rule, so a width there cannot be a token.
test('the width in the condition of a @media or @container is no raw value, a declaration inside it is', () => {
  const css = `
    @media (min-width: 40rem) and (max-width: 60em) { .x { margin: var(--space-2); } }
    @container sidebar (width >= 30em) { .x { margin: var(--space-2); } }
    @media (min-width: 40rem) { .y { margin: 2px; } }
    @container (min-width: 30em) { .y { margin: 3px; } }`;

  expect(rawValues(css)).toEqual(['2px', '3px']);
});

// Nor can the step of a @keyframes be a token; the declarations in it can.
test('the step of a @keyframes is no raw value, a declaration inside it is, and so is a percentage elsewhere', () => {
  const css = `
    @keyframes pulse { 0%, 50.5% { opacity: var(--opacity-disabled); } 100% { width: 80%; } to { margin: 0; } }
    .x { background: color-mix(in srgb, var(--a) 40%, var(--b)); }`;

  expect(rawValues(css)).toEqual(['80%', '40%']);
});

test('cssFiles lists every .css file below a directory, at any depth, and no other file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'css-files-'));
  const files = ['a.css', 'deep/er/b.module.css', 'a.css.map', 'c.scss', 'd.csss', 'css', 'deep/notes.txt'];
  try {
    for (const file of files) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      writeFileSync(join(dir, file), '');
    }

    expect(cssFiles(dir)).toEqual(['a.css', 'deep/er/b.module.css']);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

// Every CSS file below src/, not only globals.css: a *.module.css next to a component is checked the day it is added.
test('every CSS file of the app keeps its design values in :root', () => {
  const files = cssFiles(srcDir);

  expect(files).toContain('app/globals.css');
  for (const file of files) expect(rawValues(readFileSync(join(srcDir, file), 'utf8')), file).toEqual([]);
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
// icon.svg, what they share by name must equal the tokens, and a colour, weight or line height they have must
// be one the app has too. The one thing a form takes from no token of the app is its font: the app's own is
// `system-ui`, which is whatever the machine says, and the machine of the image says a Chinese font.
const tokensOf = (css: string) => Object.fromEntries([...css.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name!, value!.trim()]));

test('the tokens of a printed form that the app has too have the same value, and a form invents no colour, weight or line height', () => {
  const app = tokensOf(read('globals.css'));
  const print = tokensOf(printTokens);
  const shared = Object.keys(print).filter((name) => name in app);

  expect(shared).toEqual(expect.arrayContaining(['--color-text', '--color-text-muted', '--font-weight-bold', '--line-height-base']));
  for (const name of shared) expect(print[name], name).toBe(app[name]);
  expect(Object.keys(print).filter((name) => /^--(color|font-weight|line-height)/.test(name) && !(name in app))).toEqual([]);
});

test('a printed form names its own fonts, and none of them is the font of the system', () => {
  const print = tokensOf(printTokens);

  expect(print['--font-family']).toBeUndefined();
  expect(print['--font-family-print']).toBeDefined();
  expect(print['--font-family-print']).not.toContain('system-ui');
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
