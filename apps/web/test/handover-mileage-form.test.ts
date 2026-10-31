import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { HandoverMileageForm } from '../src/app/(app)/zakazky/[id]/handover-mileage-form.tsx';
import { answered } from './support/action-state.ts';
import { input, labelOf, reasonOf, valueOf } from './support/form-markup.ts';
import { textOf } from './support/page-markup.ts';

// The form of the Kilometre pri odovzdaní (GLOSSARY, #164) on the detail of a Zákazka is a client component; it renders to markup
// over the values the page hands it and the answer of the action (useActionState holds that in the browser, and a render does not
// run it, so the hook is handed it, support/action-state.ts). What the action answers is in handover-mileage-actions.test.ts.

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useActionState: (await import('./support/action-state.ts')).useActionState,
}));
afterEach(() => {
  answered.state = null;
});

const id = '7d1c0a3e-0000-4000-8000-000000000001';
const drawn = (mileageKm: number | null = null) => renderToStaticMarkup(createElement(HandoverMileageForm, { workOrderId: id, mileageKm }));

test('the form names the Zákazka and asks for the kilometres at handover, one optional field', () => {
  const html = drawn();

  expect(valueOf(html, 'workOrderId')).toBe(id);
  expect(labelOf(html, 'handoverMileageKm')).toBe('Kilometre pri odovzdaní');
  expect(input(html, 'handoverMileageKm')).toContain('inputMode="numeric"');
  expect(input(html, 'handoverMileageKm')).not.toContain('required');
  expect(html).toContain('>Uložiť kilometre</button>');
});

test('the field starts empty when the Zákazka has no kilometres at handover, and with them when it has, 0 included', () => {
  expect(valueOf(drawn(), 'handoverMileageKm')).toBe('');
  expect(valueOf(drawn(100450), 'handoverMileageKm')).toBe('100450');
  expect(valueOf(drawn(0), 'handoverMileageKm')).toBe('0');
});

test('kilometres that were refused stay in the field with the reason tied to it', () => {
  answered.state = { values: { handoverMileageKm: '12,5' }, errors: { handoverMileageKm: 'Zadajte kilometre ako celé číslo, 0 alebo viac' } };

  const html = drawn(100450);

  expect(valueOf(html, 'handoverMileageKm')).toBe('12,5');
  expect(reasonOf(html, 'handoverMileageKm')).toBe('Zadajte kilometre ako celé číslo, 0 alebo viac');
});

test('a reason that is not a field’s is above the form', () => {
  answered.state = { values: { handoverMileageKm: '1' }, errors: { form: 'Nemáte oprávnenie na túto akciu' } };

  expect(drawn()).toContain('role="alert" class="error">Nemáte oprávnenie na túto akciu</p>');
});

test('kilometres saved lower than at intake say so, name both kilometres and that the Stav km of the vehicle stays, as a notice and no error', () => {
  answered.state = { values: { handoverMileageKm: '90000' }, errors: {}, lowerThanIntake: { intakeKm: 100000, vehicleMileageKm: 100000 } };

  const html = drawn(90000);

  expect(html).toContain('role="status"');
  expect(html).toMatch(/class="notice"/);
  expect(html).not.toContain('role="alert"');
  const text = textOf(html).replace(/\p{Zs}/gu, ' ');
  expect(text).toContain('Kilometre pri odovzdaní sú uložené.');
  expect(text).toContain('nižšie ako kilometre pri príjme (100 000 km)');
  expect(text).toContain('stav km vozidla je 100 000 km');
});

test('kilometres saved without a warning show no notice', () => {
  answered.state = { values: { handoverMileageKm: '100450' }, errors: {} };

  expect(drawn(100450)).not.toContain('role="status"');
});
