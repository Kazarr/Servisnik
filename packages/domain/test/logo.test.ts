import { describe, expect, test } from 'vitest';
import { checkLogo, maxLogoBytes } from '../src/settings/index.ts';

// The logo of the autoservis (GLOSSARY: Nastavenia): what a file is is decided by its content, never by its name.

const bytes = (...values: number[]) => Uint8Array.from(values);
const text = (value: string) => new TextEncoder().encode(value);
/** `head` followed by zeros up to `length` bytes. */
const padded = (head: Uint8Array, length: number) => Uint8Array.from({ length }, (_, i) => head[i] ?? 0);

const pngHead = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52);
const jpegHead = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0);

describe('the type of a logo', () => {
  test('a PNG is recognised by its signature', () => {
    expect(checkLogo(pngHead)).toEqual({ ok: true, contentType: 'image/png' });
  });

  test('a JPEG is recognised by its signature, whichever segment follows it', () => {
    expect(checkLogo(jpegHead)).toEqual({ ok: true, contentType: 'image/jpeg' });
    expect(checkLogo(bytes(0xff, 0xd8, 0xff, 0xdb, 0, 0x43))).toEqual({ ok: true, contentType: 'image/jpeg' });
  });

  test.each([
    ['a GIF87a', text('GIF87a\x01\x00\x01\x00')],
    ['a GIF89a', text('GIF89a\x01\x00\x01\x00')],
    ['a WebP', text('RIFF\x24\x00\x00\x00WEBPVP8 ')],
    ['text that was renamed to .png', text('To nie je obrázok, len text premenovaný na logo.png')],
    ['an SVG with a script, which a browser would run', text('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>')],
    ['an HTML page', text('<!doctype html><script>alert(1)</script>')],
    ['a PNG signature cut short', pngHead.slice(0, 7)],
    ['a PNG signature with one wrong byte', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b, 0, 0, 0, 13)],
    ['a JPEG signature cut short', bytes(0xff, 0xd8)],
    ['a JPEG that starts one byte late', bytes(0, 0xff, 0xd8, 0xff, 0xe0)],
    ['an empty file', new Uint8Array()],
  ])('%s is refused as neither PNG nor JPEG', (_what, content) => {
    expect(checkLogo(content)).toEqual({ ok: false, error: 'unsupported-type' });
  });
});

describe('the size of a logo', () => {
  test('is at most 1 MB (1 048 576 bytes), the limit itself included', () => {
    expect(maxLogoBytes).toBe(1_048_576);
    expect(checkLogo(padded(pngHead, maxLogoBytes))).toEqual({ ok: true, contentType: 'image/png' });
    expect(checkLogo(padded(jpegHead, maxLogoBytes))).toEqual({ ok: true, contentType: 'image/jpeg' });
  });

  test('a byte above the limit is refused as too large', () => {
    expect(checkLogo(padded(pngHead, maxLogoBytes + 1))).toEqual({ ok: false, error: 'too-large' });
  });

  // Both rules are broken at once: the file is too large and not an image. The size is what the upload reads first.
  test('a file that is too large and of another type is refused as too large', () => {
    expect(checkLogo(padded(text('GIF89a'), maxLogoBytes + 1))).toEqual({ ok: false, error: 'too-large' });
  });
});
