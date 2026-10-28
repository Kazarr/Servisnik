import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { afterAll, expect, test } from 'vitest';
import { printPdf } from '../src/print/pdf.ts';
import { watchChromium } from './support/chromium.ts';
import { readPdf } from './support/pdf.ts';

// Printing (docs/adr/0001-stack.md, spec #95 Tlačivá): Chromium turns the HTML of a form into a PDF on A4. These
// tests print with the real Chromium; `pnpm e2e:install` fetches it, and CI does the same before `pnpm verify`.

const { launched, closeAll } = watchChromium();
afterAll(closeAll);

const page = (body: string) => `<!doctype html><html lang="sk"><head><meta charset="utf-8"><title>Skúška</title></head><body>${body}</body></html>`;
const millimetres = (mm: number) => (mm * 72) / 25.4;

// The first two run in this order: they count the launches of the one Chromium of the process.

test('Chromium starts with the first print, and every next print uses the same one', async () => {
  expect(launched).toHaveLength(0);

  await printPdf(page('<p>Prvá</p>'));
  await printPdf(page('<p>Druhá</p>'));

  expect(launched).toHaveLength(1);
});

test('after Chromium went away the next print starts a new one, and prints that start together share it', async () => {
  await launched[0]!.close();

  await Promise.all([printPdf(page('<p>A</p>')), printPdf(page('<p>B</p>')), printPdf(page('<p>C</p>'))]);

  expect(launched).toHaveLength(2);
});

test('a PDF is A4 with margins on every side and a printed background', async () => {
  const [first] = readPdf(await printPdf(page('<p style="background: rgb(255 0 0)">Červené pozadie</p>')));

  // 595 × 842 points; Chromium makes the page 595.92 × 842.88.
  expect(first!.width).toBeGreaterThan(595);
  expect(first!.width).toBeLessThan(597);
  expect(first!.height).toBeGreaterThan(842);
  expect(first!.height).toBeLessThan(844);
  for (const [side, margin] of Object.entries(first!.margins)) {
    expect(margin, side).toBeGreaterThan(millimetres(10));
    expect(margin, side).toBeLessThan(millimetres(25));
  }
  expect(first!.fills).toContain('1 0 0');
});

test('every page ends with "Strana X/Y", Y the number of pages, and a long text continues on the next page, whole', async () => {
  const lines = Array.from({ length: 150 }, (_, index) => `Riadok ${index + 1}`);

  const pages = readPdf(await printPdf(page(lines.map((line) => `<p>${line}</p>`).join(''))));

  expect(pages.length).toBeGreaterThan(1);
  pages.forEach((printed, index) => expect(printed.text.split('\n').at(-1)).toBe(`Strana ${index + 1}/${pages.length}`));
  const text = pages.map((printed) => printed.text).join('\n');
  for (const line of lines) expect(text).toContain(line);
});

test('Slovak letters print as letters: every one is in the text of the PDF and none is a missing glyph', async () => {
  const letters = 'ľščťžýáíéóúäôňĺŕďĽŠČŤŽÝÁÍÉÓÚÄÔŇĹŔĎ';

  const [first] = readPdf(await printPdf(page(`<p>${letters}</p>`)));

  expect(first!.text).toContain(letters);
  expect(first!.missingGlyphs).toBe(0);
});

// The check of the check (testing-strategy): U+10FFFE is a character no font has, so the reader must count it.
test('the reader of the PDF counts a character no font has as a missing glyph', async () => {
  const [first] = readPdf(await printPdf(page('<p>A\u{10FFFE}B</p>')));

  expect(first!.missingGlyphs).toBe(1);
});

test('a page that asks for something on the network is not answered, because nothing leaves the process', async () => {
  let asked = 0;
  const server = createServer((_request, response) => {
    asked++;
    response.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;

  await printPdf(page(`<p>Obrázok zo siete</p><img src="http://127.0.0.1:${port}/logo.png">`));
  await new Promise((resolve) => server.close(resolve));

  expect(asked).toBe(0);
});

test('a script in the HTML does not run: what the HTML says is printed and what a script would add is not', async () => {
  const [first] = readPdf(await printPdf(page(`<p>Pred skriptom</p><script>document.body.append('PRIDANE SKRIPTOM')</script>`)));

  expect(first!.text).toContain('Pred skriptom');
  expect(first!.text).not.toContain('PRIDANE SKRIPTOM');
});
