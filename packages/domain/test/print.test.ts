import { expect, test } from 'vitest';
import { printFileName } from '../src/print/index.ts';

// Tlačivá (GLOSSARY): the file a form is downloaded as is named by the number of its Zákazka (spec #95, Tlačivá).

test('the zákazkový list is downloaded as the number of its Zákazka and "zakazkovy-list", in a PDF', () => {
  expect(printFileName('Z2026-0001', 'jobSheet')).toBe('Z2026-0001-zakazkovy-list.pdf');
  expect(printFileName('Z2027-0123', 'jobSheet')).toBe('Z2027-0123-zakazkovy-list.pdf');
});
