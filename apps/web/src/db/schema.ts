import { customerTypes } from '@servisnik/domain/customer';
import { boolean, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

// Better Auth owns user, session, account and verification (docs/adr/0001-stack.md). Keys and
// column types follow what its Drizzle adapter expects; `role` is Servisník's own column.

/** Rola: what a Používateľ sees. Only `admin` is used so far. */
export const role = pgEnum('role', ['admin', 'mechanik']);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Používateľ. */
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  // Least privilege: anyone created without an explicit role is a mechanik.
  role: role('role').notNull().default('mechanik'),
  ...timestamps,
});

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

/** Zákazník. The company fields stay empty for an osoba (packages/domain/src/customer). */
export const customer = pgTable('customer', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: customerType('type').notNull(),
  name: text('name').notNull(),
  ico: text('ico'),
  dic: text('dic'),
  icDph: text('ic_dph'),
  street: text('street'),
  city: text('city'),
  postalCode: text('postal_code'),
  email: text('email'),
  ...timestamps,
});

/** Vozidlo, identified by its VIN; `ownerId` is its Majiteľ. */
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
    ...timestamps,
  },
  (table) => [uniqueIndex('vehicle_vin_idx').on(table.vin), index('vehicle_owner_id_idx').on(table.ownerId)],
);
