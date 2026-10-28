import { ForbiddenError } from '../../dal/user.ts';

/** What a Server Action answers when the user's Rola may not do what the form or button asked for. */
export const forbiddenMessage = 'Na túto akciu nemáte oprávnenie';

/**
 * The result of a DAL call, or 'forbidden' when the DAL refused the user's Rola. The DAL refuses
 * before it reads or writes anything, so the action then returns `forbiddenMessage` and changes nothing.
 */
export async function orForbidden<T>(call: Promise<T>): Promise<T | 'forbidden'> {
  try {
    return await call;
  } catch (error) {
    if (error instanceof ForbiddenError) return 'forbidden';
    throw error;
  }
}
