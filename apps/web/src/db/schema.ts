import { roles } from '@servisnik/domain/access';
import { customerTypes } from '@servisnik/domain/customer';
import { registrationCategories, registrationStatuses } from '@servisnik/domain/joy-ride';
import { defaultLetterhead, letterheads } from '@servisnik/domain/print';
import type { LogoContentType } from '@servisnik/domain/settings';
import { fuels } from '@servisnik/domain/vehicle';
import { itemKinds, workOrderStatuses } from '@servisnik/domain/work-order';
import { vatPayerTypes } from '@servisnik/domain/workshop';
import { sql } from 'drizzle-orm';
import { boolean, check, customType, date, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

// Better Auth owns user, session, account and verification (docs/adr/0001-stack.md). Keys and
// column types follow what its Drizzle adapter expects. `role` is an enum, not the plain text the
// admin plugin would make; the plugin's other columns (`banned`, `ban_reason`, `ban_expires`,
// `impersonated_by`) are as it declares them.

/** Rola: what a Používateľ may do (packages/domain/src/access). */
export const role = pgEnum('role', roles);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
};

/**
 * Používateľ. The e-mail is unique whatever its case: the index is on `lower(email)`, so PostgreSQL
 * refuses two spellings of one e-mail even from a write that did not lower-case it. It stands in for
 * the plain `unique()` Better Auth declares, which it makes redundant.
 */
export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    // Least privilege: anyone created without an explicit role is a mechanik.
    role: role('role').notNull().default('mechanik'),
    /** Deaktivovaný používateľ (GLOSSARY): `banned` is true. An active user is one that is not. */
    banned: boolean('banned').notNull().default(false),
    banReason: text('ban_reason'),
    banExpires: timestamp('ban_expires', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex('user_email_lower_idx').on(sql`lower(${table.email})`)],
);

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    impersonatedBy: text('impersonated_by'),
    ...timestamps,
  },
  (table) => [index('session_user_id_idx').on(table.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    ...timestamps,
  },
  (table) => [index('account_user_id_idx').on(table.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

/** Osoba or Firma. */
export const customerType = pgEnum('customer_type', customerTypes);

/**
 * Zákazník. The company fields stay empty for an osoba (packages/domain/src/customer). The IČO is
 * unique; PostgreSQL lets any number of rows have none, and the name is not unique at all.
 * `search*` are the name, e-mail and phone as the domain normalizes them to be searched (`searchKeys`):
 * the DAL writes them with every save, so the search needs no `unaccent` and no index so far.
 */
export const customer = pgTable(
  'customer',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: customerType('type').notNull(),
    name: text('name').notNull(),
    ico: text('ico'),
    dic: text('dic'),
    icDph: text('ic_dph'),
    street: text('street'),
    city: text('city'),
    postalCode: text('postal_code'),
    phone: text('phone'),
    email: text('email'),
    note: text('note'),
    searchName: text('search_name').notNull(),
    searchEmail: text('search_email').notNull(),
    searchPhone: text('search_phone').notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('customer_ico_idx').on(table.ico)],
);

/** Benzín, nafta, hybrid, elektro, LPG, CNG or iné. */
export const vehicleFuel = pgEnum('vehicle_fuel', fuels);

/**
 * Vozidlo, identified by its VIN; `ownerId` is its Majiteľ. The VIN is unique, the ŠPZ is not
 * (it passes from one car to another). `mileageKm` is the last known state of the odometer.
 */
export const vehicle = pgTable(
  'vehicle',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vin: text('vin').notNull(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => customer.id, { onDelete: 'restrict' }),
    licensePlate: text('license_plate'),
    make: text('make').notNull(),
    model: text('model').notNull(),
    year: integer('year'),
    fuel: vehicleFuel('fuel'),
    mileageKm: integer('mileage_km'),
    note: text('note'),
    ...timestamps,
  },
  (table) => [uniqueIndex('vehicle_vin_idx').on(table.vin), index('vehicle_owner_id_idx').on(table.ownerId)],
);

/** The Stav zákazky, by its code names; the allowed changes are the domain's table (packages/domain/src/work-order). */
export const workOrderStatus = pgEnum('work_order_status', workOrderStatuses);

/**
 * The last sequence number handed out in a year. A new number is one atomic upsert on this row, so
 * two Zákazky created at once never get the same one, and a rolled-back creation gives its number back.
 */
export const workOrderCounter = pgTable('work_order_counter', {
  year: integer('year').primaryKey(),
  lastSequence: integer('last_sequence').notNull(),
});

/**
 * Zákazka. `customerId` is the Zákazník it is for, the Majiteľ of the vehicle when it was created; it
 * is never derived from the vehicle later, so a Prepis leaves old Zákazky with their customer.
 */
export const workOrder = pgTable(
  'work_order',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: text('number').notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customer.id, { onDelete: 'restrict' }),
    vehicleId: uuid('vehicle_id')
      .notNull()
      .references(() => vehicle.id, { onDelete: 'restrict' }),
    mileageKm: integer('mileage_km').notNull(),
    customerRequest: text('customer_request').notNull(),
    status: workOrderStatus('status').notNull().default('received'),
    /** The Dátum dokončenia, a calendar day in Europe/Bratislava, set when the Zákazka becomes Hotová. */
    completedOn: date('completed_on', { mode: 'string' }),
    /** The Termín, a calendar day in Europe/Bratislava the vehicle was promised for, or null. */
    deadline: date('deadline', { mode: 'string' }),
    /** The internal note; it goes on no document. */
    note: text('note'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('work_order_number_idx').on(table.number),
    index('work_order_customer_id_idx').on(table.customerId),
    index('work_order_vehicle_id_idx').on(table.vehicleId),
    check('work_order_mileage_km_check', sql`${table.mileageKm} >= 0`),
  ],
);

/** Platiteľ DPH: a platiteľ, a neplatiteľ or a registrovaný podľa §7 (packages/domain/src/workshop). */
export const vatPayerType = pgEnum('vat_payer_type', vatPayerTypes);

/** Hlavička tlačív: white or a black bar (packages/domain/src/print). */
export const letterhead = pgEnum('letterhead', letterheads);

/**
 * Autoservis: the one row of values for the whole workshop (GLOSSARY: Nastavenia). The migration
 * creates it and nothing inserts another: the primary key is always 1. Other parts of Nastavenia add
 * their columns here. Here are the rates (packages/domain/src/settings): the VAT rates with the default
 * one, the hourly rate in cents without VAT (null when none) and the markup on parts in whole percent;
 * and Údaje autoservisu (packages/domain/src/workshop), and the Hlavička tlačív, which starts white.
 * Of the details only the name is required, and it is
 * empty until the admin first saves them, as the migration cannot know it; the platiteľ DPH starts as
 * a platiteľ, which the domain lets be saved only with an IČ DPH, so no check of the database says so.
 */
export const workshop = pgTable(
  'workshop',
  {
    id: integer('id').primaryKey().default(1),
    vatRates: integer('vat_rates').array().notNull(),
    defaultVatRate: integer('default_vat_rate').notNull(),
    hourlyRateCents: integer('hourly_rate_cents'),
    markupPercent: integer('markup_percent').notNull().default(0),
    name: text('name').notNull().default(''),
    street: text('street'),
    city: text('city'),
    postalCode: text('postal_code'),
    ico: text('ico'),
    dic: text('dic'),
    icDph: text('ic_dph'),
    vatPayerType: vatPayerType('vat_payer_type').notNull().default('payer'),
    iban: text('iban'),
    phone: text('phone'),
    email: text('email'),
    commercialRegister: text('commercial_register'),
    letterhead: letterhead('letterhead').notNull().default(defaultLetterhead),
    ...timestamps,
  },
  (table) => [
    check('workshop_single_row_check', sql`${table.id} = 1`),
    check('workshop_vat_rates_check', sql`0 <= all(${table.vatRates}) and 100 >= all(${table.vatRates})`),
    check('workshop_default_vat_rate_check', sql`${table.defaultVatRate} = any(${table.vatRates})`),
    check('workshop_hourly_rate_cents_check', sql`${table.hourlyRateCents} >= 0`),
    check('workshop_markup_percent_check', sql`${table.markupPercent} >= 0`),
  ],
);

/** A column of bytes. The app holds them as a `Uint8Array`; node-postgres hands over and takes a `Buffer`. */
const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => 'bytea',
  toDriver: (value) => Buffer.from(value.buffer, value.byteOffset, value.byteLength),
  fromDriver: (value) => new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
});

/**
 * The logo of the Autoservis: the file itself, in a table of its own so that reading `workshop` (every
 * visit to Nastavenia) never loads an image. No row means no logo; the primary key is always 1, like
 * `workshop`. docs/adr/0001-stack.md says why it is not in S3. The type is the one the domain read from
 * the content (packages/domain/src/settings/logo.ts) and 1 048 576 bytes is its `maxLogoBytes`.
 */
export const workshopLogo = pgTable(
  'workshop_logo',
  {
    id: integer('id').primaryKey().default(1),
    contentType: text('content_type').$type<LogoContentType>().notNull(),
    data: bytea('data').notNull(),
    ...timestamps,
  },
  (table) => [
    check('workshop_logo_single_row_check', sql`${table.id} = 1`),
    check('workshop_logo_content_type_check', sql`${table.contentType} in ('image/png', 'image/jpeg')`),
    check('workshop_logo_size_check', sql`octet_length(${table.data}) between 1 and 1048576`),
  ],
);

/** Práca or Diel. */
export const workOrderItemKind = pgEnum('work_order_item_kind', itemKinds);

/**
 * Položka zákazky. The quantity is in hundredths and the prices in cents without VAT, so there are no
 * floats. `salePriceCents` is the Predajná cena; its column and its check are still named `unit_price`, which only a
 * migration would change. `purchasePriceCents` is the Nákupná cena of a Diel, null
 * while it is not known and always null for a Práca. The Prirážka is not stored: the form derives it.
 */
export const workOrderItem = pgTable(
  'work_order_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workOrderId: uuid('work_order_id')
      .notNull()
      .references(() => workOrder.id, { onDelete: 'cascade' }),
    kind: workOrderItemKind('kind').notNull(),
    code: text('code'),
    name: text('name').notNull(),
    quantityHundredths: integer('quantity_hundredths').notNull(),
    unit: text('unit').notNull(),
    purchasePriceCents: integer('purchase_price_cents'),
    salePriceCents: integer('unit_price_cents').notNull(),
    vatRate: integer('vat_rate').notNull(),
    ...timestamps,
  },
  (table) => [
    index('work_order_item_work_order_id_idx').on(table.workOrderId),
    check('work_order_item_quantity_check', sql`${table.quantityHundredths} > 0`),
    check('work_order_item_purchase_price_check', sql`${table.purchasePriceCents} >= 0`),
    check('work_order_item_purchase_price_kind_check', sql`${table.purchasePriceCents} is null or ${table.kind} = 'part'`),
    check('work_order_item_unit_price_check', sql`${table.salePriceCents} >= 0`),
    check('work_order_item_vat_rate_check', sql`${table.vatRate} between 0 and 100`),
  ],
);

/**
 * Položka cenníka: a Práca or a Diel with the prices in cents without VAT and the VAT rate it was given, as a
 * Položka zákazky has them, but no quantity; its `salePriceCents` and the check on it are still named `unit_price` in
 * the database, which only a migration would change. Adding one to a Zákazka copies its values: `work_order_item` has no
 * column that points here, so changing or deleting an item never reaches a Zákazka. The code is unique whatever its
 * case; PostgreSQL lets any number of rows have none. `search*` are the code and the name as the domain normalizes
 * them to be searched (`priceListSearchKeys`): the DAL writes them with every save, so the search needs no `unaccent`.
 */
export const priceListItem = pgTable(
  'price_list_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: workOrderItemKind('kind').notNull(),
    code: text('code'),
    name: text('name').notNull(),
    unit: text('unit').notNull(),
    purchasePriceCents: integer('purchase_price_cents'),
    salePriceCents: integer('unit_price_cents').notNull(),
    vatRate: integer('vat_rate').notNull(),
    searchCode: text('search_code').notNull(),
    searchName: text('search_name').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('price_list_item_code_idx').on(sql`lower(${table.code})`),
    check('price_list_item_purchase_price_check', sql`${table.purchasePriceCents} >= 0`),
    check('price_list_item_purchase_price_kind_check', sql`${table.purchasePriceCents} is null or ${table.kind} = 'part'`),
    check('price_list_item_unit_price_check', sql`${table.salePriceCents} >= 0`),
    check('price_list_item_vat_rate_check', sql`${table.vatRate} between 0 and 100`),
  ],
);

/**
 * Ročník of the Jazda radosti: its name, its day, its place and the uzávierka registrácií. The uzávierka is a wall-clock time at the
 * place (Europe/Bratislava), so it is a `timestamp` without a time zone, and no instant is made of it (packages/domain/src/joy-ride).
 * The section edits the one with the latest day, the current Ročník; more than one is allowed so that the history needs no migration.
 */
export const joyRideEdition = pgTable('joy_ride_edition', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  place: text('place').notNull(),
  registrationDeadline: timestamp('registration_deadline', { mode: 'string' }).notNull(),
  ...timestamps,
});

/** Stav registrácie: Nová, Schválená or Zamietnutá. */
export const registrationStatus = pgEnum('registration_status', registrationStatuses);

/** Kategória of a Registrácia: superšport, zaujímavé auto, ťažká technika, veterán, motorka or iné. */
export const registrationCategory = pgEnum('registration_category', registrationCategories);

/**
 * Registrácia on a Ročník: the exhibitor, who is no Zákazník, and the one vehicle he brings, which is no Vozidlo (it has no VIN, and the
 * ŠPZ is optional). `createdAt` is the day it was registered, which the list shows. A Ročník with Registrácie is not deleted: `restrict`.
 */
export const joyRideRegistration = pgTable(
  'joy_ride_registration',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    editionId: uuid('edition_id')
      .notNull()
      .references(() => joyRideEdition.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    email: text('email').notNull(),
    make: text('make').notNull(),
    model: text('model').notNull(),
    licensePlate: text('license_plate'),
    category: registrationCategory('category').notNull(),
    note: text('note'),
    status: registrationStatus('status').notNull().default('new'),
    ...timestamps,
  },
  (table) => [index('joy_ride_registration_edition_id_idx').on(table.editionId)],
);
