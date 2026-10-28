import { getDb } from '../../../db/index.ts';
import { deleteLogoResponse, getLogoResponse, putLogoResponse } from '../../../logo-response.ts';
import { sessionUser } from '../../../route-guard.ts';

export const dynamic = 'force-dynamic';

export const GET = async (request: Request) => getLogoResponse(await sessionUser(request), getDb());

export const PUT = async (request: Request) => putLogoResponse(await sessionUser(request), request, getDb());

export const DELETE = async (request: Request) => deleteLogoResponse(await sessionUser(request), getDb());
