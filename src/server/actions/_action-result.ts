import 'server-only';
import { UnauthorizedError, ForbiddenError, ValidationError, NotFoundError } from '@/server/auth/errors';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; issues?: unknown } };

export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (e) {
    if (e instanceof UnauthorizedError) return { ok: false, error: { code: e.code, message: e.message } };
    if (e instanceof ForbiddenError) return { ok: false, error: { code: e.code, message: e.message } };
    if (e instanceof NotFoundError) return { ok: false, error: { code: e.code, message: e.message } };
    if (e instanceof ValidationError) return { ok: false, error: { code: e.code, message: e.message, issues: e.issues } };
    console.error('[action error]', e);
    return { ok: false, error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } };
  }
}
