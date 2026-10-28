import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { WorkOrderForm } from '../src/app/(app)/zakazky/work-order-form.tsx';

// The form of a Zákazka is a client component; it renders to markup over the values the page hands it
// (the page itself is an async Server Component, which Vitest cannot run, docs/adr/0001-stack.md).

const action = async () => null;
const customers = [
  { id: 'c1', name: 'Firma s.r.o.' },
  { id: 'c2', name: 'Ján Novák' },
];
const intake = { vehicleId: 'v1', ownerId: 'c1', customers };
const saved: { id: string; mileageKm: number; customerRequest: string; deadline: string | null; note: string | null } = {
  id: '7d1c0a3e-0000-4000-8000-000000000001',
  mileageKm: 150000,
  customerRequest: 'Výmena brzdových kotúčov',
  deadline: '2026-08-01',
  note: 'Zákazník príde po 16:00',
};

const renderNew = () => renderToStaticMarkup(createElement(WorkOrderForm, { action, intake }));
const renderEdit = (overrides: Partial<typeof saved> = {}) => renderToStaticMarkup(createElement(WorkOrderForm, { action, saved: { ...saved, ...overrides } }));

/** The `<input>` of the field with this name, as markup, or undefined. */
const input = (html: string, name: string) => new RegExp(`<input[^>]*\\sname="${name}"[^>]*>`).exec(html)?.[0];

/** The `<textarea>` of the field with this name, as markup with its text, or undefined. */
const textarea = (html: string, name: string) => new RegExp(`<textarea[^>]*\\sname="${name}"[^>]*>[^<]*</textarea>`).exec(html)?.[0];

test('the form of a new Zákazka asks for the Termín as a date and for an internal note, both optional and empty', () => {
  const html = renderNew();

  expect(input(html, 'deadline')).toContain('type="date"');
  expect(input(html, 'deadline')).not.toContain('required');
  expect(input(html, 'deadline')).toContain('value=""');
  expect(html).toContain('>Termín</label>');
  expect(textarea(html, 'note')).not.toContain('required');
  expect(textarea(html, 'note')).toMatch(/><\/textarea>$/);
  expect(html).toContain('>Poznámka (interná)</label>');
});

test('the form of a new Zákazka names the vehicle, lets the customer be chosen and starts at the owner', () => {
  const html = renderNew();

  expect(input(html, 'vehicleId')).toContain('value="v1"');
  expect(html).toContain('<option value="c1" selected="">Firma s.r.o.</option>');
  expect(html).toContain('<option value="c2">Ján Novák</option>');
  expect(input(html, 'id')).toBeUndefined();
});

test('the form that edits a Zákazka starts with its kilometres, request, Termín and note, and names the Zákazka', () => {
  const html = renderEdit();

  expect(input(html, 'id')).toContain('value="7d1c0a3e-0000-4000-8000-000000000001"');
  expect(input(html, 'mileageKm')).toContain('value="150000"');
  expect(textarea(html, 'customerRequest')).toContain('>Výmena brzdových kotúčov</textarea>');
  expect(input(html, 'deadline')).toContain('value="2026-08-01"');
  expect(textarea(html, 'note')).toContain('>Zákazník príde po 16:00</textarea>');
});

test('the form that edits a Zákazka has no customer and no vehicle to choose, which an edit does not change', () => {
  const html = renderEdit();

  expect(html).not.toContain('<select');
  expect(input(html, 'vehicleId')).toBeUndefined();
});

test('the form that edits a Zákazka without a Termín or a note starts with those empty, not with "null"', () => {
  const html = renderEdit({ deadline: null, note: null });

  expect(input(html, 'deadline')).toContain('value=""');
  expect(textarea(html, 'note')).toMatch(/><\/textarea>$/);
  expect(html).not.toMatch(/value="null"|>null</);
});
