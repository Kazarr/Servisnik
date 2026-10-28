import { getDb } from '../../../../../db/index.ts';
import { handoverProtocolResponse } from '../../../../../handover-protocol-response.ts';
import { sessionUser } from '../../../../../route-guard.ts';

export const dynamic = 'force-dynamic';

export const GET = async (request: Request, { params }: { params: Promise<{ id: string }> }) =>
  handoverProtocolResponse(await sessionUser(request), (await params).id, getDb());
