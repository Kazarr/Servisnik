import { getDb } from '../../../../../db/index.ts';
import { quoteResponse } from '../../../../../quote-response.ts';
import { sessionUser } from '../../../../../route-guard.ts';

export const dynamic = 'force-dynamic';

export const GET = async (request: Request, { params }: { params: Promise<{ id: string }> }) =>
  quoteResponse(await sessionUser(request), (await params).id, getDb());
