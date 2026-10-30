import { expect, test } from 'vitest';
import { defaultLetterhead, letterheads, parseLetterhead, printFileName } from '../src/print/index.ts';

// Tlačivá (GLOSSARY): the file a form is downloaded as is named by the number of its Zákazka (spec #95, Tlačivá).

test('the zákazkový list is downloaded as the number of its Zákazka and "zakazkovy-list", in a PDF', () => {
  expect(printFileName('Z2026-0001', 'jobSheet')).toBe('Z2026-0001-zakazkovy-list.pdf');
  expect(printFileName('Z2027-0123', 'jobSheet')).toBe('Z2027-0123-zakazkovy-list.pdf');
});

test('the cenová ponuka is downloaded as the number of its Zákazka and "cenova-ponuka"', () => {
  expect(printFileName('Z2026-0001', 'quote')).toBe('Z2026-0001-cenova-ponuka.pdf');
});

test('the odovzdávací protokol is downloaded as the number of its Zákazka and "odovzdavaci-protokol"', () => {
  expect(printFileName('Z2026-0001', 'handoverProtocol')).toBe('Z2026-0001-odovzdavaci-protokol.pdf');
});

// The Hlavička tlačív (GLOSSARY): the top of every printed form is white, or a black bar. The admin picks one in Nastavenia.

test('the Hlavička tlačív is white or a black bar, and white until the admin picks the other', () => {
  expect(letterheads).toEqual(['white', 'blackBar']);
  expect(defaultLetterhead).toBe('white');
});

test('a form that sends one of the two Hlavičky is understood, anything else is not one', () => {
  expect(parseLetterhead('white')).toBe('white');
  expect(parseLetterhead('blackBar')).toBe('blackBar');
  for (const typed of ['', ' white', 'White', 'black', 'blackbar', 'Biela', 'Čierny pruh', 'constructor', '__proto__']) expect(parseLetterhead(typed), typed).toBeNull();
});
