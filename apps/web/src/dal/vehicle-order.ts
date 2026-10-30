import { desc } from 'drizzle-orm';
import { vehicle } from '../db/schema.ts';

/**
 * The order of every list of Vozidlá, so the search and the Vozidlá of a Zákazník cannot differ: newest first, and the id
 * settles the order of Vozidlá saved at the same moment, so no Vozidlo is on two pages or on none. It asks no capability:
 * the read that uses it does.
 */
export const newestVehiclesFirst = [desc(vehicle.createdAt), vehicle.id];
