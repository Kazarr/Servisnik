import { getDb } from '../../../db/index.ts';
import { healthResponse } from '../../../health.ts';

export const dynamic = 'force-dynamic';

export const GET = () => healthResponse(getDb());
