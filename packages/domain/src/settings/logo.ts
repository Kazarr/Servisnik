// The logo of the Autoservis (GLOSSARY: Nastavenia). Pure rules: no framework, database or network.

/** The most a logo file may hold: 1 MB, as 1 MiB (1 048 576 bytes), the limit itself included. */
export const maxLogoBytes = 1_048_576;

export type LogoContentType = 'image/png' | 'image/jpeg';
export type LogoError = 'too-large' | 'unsupported-type';

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const jpegSignature = [0xff, 0xd8, 0xff];

const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((byte, i) => bytes[i] === byte);

/**
 * Whether `bytes` are a logo the Autoservis may keep, and which type of image they are. The type comes
 * from the signature at the start of the content, never from the name or the type the sender claimed.
 * The size is checked first: it is what an upload can know before it has read the whole file.
 */
export function checkLogo(bytes: Uint8Array): { ok: true; contentType: LogoContentType } | { ok: false; error: LogoError } {
  if (bytes.length > maxLogoBytes) return { ok: false, error: 'too-large' };
  if (startsWith(bytes, pngSignature)) return { ok: true, contentType: 'image/png' };
  if (startsWith(bytes, jpegSignature)) return { ok: true, contentType: 'image/jpeg' };
  return { ok: false, error: 'unsupported-type' };
}
