import { z } from 'zod';
import { userRole } from './invitations.schemas';
import { CAPABILITIES, type Capability } from './rota.constants';

export { CAPABILITIES, type Capability };

export const updateMyProfileInput = z.object({
  display_name: z.string().trim().min(1).max(80),
});
export type UpdateMyProfileInput = z.infer<typeof updateMyProfileInput>;

export const adminSetUserRoleInput = z.object({
  user_id: z.string().uuid(),
  role: userRole,
});
export type AdminSetUserRoleInput = z.infer<typeof adminSetUserRoleInput>;

export const capability = z.enum(CAPABILITIES);

export const toggleCapabilityInput = z.object({
  user_id: z.string().uuid(),
  capability,
  enabled: z.boolean(),
});
export type ToggleCapabilityInput = z.infer<typeof toggleCapabilityInput>;

// Self-service account fields ----------------------------------------------

export const updateMyEmailInput = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
});
export type UpdateMyEmailInput = z.infer<typeof updateMyEmailInput>;

export const updateMyPasswordInput = z.object({
  // Proof that the person at the keyboard is the account owner, not someone
  // who walked up to an unlocked session. Not length-checked — it is verified
  // against the auth server, and old accounts may predate the 12-char rule.
  current_password: z.string().min(1, 'Enter your current password').max(128),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128),
});
export type UpdateMyPasswordInput = z.infer<typeof updateMyPasswordInput>;

// Admin-managed account fields ---------------------------------------------

export const adminUpdateUserDisplayNameInput = z.object({
  user_id: z.string().uuid(),
  display_name: z.string().trim().min(1).max(80),
});
export type AdminUpdateUserDisplayNameInput = z.infer<typeof adminUpdateUserDisplayNameInput>;

export const adminUpdateUserEmailInput = z.object({
  user_id: z.string().uuid(),
  email: z.string().trim().toLowerCase().email().max(320),
});
export type AdminUpdateUserEmailInput = z.infer<typeof adminUpdateUserEmailInput>;

export const adminResetUserPasswordInput = z.object({
  user_id: z.string().uuid(),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128),
});
export type AdminResetUserPasswordInput = z.infer<typeof adminResetUserPasswordInput>;

export const adminDisableUserInput = z.object({
  user_id: z.string().uuid(),
});
export type AdminDisableUserInput = z.infer<typeof adminDisableUserInput>;
