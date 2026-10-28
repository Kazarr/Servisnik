import { parseUnitPrice } from '@servisnik/domain/work-order';
import { expect, test } from 'vitest';
import { formatEuroInput } from '../src/format.ts';

// A price in a field of a form: what the admin reads there is what the domain reads back.

test.each([
  [4000, '40,00'],
  [4550, '45,50'],
  [5, '0,05'],
  [0, '0,00'],
  [100_000_000, '1000000,00'],
])('%i cents are "%s" in a field', (cents, typed) => {
  expect(formatEuroInput(cents)).toBe(typed);
});

test.each([0, 1, 99, 100, 4550, 3333, 100_000_000])('%i cents typed in a field are read as %i cents again', (cents) => {
  expect(parseUnitPrice(formatEuroInput(cents))).toBe(cents);
});
