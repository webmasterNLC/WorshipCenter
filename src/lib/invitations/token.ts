import 'server-only';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

const TOKEN_BYTES = 32; // 32 bytes → 43 chars base64url

export function generateInvitationToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export async function hashToken(raw: string): Promise<string> {
  return bcrypt.hash(raw, 12);
}

export async function verifyToken(raw: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(raw, hash);
  } catch {
    return false;
  }
}
