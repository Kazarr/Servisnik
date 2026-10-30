import { expect, test } from 'vitest';
import { printTokens } from '../src/print/styles.ts';
import { appCss, blend, contrast, hexesOf, hue, luminance, tokensOf, translucentOf, type Rgb } from './support/css-tokens.ts';

// The demo theme (ticket #150): black glossy surfaces, white text, a gold accent. What a person must be able to read
// is a number, so it is checked over the values of the tokens in globals.css, whatever the colours are called later.
// WCAG 2 asks 4.5 : 1 for text. The printed forms stay white, they are not part of the theme.

const tokens = tokensOf(appCss);
const minimum = 4.5;

/** The colour of a token that holds one colour. */
function colour(name: string): Rgb {
  const [rgb, ...more] = hexesOf(tokens[name] ?? '');
  if (!rgb || more.length > 0) throw new Error(`${name} is no single colour in globals.css`);
  return rgb;
}

/** The colours a gradient passes through, as the stops it names. */
function stops(name: string): Rgb[] {
  const found = hexesOf(tokens[name] ?? '');
  if (found.length === 0) throw new Error(`${name} is no gradient with colour stops in globals.css`);
  return found;
}

/**
 * The lightest the page gets: each stop of the gradient of the body, also with the white highlight at the top of
 * it laid over (--gloss-background carries it as rgba), so that text is held to the worst place it can stand on.
 */
function bodyBackdrops(): Rgb[] {
  const base = stops('--gloss-background');
  const highlights = translucentOf(tokens['--gloss-background'] ?? '');
  return [...base, ...base.flatMap((stop) => highlights.map(({ rgb, alpha }) => blend(rgb, alpha, stop)))];
}

const backdrops: Record<string, () => Rgb[]> = {
  'the background': () => [colour('--color-background')],
  'the surface': () => [colour('--color-surface')],
  'the gloss of the body': bodyBackdrops,
  'the gloss of a surface': () => stops('--gloss-surface'),
};

/** Every pair below 4.5 : 1, written as "text on backdrop (#colour): ratio"; none is the goal. */
function unreadable(texts: string[], onto: Record<string, () => Rgb[]>) {
  return texts.flatMap((text) =>
    Object.entries(onto).flatMap(([name, rgbs]) =>
      rgbs().flatMap((rgb) => (contrast(colour(text), rgb) < minimum ? [`${text} on ${name} (rgb ${rgb.map(Math.round).join(' ')}): ${contrast(colour(text), rgb).toFixed(2)}`] : [])),
    ),
  );
}

test('the theme has its gloss: a gradient for the page, for the surfaces and for the accent, and the highlight on the edge of a surface', () => {
  expect(Object.keys(tokens)).toEqual(expect.arrayContaining(['--gloss-background', '--gloss-surface', '--gloss-highlight', '--gloss-accent']));
});

test('the page is black and its text white', () => {
  expect(luminance(colour('--color-background'))).toBeLessThan(0.01);
  expect(luminance(colour('--color-text'))).toBeGreaterThan(0.9);
});

test('the text and the muted text read at 4.5 : 1 on the background, the surface and every shade of the gloss', () => {
  expect(unreadable(['--color-text', '--color-text-muted'], backdrops)).toEqual([]);
});

test('the gold accent reads as a link on the dark page and the dark text of a button reads on every stop of the gold gradient', () => {
  expect(unreadable(['--color-accent'], { 'the background': backdrops['the background']!, 'the surface': backdrops['the surface']! })).toEqual([]);
  expect(unreadable(['--color-accent-text'], { 'the accent': () => [colour('--color-accent')], 'the gloss of the accent': () => stops('--gloss-accent') })).toEqual([]);
});

test('the error text reads on the page and on a surface, and the white text on the red and the orange row', () => {
  expect(unreadable(['--color-danger'], { 'the background': backdrops['the background']!, 'the surface': backdrops['the surface']! })).toEqual([]);
  expect(
    unreadable(['--color-text'], { 'the red row': () => [colour('--color-danger-background')], 'the orange row': () => [colour('--color-warning-background')] }),
  ).toEqual([]);
});

// The label of a row ("Po termíne", "Na faktúru") is dark text on the colour of the row's bar.
test('the dark text of the label of a red and of an orange row reads on its colour', () => {
  expect(unreadable(['--color-accent-text'], { 'the red label': () => [colour('--color-danger')], 'the orange label': () => [colour('--color-warning')] })).toEqual([]);
});

// Red and orange are close on a dark page, so they are told apart by their hue, in the bar and in the row alike; the
// label of the row says it in words too (e2e/work-orders.spec.ts).
test('the red and the orange rows differ in hue by at least 15 degrees, in their bars and in their backgrounds, and no row is the colour of the surface', () => {
  const apart = (a: Rgb, b: Rgb) => Math.abs(hue(a) - hue(b));

  expect(apart(colour('--color-danger'), colour('--color-warning'))).toBeGreaterThanOrEqual(15);
  expect(apart(colour('--color-danger-background'), colour('--color-warning-background'))).toBeGreaterThanOrEqual(15);
  for (const row of ['--color-danger-background', '--color-warning-background']) expect(colour(row), row).not.toEqual(colour('--color-surface'));
});

// The forms are printed on white paper in Arial, outside the theme (src/print/styles.ts): their own colours must read on it.
test('the text and the muted text of a printed form read at 4.5 : 1 on the white paper and on the grey of its tables', () => {
  const print = tokensOf(printTokens);
  const white: Rgb = [255, 255, 255];
  const [surface] = hexesOf(print['--color-surface']!);

  for (const name of ['--color-text', '--color-text-muted']) {
    const [rgb] = hexesOf(print[name]!);
    expect(contrast(rgb!, white), `${name} on white`).toBeGreaterThanOrEqual(minimum);
    expect(contrast(rgb!, surface!), `${name} on the surface`).toBeGreaterThanOrEqual(minimum);
  }
});
