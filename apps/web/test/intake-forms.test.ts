import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { CustomerFields } from '../src/app/(app)/zakaznici/customer-fields.tsx';
import { VehicleFields } from '../src/app/(app)/vozidla/vehicle-fields.tsx';
import { LowerMileageNotice } from '../src/app/(app)/zakazky/nova/lower-mileage-notice.tsx';

// The intake saves a Zákazník, a Vozidlo and a Zákazka from one form. The pages are async Server Components,
// which Vitest cannot run (docs/adr/0001-stack.md); the parts of the form are plain components, rendered here.

const blank = () => '';
const existingId = '7d1c0a3e-0000-4000-8000-000000000001';
const ownerId = '7d1c0a3e-0000-4000-8000-000000000002';

/** The `name` of every input, select and textarea in the markup. */
const namesIn = (html: string) => [...html.matchAll(/<(?:input|select|textarea)[^>]*\sname="([^"]*)"/g)].map(([, name]) => name);

/** The `href` of the link whose text contains `text`. */
function hrefOf(html: string, text: string) {
  const found = new RegExp(`<a href="([^"]*)"[^>]*>[^<]*${text}`).exec(html);
  if (!found) throw new Error(`No link with the text ${text}.`);
  return found[1];
}

const vehicleFields = (props: Partial<Parameters<typeof VehicleFields>[0]> = {}) =>
  renderToStaticMarkup(createElement(VehicleFields, { value: blank, errors: {}, ...props }));
const customerFields = (props: Partial<Parameters<typeof CustomerFields>[0]> = {}) =>
  renderToStaticMarkup(createElement(CustomerFields, { value: blank, errors: {}, type: 'company', ...props }));

const takenVehicle = { id: existingId, make: 'Škoda', model: 'Octavia', owner: { id: ownerId, name: 'Firma s.r.o.' } };

test('the fields of a Vozidlo are named as the form of a Vozidlo sends them, with the Stav km', () => {
  expect(namesIn(vehicleFields())).toEqual(['vin', 'licensePlate', 'make', 'model', 'year', 'fuel', 'mileageKm', 'note']);
});

test('in an intake the fields of a Vozidlo are named under "vehicle." and have no Stav km, because the kilometres at intake are it', () => {
  const html = vehicleFields({ intake: true });

  expect(namesIn(html)).toEqual(['vehicle.vin', 'vehicle.licensePlate', 'vehicle.make', 'vehicle.model', 'vehicle.year', 'vehicle.fuel', 'vehicle.note']);
  expect(html).not.toContain('Stav km');
});

test('a VIN that is taken leads to the detail of the Vozidlo and its Majiteľ', () => {
  const html = vehicleFields({ errors: { vin: 'Vozidlo s týmto VIN už existuje' }, existing: takenVehicle });

  expect(html).toContain('Vozidlo s týmto VIN už existuje');
  expect(hrefOf(html, 'Škoda Octavia')).toBe(`/vozidla/${existingId}`);
  expect(hrefOf(html, 'Firma s.r.o.')).toBe(`/zakaznici/${ownerId}`);
});

test('in an intake a VIN that is taken leads to a Zákazka for that Vozidlo, and to its Majiteľ', () => {
  const html = vehicleFields({ intake: true, errors: { vin: 'Vozidlo s týmto VIN už existuje' }, existing: takenVehicle });

  expect(html).toContain('Vozidlo s týmto VIN už existuje');
  expect(hrefOf(html, 'Založiť zákazku')).toBe(`/zakazky/nova?vozidlo=${existingId}`);
  expect(html).toContain('Škoda Octavia');
  expect(hrefOf(html, 'Firma s.r.o.')).toBe(`/zakaznici/${ownerId}`);
});

test('the fields of a Zákazník are named as the form of a Zákazník sends them', () => {
  expect(namesIn(customerFields())).toEqual(['type', 'type', 'name', 'ico', 'dic', 'icDph', 'street', 'city', 'postalCode', 'phone', 'email', 'note']);
});

test('in an intake the fields of a Zákazník are named under "customer."', () => {
  const names = namesIn(customerFields({ intake: true }));

  expect(names).toEqual(['customer.type', 'customer.type', 'customer.name', 'customer.ico', 'customer.dic', 'customer.icDph', 'customer.street', 'customer.city', 'customer.postalCode', 'customer.phone', 'customer.email', 'customer.note']);
});

test('an Osoba has no company fields in an intake either', () => {
  expect(namesIn(customerFields({ intake: true, type: 'person' }))).not.toContain('customer.ico');
});

test('an IČO that is taken leads to the detail of the Firma', () => {
  const html = customerFields({ errors: { ico: 'Firma s týmto IČO už existuje' }, existing: { id: ownerId, name: 'Firma s.r.o.' } });

  expect(hrefOf(html, 'Firma s.r.o.')).toBe(`/zakaznici/${ownerId}`);
});

test('in an intake an IČO that is taken leads on with that Firma as the Majiteľ of the new Vozidlo', () => {
  const html = customerFields({ intake: true, errors: { ico: 'Firma s týmto IČO už existuje' }, existing: { id: ownerId, name: 'Firma s.r.o.' } });

  expect(html).toContain('Firma s týmto IČO už existuje');
  expect(hrefOf(html, 'Firma s.r.o.')).toBe(`/zakazky/nova/nove-vozidlo?zakaznik=${ownerId}`);
});

test('a Zákazka saved with lower kilometres says so, names the Stav km of the vehicle that stays, and leads to the Zákazka', () => {
  const html = renderToStaticMarkup(createElement(LowerMileageNotice, { id: existingId, number: 'Z2026-0007', vehicleMileageKm: 100000 }));

  expect(html).toContain('role="status"');
  expect(html).toContain('Z2026-0007');
  expect(html).toMatch(/nižšie ako stav km vozidla \(100\s000 km\)/);
  expect(html).toContain('stav km vozidla sa nezmenil');
  expect(hrefOf(html, 'Z2026-0007')).toBe(`/zakazky/${existingId}`);
});

test('a Zákazka saved with lower kilometres is a notice and no error: it has the class of a notice and none of an error', () => {
  const html = renderToStaticMarkup(createElement(LowerMileageNotice, { id: existingId, number: 'Z2026-0007', vehicleMileageKm: 100000 }));

  expect(html).toMatch(/class="notice"/);
  expect(html).not.toMatch(/class="[^"]*\berror\b/);
  expect(html).not.toContain('role="alert"');
});
