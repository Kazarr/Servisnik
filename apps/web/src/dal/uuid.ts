const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An id from a URL may be anything; PostgreSQL throws on a uuid column it cannot parse, so check first. */
export const isUuid = (value: string) => uuid.test(value);
