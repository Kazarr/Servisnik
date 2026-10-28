import { requireUser, UnauthenticatedError } from '../../../dal/user.ts';
import { getDb } from '../../../db/index.ts';
import { deleteLogoResponse, getLogoResponse, putLogoResponse } from '../../../logo-response.ts';

export const dynamic = 'force-dynamic';

/** The Používateľ of the session, or null, which the answers turn into a 401. */
const userOf = (request: Request) =>
  requireUser(request.headers).catch((error) => (error instanceof UnauthenticatedError ? null : Promise.reject(error)));

export const GET = async (request: Request) => getLogoResponse(await userOf(request), getDb());

export const PUT = async (request: Request) => putLogoResponse(await userOf(request), request, getDb());

export const DELETE = async (request: Request) => deleteLogoResponse(await userOf(request), getDb());
