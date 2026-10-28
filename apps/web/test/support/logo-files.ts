// Files a test or a spec sends as the logo of the autoservis. What matters to the app is the start of the content.

/** A complete 1×1 PNG, so a browser can draw it. */
export const png = new Uint8Array(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
);

/** Starts like a JPEG (SOI, then a JFIF segment) and holds nothing else, which is all the app looks at. */
export const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);

export const gif = new TextEncoder().encode('GIF89a\x01\x00\x01\x00\x00\x00\x00;');

/** Text that someone named `logo.png`. */
export const textNamedPng = new TextEncoder().encode('To nie je obrázok, len text premenovaný na logo.png');

/** `head` followed by zeros up to `length` bytes: a file of that size that starts like `head`. */
export const padded = (head: Uint8Array, length: number) => Uint8Array.from({ length }, (_, i) => head[i] ?? 0);
