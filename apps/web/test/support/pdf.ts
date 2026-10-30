import { inflateSync } from 'node:zlib';

// Reads a PDF the way a test needs it: how large each page is and what text it shows. It reads what
// Chromium writes (Skia PDF): plain objects, Flate streams, fonts of the kind Type0 with a ToUnicode map and
// text shown in 2-byte glyph ids. It is no general PDF reader, and it throws on a PDF it does not understand
// rather than answer with nothing.

export type PdfPage = {
  /** The size of the page in points (1/72 inch). */
  width: number;
  height: number;
  /** The text of the page, one line of the page per line, in the order the page paints them; a no-break space reads as a space. */
  text: string;
  /** How many glyphs the page paints as the .notdef glyph (id 0) of its font, the "tofu" of a character that no font has. */
  missingGlyphs: number;
  /** The colours the page fills shapes and text with, as the "r g b" of the PDF (each 0 to 1), each once. A background is one of them. */
  fills: string[];
  /** The distance in points between each edge of the page and the area the content is clipped to, i.e. the margins of the print. */
  margins: { top: number; right: number; bottom: number; left: number };
};

type PdfObject = { dict: string; stream: Buffer | null };

function objectsOf(pdf: Buffer) {
  const objects = new Map<number, PdfObject>();
  for (const [, id, body = ''] of pdf.toString('latin1').matchAll(/(\d+) 0 obj([\s\S]*?)endobj/g)) {
    const stream = /stream\r?\n/.exec(body);
    let data: Buffer | null = null;
    if (stream) {
      data = Buffer.from(body.slice(stream.index + stream[0].length, body.lastIndexOf('endstream')), 'latin1');
      if (/FlateDecode/.test(body.slice(0, stream.index))) data = inflateSync(data);
    }
    objects.set(Number(id), { dict: stream ? body.slice(0, stream.index) : body, stream: data });
  }
  return objects;
}

const reference = (dict: string, key: string) => {
  const found = new RegExp(`/${key}\\s+(\\d+) 0 R`).exec(dict);
  return found ? Number(found[1]) : null;
};

/** The characters a ToUnicode map gives to the glyph ids of a font: `<id> <char>` pairs and `<first> <last> <char>` ranges. */
function glyphCharacters(cmap: string) {
  const characters = new Map<number, string>();
  const text = (hex: string) => Buffer.from(hex, 'hex').swap16().toString('utf16le');
  for (const [, pairs = ''] of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const [, id, char] of pairs.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) characters.set(parseInt(id!, 16), text(char!));
  for (const [, ranges = ''] of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
    for (const [, first, last, start] of ranges.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g))
      for (let id = parseInt(first!, 16); id <= parseInt(last!, 16); id++) characters.set(id, String.fromCharCode(parseInt(start!, 16) + id - parseInt(first!, 16)));
  return characters;
}

/**
 * Chromium scales the page (`.24 0 0 -.24 0 <height> cm`: y up, in CSS pixels) and clips the body to the area
 * inside the margins (`x y width height re W* n`), which is where the margins can be read from.
 */
function marginsOf(content: string, pageWidth: number, pageHeight: number) {
  const scale = /^\s*([\d.]+) 0 0 -[\d.]+ 0 [\d.]+ cm/.exec(content);
  const clip = /([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re\s+W\* n/.exec(content);
  if (!scale || !clip) throw new Error('The page has no scale and clip of the print area.');
  const [factor, x, y, width, height] = [scale[1], clip[1], clip[2], clip[3], clip[4]].map(Number) as [number, number, number, number, number];
  const [left, top] = [x * factor, y * factor];
  return { top, left, right: pageWidth - left - width * factor, bottom: pageHeight - top - height * factor };
}

/** Whether the page fills a shape or text with the colour `rgb` (0 to 255 each), give or take the rounding of the PDF. */
export const paintsWith = (page: PdfPage, rgb: [number, number, number]) =>
  page.fills.some((fill) => fill.split(' ').every((unit, index) => Math.abs(Number(unit) * 255 - rgb[index]!) < 1));

/** The fonts a PDF embeds, each once, by the name the font has itself: `ArialMT`, `LiberationSans-Bold`. */
export const fontsOf = (bytes: Uint8Array) => [
  ...new Set([...Buffer.from(bytes).toString('latin1').matchAll(/\/BaseFont \/(?:[A-Z]{6}\+)?([\w-]+)/g)].map(([, name]) => name!)),
];

export function readPdf(bytes: Uint8Array): PdfPage[] {
  const objects = objectsOf(Buffer.from(bytes));
  const get = (id: number) => objects.get(id) ?? (() => { throw new Error(`The PDF has no object ${id}.`); })();
  const pages = [...objects.values()].filter(({ dict }) => /\/Type\s*\/Pages\b/.test(dict));
  if (pages.length !== 1) throw new Error(`Expected one page tree, found ${pages.length}.`);
  const kids = [...pages[0]!.dict.matchAll(/(\d+) 0 R/g)].map(([, id]) => Number(id));

  return kids.map((kid) => {
    const { dict } = get(kid);
    const box = /\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/.exec(dict);
    if (!box) throw new Error(`Page ${kid} has no MediaBox from 0 0.`);
    // `/F4 4 0 R`: the name a content stream uses for a font, and the font object.
    const fonts = new Map(
      [...(/\/Font\s*<<([^>]*)>>/.exec(dict)?.[1] ?? '').matchAll(/\/(F\d+)\s+(\d+) 0 R/g)].map(([, name, id]) => [name!, glyphCharacters(get(reference(get(Number(id)).dict, 'ToUnicode')!).stream!.toString('latin1'))]),
    );
    const content = get(reference(dict, 'Contents')!).stream!.toString('latin1');

    // A text run is what one `BT` shows from one `Tm`, the y of which is its baseline. Runs on one baseline are one line:
    // "Strana ", "1", "/" and "3" of the footer are four runs.
    const lines: { baseline: string; text: string }[] = [];
    let characters = new Map<number, string>();
    let baseline = '';
    let run = '';
    let missingGlyphs = 0;
    const show = (hex: string) => {
      for (const glyph of hex.match(/.{4}/g) ?? []) {
        const id = parseInt(glyph, 16);
        if (id === 0) missingGlyphs++;
        run += characters.get(id) ?? '';
      }
    };
    const end = () => {
      if (!run) return;
      const last = lines.at(-1);
      if (last?.baseline === baseline) last.text += run;
      else lines.push({ baseline, text: run });
      run = '';
    };
    const operators = /\/(F\d+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]+)>\s*Tj|\[([^\]]*)\]\s*TJ|(?:-?[\d.]+\s+){5}(-?[\d.]+)\s+Tm|\bET\b/g;
    for (const [token, font, hex, array, y] of content.matchAll(operators)) {
      if (font) characters = fonts.get(font) ?? characters;
      else if (hex) show(hex);
      else if (array) for (const [, string] of array.matchAll(/<([0-9A-Fa-f]+)>/g)) show(string!);
      else if (y !== undefined) {
        end();
        baseline = y;
      } else if (token === 'ET') end();
    }
    end();
    const width = Number(box[1]);
    const height = Number(box[2]);
    return {
      width,
      height,
      text: lines.map(({ text }) => text).join('\n').replace(/\p{Zs}/gu, ' '),
      missingGlyphs,
      fills: [...new Set([...content.matchAll(/(\S+ \S+ \S+) rg\b/g)].map(([, colour]) => colour!))],
      margins: marginsOf(content, width, height),
    };
  });
}
