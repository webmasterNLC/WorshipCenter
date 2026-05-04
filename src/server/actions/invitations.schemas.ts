import { z } from 'zod';

export const userRole = z.enum(['admin', 'leader', 'musician']);
export type UserRole = z.infer<typeof userRole>;

export const sendInvitationInput = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  role: userRole,
});
export type SendInvitationInput = z.infer<typeof sendInvitationInput>;

export const revokeInvitationInput = z.object({
  id: z.string().uuid(),
});
export type RevokeInvitationInput = z.infer<typeof revokeInvitationInput>;
