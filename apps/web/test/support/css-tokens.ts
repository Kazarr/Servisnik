import { readFileSync } from 'node:fs';

// The design tokens of globals.css as values a test can compute with: colours, their contrast and their hue.

export const appCss = readFileSync(new URL('../../src/app/globals.css', import.meta.url), 'utf8');

/** A CSS comment; a rule is read without it. */
export const COMMENT = /\/\*[\s\S]*?\*\//g;

/** The custom properties a CSS text defines, by name. A token that is not there is not a key. */
export const tokensOf = (css: string): Record<string, string> =>
  Object.fromEntries([...css.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name!, value!.trim()]));

export type Rgb = [number, number, number];

const channel = (digits: string) => parseInt(digits.length === 1 ? digits + digits : digits, 16);

/** Every `#rgb` and `#rrggbb` in a value, in order: the stops of a gradient, or the one colour of a token. */
export const hexesOf = (value: string): Rgb[] =>
  [...value.matchAll(/#([0-9a-f]{3}|[0-9a-f]{6})(?![0-9a-f])/gi)].map(([, hex]) => {
    const size = hex!.length / 3;
    return [channel(hex!.slice(0, size)), channel(hex!.slice(size, 2 * size)), channel(hex!.slice(2 * size))];
  });

/** The `rgba(r, g, b, a)` colours in a value: what a gradient lays over the colours below it. */
export const translucentOf = (value: string) =>
  [...value.matchAll(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/g)].map(([, r, g, b, alpha]) => ({ rgb: [Number(r), Number(g), Number(b)] as Rgb, alpha: Number(alpha) }));

/** `top` laid over `bottom` with the opacity `alpha`. */
export const blend = (top: Rgb, alpha: number, bottom: Rgb): Rgb => top.map((value, index) => value * alpha + bottom[index]! * (1 - alpha)) as Rgb;

/** The relative luminance of WCAG 2: 0 is black, 1 is white. */
export const luminance = (rgb: Rgb) => {
  const [r, g, b] = rgb.map((value) => {
    const unit = value / 255;
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** The contrast ratio of WCAG 2, 1 to 21. */
export const contrast = (a: Rgb, b: Rgb) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
};

/** The hue of a colour in degrees, 0 to 360 (0 is red, 30 orange, 60 yellow). */
export const hue = ([r, g, b]: Rgb) => {
  const [max, min] = [Math.max(r, g, b), Math.min(r, g, b)];
  if (max === min) return 0;
  const sector = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
  return (sector * 60 + 360) % 360;
};

/** The colour as the browser writes a computed colour: `rgb(5, 5, 5)`. */
export const cssRgb = ([r, g, b]: Rgb) => `rgb(${r}, ${g}, ${b})`;

const tokens = tokensOf(appCss);

/** A colour token of globals.css as the browser writes it once computed, for `toHaveCSS`; the first colour when a token has several. */
export const colour = (name: string) => cssRgb(hexesOf(tokens[name]!)[0]!);
