import { localDate, type ItemInput, type WorkOrderStatus } from '@servisnik/domain/work-order';
import type { WorkshopDetailsInput } from '@servisnik/domain/workshop';
import { eq } from 'drizzle-orm';
import { saveLogo } from './dal/logo.ts';
import type { User } from './dal/user.ts';
import { getWorkshopDetails, saveWorkshopDetails } from './dal/workshop.ts';
import { addItem, changeWorkOrderStatus, createIntake } from './dal/work-orders.ts';
import type { Database } from './db/index.ts';
import { vehicle } from './db/schema.ts';

// The demo environment (ticket #150): the autoservis of the customer the app is shown to, with Zákazky on premium and sports
// cars to look at. `pnpm db:demo` runs it by hand against the database of the demo; no deploy and no `db:seed` does.
// Every customer, ŠPZ and VIN here is made up, and every customer is an Osoba, so that no company that exists is named.

/** The one who makes the demo data: the DAL asks for a user with the Rola of the admin, as the specs do (e2e/records.ts). */
const demo: User = { id: 'demo', email: 'demo@autoservis.test', name: 'Demo', role: 'admin' };

/** The logo of the customer, white on a black square, from the site of the customer (ticket #150). The repository is public, so it keeps no copy. */
export const demoLogoUrl = 'https://www.jmautocentrum.sk/wp-content/uploads/2023/04/Untitled-2.jpeg';

/** What `downloadLogo` needs of `fetch`, so that a test can hand it another. */
type Fetch = (url: string, init: { signal: AbortSignal }) => Promise<Response>;

/**
 * The bytes at `demoLogoUrl`, or null when there are none: an answer that is not a success, a broken connection, or a server that
 * is silent for `timeoutMs`. Whether the bytes are an image is for `saveLogo` to say.
 */
export async function downloadLogo(fetchLogo: Fetch = fetch, timeoutMs = 10_000): Promise<Uint8Array | null> {
  try {
    const response = await fetchLogo(demoLogoUrl, { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/** Údaje autoservisu as the obchodný register has them (Finstat, ticket #150). The IBAN and the entry of the register are not in it. The phone is left out on purpose: the repository is public, so the admin types it in Nastavenia. */
const registry = {
  name: 'Autocentrum Slovensko s. r. o.',
  street: 'Rozkvet 2055/118',
  city: 'Považská Bystrica',
  postalCode: '017 01',
  ico: '54436079',
  dic: '2121662114',
  icDph: 'SK2121662114',
  vatPayerType: 'payer',
  email: 'jmautocentrum@jmautocentrum.sk',
} as const;

type DemoOrder = {
  customer: string;
  vehicle: { vin: string; licensePlate: string; make: string; model: string; year: string; fuel: 'petrol' | 'electric' };
  mileageKm: string;
  customerRequest: string;
  /** Where the Zákazka ends up; a Zákazka that is Hotová is one to invoice. */
  status: Exclude<WorkOrderStatus, 'invoiced' | 'cancelled'>;
  /** The Termín, in days from today: a negative one is over. */
  deadlineInDays?: number;
  items: ItemInput[];
};

const labour = (name: string, quantity: string, salePrice: string): ItemInput => ({ kind: 'labour', name, quantity, salePrice, vatRate: '23' });
const part = (code: string, name: string, quantity: string, unit: string, purchasePrice: string, salePrice: string): ItemInput => ({
  kind: 'part',
  code,
  name,
  quantity,
  unit,
  purchasePrice,
  salePrice,
  vatRate: '23',
});

const demoOrders: DemoOrder[] = [
  {
    customer: 'Peter Valent',
    vehicle: { vin: 'WP0ZZZ99ZPS900101', licensePlate: 'PB901AA', make: 'Porsche', model: '911 GT3', year: '2022', fuel: 'petrol' },
    mileageKm: '8 400',
    customerRequest: 'Výmena predných brzdových kotúčov a doštičiek, kontrola podvozka po okruhu.',
    status: 'inProgress',
    deadlineInDays: 2,
    items: [
      labour('Výmena brzdových kotúčov a doštičiek, predná náprava', '3', '95'),
      part('BRK-992-K', 'Brzdové kotúče predné (sada)', '1', 'ks', '1420', '1890'),
      part('BRK-992-D', 'Brzdové doštičky predné (sada)', '1', 'ks', '310', '429'),
      labour('Kontrola podvozka a geometrie', '1,5', '95'),
    ],
  },
  {
    customer: 'Lucia Hrušková',
    vehicle: { vin: 'WUAZZZF2ZMN900102', licensePlate: 'TN902AB', make: 'Audi', model: 'RS6 Avant', year: '2021', fuel: 'petrol' },
    mileageKm: '41 200',
    customerRequest: 'Servis automatickej prevodovky a výmena zapaľovacích sviečok.',
    status: 'waitingForParts',
    deadlineInDays: 5,
    items: [
      labour('Servis automatickej prevodovky', '2,5', '95'),
      part('ATF-8HP', 'Olej do prevodovky ATF', '8', 'l', '22', '34'),
      part('FLT-8HP', 'Filter prevodovky s tesnením', '1', 'ks', '118', '179'),
      part('SPK-RS6', 'Zapaľovacia sviečka', '8', 'ks', '17', '27'),
      labour('Výmena zapaľovacích sviečok', '2', '95'),
    ],
  },
  {
    customer: 'Tomáš Kollár',
    vehicle: { vin: 'WBSZZZ8Z0PC900103', licensePlate: 'ZA903AC', make: 'BMW', model: 'M3 Competition', year: '2023', fuel: 'petrol' },
    mileageKm: '15 900',
    customerRequest: 'Výmena oleja a filtrov, aktualizácia softvéru riadiacich jednotiek.',
    status: 'done',
    deadlineInDays: -1,
    items: [
      labour('Olejový servis', '1,5', '95'),
      part('OIL-S58', 'Motorový olej 5W-30', '7', 'l', '19', '31'),
      part('FLT-S58', 'Olejový filter', '1', 'ks', '14', '24'),
      labour('Aktualizácia softvéru riadiacich jednotiek', '1', '95'),
    ],
  },
  {
    customer: 'Martina Danišová',
    vehicle: { vin: 'ZHWZZZ4ZXLL900104', licensePlate: 'PB904AD', make: 'Lamborghini', model: 'Huracán EVO', year: '2020', fuel: 'petrol' },
    mileageKm: '12 300',
    customerRequest: 'Ročný servis a výmena brzdovej kvapaliny.',
    status: 'received',
    deadlineInDays: 7,
    items: [
      labour('Ročný servis', '4', '120'),
      part('OIL-V10', 'Motorový olej 5W-40', '9', 'l', '28', '44'),
      part('FLT-AIR', 'Vzduchový filter', '2', 'ks', '62', '98'),
    ],
  },
  {
    customer: 'Roman Bielik',
    vehicle: { vin: 'W1KZZZ8Z0NA900105', licensePlate: 'PU905AE', make: 'Mercedes-AMG', model: 'GT 63 S', year: '2022', fuel: 'petrol' },
    mileageKm: '22 700',
    customerRequest: 'Vibrácie pri brzdení, výmena predných brzdových kotúčov.',
    status: 'inProgress',
    deadlineInDays: -2,
    items: [
      labour('Diagnostika vibrácií pri brzdení', '1', '95'),
      labour('Výmena brzdových kotúčov', '2,5', '95'),
      part('BRK-GT-K', 'Brzdové kotúče predné (pár)', '1', 'ks', '640', '890'),
    ],
  },
  {
    customer: 'Jana Šimková',
    vehicle: { vin: 'WP0ZZZY1ZPS900106', licensePlate: 'BA906AF', make: 'Porsche', model: 'Taycan Turbo S', year: '2023', fuel: 'electric' },
    mileageKm: '9 800',
    customerRequest: 'Kontrola vysokonapäťovej batérie a výmena brzdovej kvapaliny.',
    status: 'done',
    items: [
      labour('Diagnostika vysokonapäťovej batérie', '1,5', '95'),
      labour('Výmena brzdovej kvapaliny', '1', '95'),
      part('BRK-DOT4', 'Brzdová kvapalina DOT 4', '2', 'l', '11', '18'),
    ],
  },
  {
    customer: 'Ondrej Maťko',
    vehicle: { vin: 'WUAZZZ4SZKN900107', licensePlate: 'TN907AG', make: 'Audi', model: 'R8 V10 performance', year: '2019', fuel: 'petrol' },
    mileageKm: '31 500',
    customerRequest: 'Výmena pneumatík, vyváženie a nastavenie geometrie.',
    status: 'inProgress',
    deadlineInDays: 1,
    items: [
      labour('Montáž a vyváženie kolies', '1,5', '95'),
      part('TYR-R8-P', 'Pneumatika 245/30 R20 (predná)', '2', 'ks', '245', '339'),
      part('TYR-R8-Z', 'Pneumatika 305/30 R20 (zadná)', '2', 'ks', '290', '389'),
      labour('Nastavenie geometrie', '1', '95'),
    ],
  },
  {
    customer: 'Silvia Rybárová',
    vehicle: { vin: 'WBSZZZ8Z0MC900108', licensePlate: 'ZA908AH', make: 'BMW', model: 'M5 Competition', year: '2021', fuel: 'petrol' },
    mileageKm: '38 900',
    customerRequest: 'Svieti kontrolka motora, diagnostika.',
    status: 'received',
    items: [labour('Diagnostika motora', '1', '95'), labour('Kontrola zapaľovania a vstrekovania', '1', '95')],
  },
];

/** Saves one Zákazka of the demo, with its customer, vehicle and items, and takes it to its status. */
async function makeOrder(db: Database, order: DemoOrder, now: Date) {
  const deadline = order.deadlineInDays === undefined ? undefined : localDate(new Date(now.getTime() + order.deadlineInDays * 86_400_000));
  const intake = await createIntake(
    demo,
    {
      owner: { customer: { type: 'person', name: order.customer } },
      vehicle: order.vehicle,
      mileageKm: order.mileageKm,
      customerRequest: order.customerRequest,
      deadline,
    },
    db,
    now,
  );
  if (!intake.ok) throw new Error(`The demo Zákazka of ${order.customer} was refused: ${JSON.stringify(intake.errors)}`);
  for (const item of order.items) {
    const added = await addItem(demo, intake.id, item, db);
    if (!added.ok) throw new Error(`The item ${item.name} of the demo Zákazka of ${order.customer} was refused: ${JSON.stringify(added.errors)}`);
  }
  if (order.status !== 'received') {
    const changed = await changeWorkOrderStatus(demo, intake.id, { to: order.status }, db, now);
    if (!changed.ok) throw new Error(`The demo Zákazka of ${order.customer} cannot go to ${order.status}: ${changed.error}`);
  }
}

/**
 * Fills Údaje autoservisu with the register's and puts the logo in when it has one, then makes the Zákazky that are not there yet.
 * It can run any number of times, and every run sets the name, the address, the IČO, the DIČ, the IČ DPH and the e-mail back to the
 * register's and replaces the logo, so what the admin typed in those fields is lost. What the register does not have (the phone, the
 * IBAN, the entry of the register) is kept as the admin typed it in Nastavenia. A Zákazka is told by the VIN of its vehicle, so one
 * that is there is left as it is.
 *
 * ponytail: each Zákazka is made in several steps, not one transaction, so a run that dies in the middle of one leaves it
 * without some items; delete the demo data and run again. The demo is never anyone's real data.
 */
export async function seedDemo(db: Database, { logo, now = new Date() }: { logo: Uint8Array | null; now?: Date }) {
  const current = await getWorkshopDetails(demo, db);
  const kept = { iban: current.iban ?? '', phone: current.phone ?? '', commercialRegister: current.commercialRegister ?? '' };
  const details: WorkshopDetailsInput = { ...registry, ...kept };
  const saved = await saveWorkshopDetails(demo, details, db);
  if (!saved.ok) throw new Error(`The details of the demo autoservis were refused: ${JSON.stringify(saved.errors)}`);
  // No logo, or one that is no image (the site of the customer under maintenance answers with a page): the logo that is there stays.
  const logoSaved = logo !== null && (await saveLogo(demo, logo, db)).ok;

  let created = 0;
  for (const order of demoOrders) {
    if ((await db.$count(vehicle, eq(vehicle.vin, order.vehicle.vin))) > 0) continue;
    await makeOrder(db, order, now);
    created += 1;
  }
  return { created, existing: demoOrders.length - created, phoneMissing: saved.details.phone === null, logoSaved };
}
