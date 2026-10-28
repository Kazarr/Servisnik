import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { LabourForm } from '../src/app/(app)/zakazky/[id]/labour-form.tsx';

// The page of a Zákazka is an async Server Component, which Vitest cannot run (docs/adr/0001-stack.md).
// The form for new work is a plain component, rendered here over the rates the page hands it.

const render = (rates: { defaultVatRate: number; hourlyRateCents: number | null }) =>
  renderToStaticMarkup(createElement(LabourForm, { workOrderId: '7d1c0a3e-0000-4000-8000-000000000001', ...rates }));

/** The `<input>` of the field with this name, as markup. */
function input(html: string, name: string) {
  const found = new RegExp(`<input[^>]*\\sname="${name}"[^>]*>`).exec(html);
  if (!found) throw new Error(`No input named ${name}.`);
  return found[0];
}

test.each([19, 5, 0])('the VAT rate starts as the default rate of Nastavenia: %i', (defaultVatRate) => {
  const html = render({ defaultVatRate, hourlyRateCents: null });

  expect(input(html, 'vatRate')).toContain(`value="${defaultVatRate}"`);
});

test('the price starts as the hourly rate of Nastavenia, as the admin types a price', () => {
  const html = render({ defaultVatRate: 23, hourlyRateCents: 4550 });

  expect(input(html, 'unitPrice')).toContain('value="45,50"');
});

test('without an hourly rate the price starts empty', () => {
  const html = render({ defaultVatRate: 23, hourlyRateCents: null });

  expect(input(html, 'unitPrice')).toContain('value=""');
});

test('an hourly rate of 0 € is a price, not none', () => {
  const html = render({ defaultVatRate: 23, hourlyRateCents: 0 });

  expect(input(html, 'unitPrice')).toContain('value="0,00"');
});
