import { globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { documentCss, footerTemplate, printTokens } from '../src/print/styles.ts';
import { tokensOf } from './support/css-tokens.ts';

const srcDir = fileURLToPath(new URL('../src/', import.meta.url));
const read = (file: string) => readFileSync(new URL(`../src/app/${file}`, import.meta.url), 'utf8');
const cssFiles = (dir: string) => globSync('**/*.css', { cwd: dir }).map((file) => file.split(sep).join('/')).sort();

// The 148 named colours of CSS Color 4, compared once with the keys of color-name 1.1.4. transparent and
// currentcolor are keywords, and the system colours (Canvas, CanvasText, ButtonText, ...) are the colours of
// the user; none of them is a design colour.
const NAMED_COLORS = `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown
  burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod
  darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen
  darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue
  firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew
  hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
  lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray
  lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid
  mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream
  mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen
  paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue
  saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen
  steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen`.split(/\s+/);

// Design values (frontend-design): every CSS file of the app and the CSS of the printed forms take colours,
// lengths, percentages, font weights, line heights, mix ratios, durations, angles and the minmax() of a grid track
// from the custom properties of :root, so a value changes in one place. One rule per value type; this finds the
// raw ones outside :root and outside what cannot hold a var(). The percentage rule is also the one for the ratio
// of a color-mix(), and the multiplier and divisor rules for calc(var(--x) * n) and calc(var(--x) / n), which are
// raw values in disguise unless they define a token in :root.
//
// What the check does not read, so that no one takes its green for more:
// - A fraction is layout, not a design value: `1fr 2fr` and `repeat(3, 1fr)` pass. Of the grid track functions only
//   minmax() is read, and a minmax() whose two limits are a plain var() each is made of tokens already.
// - Parentheses are read PARENS_DEPTH levels deep. A minmax() or a division with more levels inside is not seen, and
//   a :root:not(...) with more is no block of tokens.
// - The divisor is read inside calc(), min(), max() and clamp(), the places where a `/` divides; round(), mod() and
//   the other math functions are not read.
// - A custom property outside :root is read for the units and colours in its value like any other declaration, but
//   not as a font shorthand: `--font: 700 var(--size) serif` has no weight to report, as nothing says that the
//   property holds a shorthand.
// - A colour name is no colour in animation-name and animation (`animation-name: navy` names a @keyframes). Any
//   other place where an identifier can spell a colour (counter-reset, grid-area, font-family) is read as a colour.
// - Not values, so not read (NOT_VALUES and what follows it): comments, strings, an unquoted url(), the blocks of
//   :root, @font-face, @property and @page, the prelude of @media, @container, @supports and @import, the steps
//   of a @keyframes. A declaration after the first margin box of an @page is read.

// The parts several rules are made of. A number is `5`, `.5` or `0.55`; its sign belongs to the rules that take one.
const NUMBER = String.raw`\d*\.?\d+`;
// A number with one of the units, not the end of a longer word or class name (`.w-2px-x`, `.a2em`, `4vww`).
const unit = (units: string) => new RegExp(String.raw`(?<![\w-])-?${NUMBER}(?:${units})\b`);
// Text whose parentheses balance, nested to at most `depth` levels: `x(x(x))` is two.
const nested = (depth: number): string => (depth === 0 ? String.raw`[^()]*` : String.raw`(?:[^()]|\(${nested(depth - 1)}\))*`);
const PARENS_DEPTH = 3;
const PARENS = nested(PARENS_DEPTH);
// Everything of a `font:` declaration up to the point a rule looks at. A custom property (`--font:`) or a longer name
// (`myfont:`) is none, and neither is font-variation-settings.
const FONT = String.raw`(?<![\w-])font:[^;}]*`;
// The start of an animation or animation-name declaration, where a colour name is the name of a @keyframes.
const ANIMATION = String.raw`(?<![\w-])animation(?:-name)?:[^;}]*`;
// A limit of a minmax() that is a token as it stands: var(--min), with or without a fallback.
const VAR = String.raw`var\(${PARENS}\)`;

const RULES = {
  opacity: /opacity:\s*[\d.]+/,
  viewport: unit('[sld]?v(?:[whib]|min|max)|cq(?:[whib]|min|max)'),
  length: unit('px|r?em|r?ex|r?ch|r?cap|r?ic|r?lh|pt|cm|mm|Q|in|pc'),
  percentage: new RegExp(`${NUMBER}%`),
  fontWeight: /font-weight:\s*(?:\d+|normal|bold|bolder|lighter)\b/,
  lineHeight: /line-height:\s*[\d.]+(?![\w.%])/,
  colorFunction: /(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^)]*\)/,
  // The weight and the line height in the shorthand `font: 700 1rem/1.5 serif`: the weight is a bare number or
  // bold, bolder, lighter before the family, the line height a number after the slash.
  fontShorthandWeight: new RegExp(String.raw`(?<=${FONT})(?<![\w.-])(?<!\/\s*)(?:\d+|bold|bolder|lighter)(?![\w.%-])`),
  fontShorthandLineHeight: new RegExp(String.raw`(?<=${FONT}\/\s*)${NUMBER}(?![\w.%])`),
  // A sign is part of the number: calc(-1 * var(--x)). An identifier that ends in a number (.col-2 *) is not.
  multiplier: /(?<![\w-])-?[\d.]+\s*\*|\*\s*-?[\d.]+(?![\w.%])/,
  // Only a number after the slash in a math function: `font: 1rem/1.5` and `grid-row: 1 / 3` have a slash too,
  // and so has a custom function (`--max(1 / 2)`) whose name ends in one of the four.
  divisor: new RegExp(String.raw`(?<=(?<![\w-])(?:calc|min|max|clamp)\(${PARENS})\/\s*-?[\d.]+(?![\w.%])`),
  duration: unit('m?s'),
  angle: unit('deg|grad|rad|turn'),
  // A grid track function (`minmax(0, 1fr)`) is a token like any other value: --track-fill. A minmax() whose two
  // limits are both tokens (`minmax(var(--min), var(--max))`) is made of tokens already.
  minmax: new RegExp(String.raw`minmax\((?!\s*${VAR}\s*,\s*${VAR})${PARENS}\)`),
  // A colour name is a value, not a part of a longer word (white-space, red-alert, tan( ), nor an ID (#red) or
  // a selector (`.red {`, `[data-tone=red] {`), nor the name of a @keyframes.
  namedColor: new RegExp(String.raw`(?<![\w#-])(?<!${ANIMATION})(?:${NAMED_COLORS.join('|')})(?![\w(-])(?![^;}]*\{)`),
  // A hex colour is a value: an ID selector that spells one (#add, #cafe) has a `{` after it before any `;` or `}`.
  hex: /#[0-9a-f]{3,8}(?![\w-])(?![^;}]*\{)/,
};
type Rule = keyof typeof RULES;

// What is not a value to turn into a token. No var() can stand in a comment, a string (the text of `content: "red"`,
// the value of `[data-col="2px"]`), an unquoted url() (a quoted one is a string), the descriptors of @font-face and
// @property, the prelude of a @media, @container, @supports or @import (a condition) and the step of a @keyframes (a
// selector). An @page is not read either: its page context inherits from :root or, as an engine may do instead (CSS
// Page 3, section 6), from the initial values, which carry no token. The :root blocks define the tokens (also with
// an attribute or a pseudo-class: `:root[data-theme='dark']`, `:root:not(...)`).
const NOT_VALUES = /\/\*[\s\S]*?\*\/|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|url\([^)"']*\)/g;
const ROOT_BLOCK = new RegExp(String.raw`:root(?:\[[^\]]*\]|:[\w-]+(?:\(${PARENS}\))?)*\s*\{[^}]*\}`, 'g');
const AT_RULE_BLOCK = /@(?:font-face|property|page)[^{]*\{[^}]*\}/g;
const AT_RULE_PRELUDE = /@(?:media|container|supports)[^{]*|@import[^;]*/g;
// A step list starts with a percentage: from and to hold no value, and only a percentage before them is lost.
const KEYFRAMES_STEP = new RegExp(String.raw`${NUMBER}%(?:\s*,\s*(?:${NUMBER}%|from|to))*(?=\s*\{)`, 'g');

const rawValues = (css: string, rules: Record<string, RegExp> = RULES) => {
  const outside = css
    .replace(NOT_VALUES, '')
    .replace(ROOT_BLOCK, '')
    .replace(AT_RULE_BLOCK, '')
    .replace(AT_RULE_PRELUDE, '')
    .replace(KEYFRAMES_STEP, '');
  const raw = new RegExp(Object.values(rules).map((rule) => rule.source).join('|'), 'gi');
  return outside.match(raw) ?? [];
};

// Typed over every rule: a rule without a case does not compile. `miss` holds the near-misses a guard of
// the rule exists to let pass (a class name that ends in a number, a selector that looks like a hex
// colour); the rule alone must not report them, even when another rule would.
const CASES: Record<Rule, { raw: string; found: string[]; token: string; miss?: string }> = {
  opacity: {
    raw: '.x { opacity: .6; } .y { opacity:0.25; }',
    found: ['opacity: .6', 'opacity:0.25'],
    token: '.x { opacity: var(--opacity-disabled); }',
  },
  viewport: {
    raw: '.x { min-height: 100vh; width: .5vw; height: 50dvh 20svw 10lvh; margin: 1vi 2vb 3vmin 4vmax; padding: 5cqi 6cqh 7cqmax 8cqw 9cqb 10cqmin; top: 12.25svh; }',
    found: ['100vh', '.5vw', '50dvh', '20svw', '10lvh', '1vi', '2vb', '3vmin', '4vmax', '5cqi', '6cqh', '7cqmax', '8cqw', '9cqb', '10cqmin', '12.25svh'],
    token: '.x { min-height: var(--viewport-height); }',
    miss: '.w-2vh-x { margin: 0; } .a2vw { margin: 0; } .x { width: 4vww; height: 2cqiz; }',
  },
  length: {
    raw: '.x { padding: 0.5rem 8px -1em; margin: 0; height: 2lh 3rlh; width: 4Q 5cap 6rcap; gap: 7ic 8ric 9ex 10rex 11ch 12rch; border-width: 13pt 14cm 15mm 16in 17pc; top: 0.25rem .75em; }',
    found: ['0.5rem', '8px', '-1em', '2lh', '3rlh', '4Q', '5cap', '6rcap', '7ic', '8ric', '9ex', '10rex', '11ch', '12rch', '13pt', '14cm', '15mm', '16in', '17pc', '0.25rem', '.75em'],
    token: '.x { padding: var(--space-2) var(--space-3); margin: 0; grid-template-columns: var(--track-fill); }',
    miss: '.w-2px-x { margin: 0; } .a2em { margin: 0; } .x { margin: 2lhx; } em { margin: 0; }',
  },
  percentage: {
    raw: '.x { width: 100%; background: color-mix(in srgb, var(--a) 40%, var(--b)); } .y { top: .5%; left: 33.33%; }',
    found: ['100%', '40%', '.5%', '33.33%'],
    token: '.x { width: var(--width-full); background: color-mix(in srgb, var(--a) var(--mix-ratio), var(--b)); }',
  },
  fontWeight: {
    raw: '.x { font-weight: 700; } .y { font-weight: bold; } .z { font-weight:normal; font-weight: bolder; font-weight: lighter; }',
    found: ['font-weight: 700', 'font-weight: bold', 'font-weight:normal', 'font-weight: bolder', 'font-weight: lighter'],
    token: '.x { font-weight: var(--font-weight-bold); }',
  },
  lineHeight: {
    raw: '.x { line-height: 1.5; } .y { line-height:1.25; }',
    found: ['line-height: 1.5', 'line-height:1.25'],
    token: '.x { line-height: var(--line-height-base); }',
    miss: '.x { line-height: 1.5rem; } .y { line-height: 150%; }',
  },
  colorFunction: {
    raw: [
      '.x { color: rgb(0 0 0 / 50%); border-color: hsl(210, 20%, 50%); fill: color(display-p3 1 0 0); }',
      '.y { color: rgba(0, 0, 0, 1); background: hsla(210, 20%, 50%, 1); color: hwb(194 0% 0%); color: lab(29% 39 20); color: lch(29% 66 340); color: oklab(59% 0.1 0.1); color: oklch(60% 0.15 50); }',
    ].join(' '),
    found: [
      'rgb(0 0 0 / 50%)',
      'hsl(210, 20%, 50%)',
      'color(display-p3 1 0 0)',
      'rgba(0, 0, 0, 1)',
      'hsla(210, 20%, 50%, 1)',
      'hwb(194 0% 0%)',
      'lab(29% 39 20)',
      'lch(29% 66 340)',
      'oklab(59% 0.1 0.1)',
      'oklch(60% 0.15 50)',
    ],
    token: '.x { color: var(--color-text); }',
    miss: '.x { color: var(--color-text); background: color-mix(in srgb, var(--a), var(--b)); } .y { color: --color(var(--a)); fill: mycolor(1); }',
  },
  fontShorthandWeight: {
    raw: '.x { font: 700 var(--font-size-base)/1.5 var(--font-family); } .y { font: italic bold 1rem serif; } .z { font: lighter 1rem serif; font: bolder 1rem serif; }',
    found: ['700', 'bold', 'lighter', 'bolder'],
    token: '.x { font: var(--font-weight-bold) var(--font-size-base)/var(--line-height-base) var(--font-family); } .y { font: inherit; }',
    miss: [
      '.a { font: var(--font-size-2) var(--family-700); } .b { font: 1rem/2 serif; } .c { font: 1rem / 2 serif; } .d { font: 120% serif; }',
      '.e { font-variation-settings: "wght" 700; } .f { --font: 700 1rem serif; } .g { font: normal var(--font-size-base) serif; }',
      '.h { font: inherit; z-index: 700; } .i { font: inherit } .j { z-index: 700 } .k { myfont: 700 1rem serif; }',
      '.l { font: 0.875rem/1.5 serif; } .m { font: 1rem/.5 serif; } .n { font: 1rem bold-sans, serif; }',
    ].join(' '),
  },
  fontShorthandLineHeight: {
    raw: '.x { font: 700 var(--font-size-base)/1.5 var(--font-family); } .y { font: 1rem / 2 serif; } .z { font: 1rem/1.25 serif; } .w { font: 1rem/.5 serif; }',
    found: ['1.5', '2', '1.25', '.5'],
    token: '.x { font: var(--font-weight-bold) var(--font-size-base)/var(--line-height-base) var(--font-family); } .y { font: inherit; }',
    miss: [
      '.a { font: 1rem/1.5rem serif; } .b { font: 1rem/150% serif; } .c { aspect-ratio: 16 / 9; grid-row: 1 / 3; }',
      '.d { font: inherit; grid-area: 1 / 2; } .e { font: inherit } .f { grid-row: 1 / 3 } .g { --font: 1rem/2 serif; } .h { myfont: 1rem/2 serif; }',
      '.i { --font-ratio: 16 / 9; font-variant: normal; }',
    ].join(' '),
  },
  multiplier: {
    raw: '.x { margin: calc(var(--space-1) * 1.5); padding: calc(2 * var(--space-1)); } .y { margin: calc(var(--space-1) * -1); padding: calc(-0.5 * var(--space-1)); } .z { margin: calc(2*var(--a)) calc(var(--a)*1.5) calc(var(--a) * .5) calc(12 * var(--a)) calc(var(--a) * 12); }',
    found: ['* 1.5', '2 *', '* -1', '-0.5 *', '2*', '*1.5', '* .5', '12 *', '* 12'],
    token: '.x { margin: var(--space-6); } *, *::before { box-sizing: border-box; }',
    miss: 'h1 * { margin: 0; } .col-2 * { margin: 0; } *.x { margin: 0; } .y { margin: calc(var(--a) * 1.5rem) calc(var(--a) * 50%); }',
  },
  divisor: {
    raw: '.x { width: calc(var(--space-1) / 2); height: calc((100% - var(--gap)) / 3); margin: calc(var(--a)/4) calc(var(--a) / -2) calc(var(--a) / 12) calc(var(--a) / .5); } .y { width: min(var(--a) / 5, 1px); height: max(1px, var(--a) / 6); padding: clamp(1px, var(--a) / 7, 2px); } .z { margin: calc(max(var(--a, calc(1px)), 2px) / 8); }',
    found: ['/ 2', '/ 3', '/4', '/ -2', '/ 12', '/ .5', '/ 5', '/ 6', '/ 7', '/ 8'],
    token: '.x { margin: var(--space-6); width: calc(var(--space-1) / var(--columns)); }',
    miss: '.k { width: calc(max(var(--a, max(var(--b), 2px)), 3px) / 9); } .i { width: --max(var(--a) / 2); } .j { grid-template-columns: minmax(var(--a) / 2, 1fr); } .a { font: 1rem/1.5 serif; } .b { aspect-ratio: 16 / 9; grid-row: 1 / 3; } .c { grid-row: calc(var(--n)) / 3; } .d { width: calc(var(--a) / 2rem); } .e { width: calc(var(--a) / 1.5rem); } .f { width: calc(var(--a) / 50%); } .g { grid-row: calc(1 + (2 * (3))) / 4; } .h { grid-row: calc((1 + 2)) / 4; }',
  },
  duration: {
    raw: '.x { transition: opacity 200ms ease-in; animation-duration: 0.3s; transition-delay: -1s .25s; animation-delay: 0.25s; }',
    found: ['200ms', '0.3s', '-1s', '.25s', '0.25s'],
    token: '.x { transition: opacity var(--duration-fast) ease-in; }',
    miss: '.w-2s-x { margin: 0; } .a2s { margin: 0; } .x { margin: 3ss 2msx; } s { margin: 0; }',
  },
  angle: {
    raw: '.x { transform: rotate(45deg) skew(-0.5turn); rotate: 1.5rad; background: conic-gradient(from 90grad, var(--a), var(--b)); } .y { rotate: .5turn 0.25turn; }',
    found: ['45deg', '-0.5turn', '1.5rad', '90grad', '.5turn', '0.25turn'],
    token: '.x { transform: rotate(var(--angle-open)); }',
    miss: '.w-45deg-x { margin: 0; } .a90deg { margin: 0; } .x { margin: 2radx 3degs; }',
  },
  minmax: {
    raw: '.x { grid-template-columns: max-content minmax(0, 1fr); } .y { grid-template-columns: repeat(auto-fill, minmax(var(--card-width), 1fr)); } .z { grid-template-columns: minmax(0, var(--max)); } .v { grid-template-columns: minmax(0, calc(1fr + 2px)); margin: calc(1px + 2px); } .u { grid-template-columns: repeat(auto-fill, minmax(0, 1fr)); margin: calc(1px + 2px); } .t { grid-template-columns: minmax(max(var(--a), var(--b)), 1fr); } .s { grid-template-columns: minmax(max(var(--a, calc(1px)), 2px), 1fr); } .r { grid-template-columns: minmax(max(var(--a), var(--b)), var(--c)); }',
    found: ['minmax(0, 1fr)', 'minmax(var(--card-width), 1fr)', 'minmax(0, var(--max))', 'minmax(0, calc(1fr + 2px))', 'minmax(0, 1fr)', 'minmax(max(var(--a), var(--b)), 1fr)', 'minmax(max(var(--a, calc(1px)), 2px), 1fr)', 'minmax(max(var(--a), var(--b)), var(--c))'],
    token: '.x { grid-template-columns: max-content var(--track-fill); }',
    miss: [
      '.minmax-cell { margin: 0; } .x { grid-area: minmax; } .y { grid-template-columns: repeat(auto-fill, minmax(var(--min), var(--max))); } .z { grid-template-columns: minmax( var(--min) , var(--max) ); } .w { grid-template-columns: minmax(var(--min),var(--max)); }',
      '.a { grid-template-columns: minmax(var(--a, max(var(--b, calc(1px)), 2px)), var(--c, 1fr)); } .b { grid-template-columns: 1fr 2fr; } .c { grid-template-columns: repeat(3, 1fr); }',
      // Four levels of parentheses inside the minmax() are one more than are read: not seen (see the header).
      '.d { grid-template-columns: minmax(max(var(--a, max(var(--b), 2px)), 3px), 1fr); }',
    ].join(' '),
  },
  namedColor: {
    raw: '.x { color: red; .z { margin: 0; } background: RebeccaPurple; border: 1px solid black; box-shadow: 0 0 1px gray, 0 0 2px navy } .y { background: linear-gradient(white, var(--a)); } .v { animation: spin 1s; background: tan; } .u { --animation: gold; } .t { animation-name: spin } .s { color: coral; } .r { myanimation: ivory; }',
    found: ['red', 'RebeccaPurple', 'black', 'gray', 'navy', 'white', 'tan', 'gold', 'coral', 'ivory'],
    token: '.x { color: var(--color-text); outline: var(--border-width-strong) solid CanvasText; background: Canvas; color: ButtonText; border-color: transparent; fill: currentcolor; }',
    miss: [
      '.red { margin: 0; } #tan { margin: 0; } .x-red, .gold-x { margin: 0; } [data-tone=red] { margin: 0; } [data-tone="gold"] > .x { margin: 0; }',
      '.a { color: var(--color-red); grid-area: red-alert; margin: 0 redundant; will-change: scarred; white-space: nowrap; } .b { width: calc(var(--a) * tan(var(--angle))); }',
      '@keyframes gold { to { margin: 0; } } .c { --target: #red; --other: #tan; }',
      '.m { animation-name: navy; } .n { animation-name: spin, gold; } .o { animation: tan 1s ease, red 2s; }',
    ].join(' '),
  },
  hex: {
    raw: '.x { color: #fff; .y { margin: 0; } background: #1D5FC4 } .z { margin: 0; } .w { color: #fffa; border-color: #ff000080; } .v { color: #999; border-color: #990000; }',
    found: ['#fff', '#1D5FC4', '#fffa', '#ff000080', '#999', '#990000'],
    token: '.x { color: var(--color-text); }',
    miss: '#main { margin: 0; } #feedbag { margin: 0; } #add { margin: 0; } a:hover #cafe > .x, #fade { margin: 0; } .y { --target: #add-btn; --other: #badge; }',
  },
};

test.each(Object.entries(CASES))('the %s rule finds exactly the raw values, and lets the tokens and the near-misses pass', (rule, { raw, found, token, miss = '' }) => {
  const only = { [rule]: RULES[rule as Rule] };

  expect(rawValues(raw, only)).toEqual(found);
  expect(rawValues(miss, only)).toEqual([]);
  expect(rawValues(token)).toEqual([]);
});

test('the namedColor rule finds each of the 148 named colours of CSS Color 4', () => {
  const only = { namedColor: RULES.namedColor };

  expect(NAMED_COLORS).toHaveLength(148);
  for (const name of NAMED_COLORS) expect(rawValues(`.x { color: ${name}; }`, only), name).toEqual([name]);
});

// A minmax(), a division and a :root:not(...) read their parentheses with nested(): text whose parentheses balance, up
// to a depth, and nothing else. `x(x)x` has one opening and one closing one; every pair of counts up to one level
// more than the depth is tried, and only equal counts within the depth match.
test('nested(depth) matches text whose parentheses balance to that depth, and nothing else', () => {
  const reads = (depth: number, text: string) => new RegExp(`^${nested(depth)}$`).test(text);
  const text = (open: number, close: number) => `x${'(x'.repeat(open)}${')x'.repeat(close)}`;

  expect(PARENS).toBe(nested(PARENS_DEPTH));
  for (let depth = 0; depth <= PARENS_DEPTH + 1; depth++) {
    for (let open = 0; open <= depth + 1; open++) {
      for (let close = 0; close <= depth + 1; close++) expect(reads(depth, text(open, close)), `${depth}: ${text(open, close)}`).toBe(open === close && open <= depth);
    }
  }
  expect(reads(1, 'x(x)x(x)x')).toBe(true);
  expect(reads(2, 'x(x(x)x(x)x)x(x)x')).toBe(true);
  expect(reads(3, 'x(x(x(x)x(x)x)x)x')).toBe(true);
});

// Valid CSS in which a text that looks like a raw value is none, each with a raw value after it, which is still found:
// where what is not read ends, the reading goes on. What comes after holds a `)` and a string of each kind, so a
// string or an url() that ran on to the next quote or parenthesis would swallow the raw values before them.
const LOOKS_RAW = {
  '@page': '@page { margin: 15mm }',
  '@font-face': '@font-face { font-family: X; font-weight: 100 900; }',
  'two @font-face': '@font-face { font-weight: 400; } @font-face { font-weight: 700; }',
  '@supports': '@supports (height: 100dvh) { .a { margin: 0; } }',
  '@property': "@property --a { syntax: '<length>'; inherits: false; initial-value: 0px; }",
  '@import': '@import "a.css" screen and (min-width: 40rem);',
  '@import url()': '@import url(a.css) (min-width: 40rem);',
  'a string': '.a { content: "red"; }',
  'a string in single quotes': ".a { content: 'red'; }",
  'a string with an escaped quote': '.a { content: "say \\"red\\" 2px"; }',
  'a string in single quotes with an escaped quote': ".a { content: 'say \\'red\\' 2px'; }",
  'an attribute value': '[data-col="2px"] { margin: 0; }',
  'an unquoted url()': '.a { background: url(/img/16px.png); }',
  'a quoted url()': '.a { background: url("/img/16px.png"); }',
  'a quoted url() with a parenthesis in it': '.a { background: url("/img/a)2px.png"); }',
  'a url() in single quotes with a parenthesis in it': ".a { background: url('/img/a)2px.png'); }",
  'the name of a @keyframes': '.a { animation-name: navy; }',
  'the name in an animation': '.a { animation: tan var(--duration-fast) ease; }',
};

test.each(Object.entries(LOOKS_RAW))('%s holds no raw value, and what follows it is read', (_, valid) => {
  expect(rawValues(valid)).toEqual([]);
  expect(rawValues(`${valid} .z { margin: 2px; color: red; background: var(--a); content: "x"; font-family: 'y'; }`)).toEqual(['2px', 'red']);
});

// An @page ends at its first closing brace: a margin box of its own ends it too.
test('an @page is read up to its first closing brace, so a declaration after a margin box is read', () => {
  expect(rawValues('@page { margin: 15mm; @bottom-center { font-size: 8pt; } }')).toEqual([]);
  expect(rawValues('@page { @bottom-center { font-size: 8pt; } margin: 15mm; }')).toEqual(['15mm']);
});

test('a comment holds no raw value, and a quote in it starts no string', () => {
  expect(rawValues(`/* don't read 2px */ .a { margin: 3px; } /* "nor 4px */ .b { margin: 5px; content: "/* 6px */"; }`)).toEqual(['3px', '5px']);
});

test('raw values are fine where tokens are defined, in :root and in comments, and nowhere else', () => {
  const css = `
    /* 100% of #219: opacity: 0.6; 8px */
    :root { --a: 0.6; --b: #fff; --space-6: calc(var(--space-1) * 1.5); }
    .x { margin: 2px; }
    @media (forced-colors: active) { :root { --c: 2px; } }
    .y { margin: 3px; }
    /* one comment ends where it ends */ .z { margin: 4px; } /* the next is another */`;

  expect(rawValues(css)).toEqual(['2px', '3px', '4px']);
});

// Below :root a custom property is a declaration like any other: the units and colours in it are read (a token has
// its value in :root), but it is no font shorthand, as nothing says that it holds one (see the header).
test('a custom property outside :root is read for its units and colours, but not as a font shorthand', () => {
  expect(rawValues('.x { --gap: 2px; --tone: #fff; --font: 700 var(--size) serif; }')).toEqual(['2px', '#fff']);
});

// A block of tokens is any rule whose selector is :root with attributes or pseudo-classes: a dark theme is
// `:root[data-theme='dark']` or `:root:not([data-theme='light'])`. A rule that merely starts with :root is not.
test('every :root block defines tokens, whatever attribute or pseudo-class it carries, and a rule below :root does not', () => {
  const css = `
    :root[data-theme='dark'] { --c: #000; --w: 2px; }
    :root:not([data-theme='light']) { --c: #000; }
    :root:not(:has([data-theme])) { --c: #000; }
    :root:not(:has(:is(:where([data-theme])))) { --c: #000; }
    :root:first-child{ --f: #000; }
    @media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { --d: 2px; } }
    :root .x { margin: 4px; }
    :root > .y { margin: 5px; }
    :rooted { margin: 6px; }
    :root::before { margin: 7px; }
    :root:not(:has(:is(:where(:is([data-theme]))))) { --g: 8px; }`;

  // The last has four levels of parentheses in :not(), one more than are read (see the header): no block of tokens.
  expect(rawValues(css)).toEqual(['4px', '5px', '6px', '7px', '8px']);
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
    @keyframes k { 50%, to { opacity: var(--opacity-disabled); } 25%, from { opacity: var(--opacity-disabled); } }
    @keyframes k2 { 10%,20.25%{ opacity: var(--opacity-disabled); } 30% , 40% { opacity: var(--opacity-disabled); } 33.33%, 66.66% { opacity: var(--opacity-disabled); } }
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
// read globals.css: they carry a :root of their own (src/print/styles.ts). As with icon.svg, what they share
// by name with the app must equal the app's tokens, and a colour, weight or line height they have must be one
// the app has too. Six tokens are the exception since the demo theme (below). A form takes its font from no token
// of the app: the app's own is Outfit, with `system-ui` after it, which is whatever the machine says, and the
// machine of the image says a Chinese font.

// The demo theme (ticket #150) makes the app black and set in Outfit, while the paper stays white and set in Arial. These six
// tokens keep their names in both and have other values on paper, so they are not held equal to the app's. What holds each on
// paper: the first three are read against the white paper by test/theme-contrast.test.ts, and the other three are pinned here.
const demoThemed = ['--color-text', '--color-text-muted', '--color-surface', '--color-border', '--font-weight-medium', '--font-weight-bold'];
const paperValues = { '--color-border': '#d3d9e2', '--font-weight-medium': '500', '--font-weight-bold': '700' };

test('the tokens of a printed form that the app has too have the same value, and a form invents no colour, weight or line height', () => {
  const app = tokensOf(read('globals.css'));
  const print = tokensOf(printTokens);
  const shared = Object.keys(print).filter((name) => name in app);

  expect(shared).toEqual(expect.arrayContaining(['--color-text', '--color-text-muted', '--font-weight-bold', '--line-height-base']));
  for (const name of shared.filter((token) => !demoThemed.includes(token))) expect(print[name], name).toBe(app[name]);
  expect(print).toMatchObject(paperValues);
  // The one exception is the black bar of the Hlavička tlačív (ticket #150): `--color-letterhead-*` are the colours of the app's theme laid
  // on paper, so each must be a colour the app has, under whatever name it has it.
  const appColours = Object.entries(app).filter(([name]) => name.startsWith('--color-')).map(([, value]) => value);
  const letterheadColour = (name: string) => name.startsWith('--color-letterhead-') && appColours.includes(print[name]!);
  expect(Object.keys(print).filter((name) => /^--(color|font-weight|line-height)/.test(name) && !(name in app) && !letterheadColour(name))).toEqual([]);
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
