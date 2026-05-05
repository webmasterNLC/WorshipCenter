import { z } from 'zod';
import { userRole } from './invitations.schemas';

export const updateMyProfileInput = z.object({
  display_name: z.string().trim().min(1).max(80),
});
export type UpdateMyProfileInput = z.infer<typeof updateMyProfileInput>;

export const adminSetUserRoleInput = z.object({
  user_id: z.string().uuid(),
  role: userRole,
});
export type AdminSetUserRoleInput = z.infer<typeof adminSetUserRoleInput>;

export const CAPABILITIES = [
  'worship_lead', 'vocal', 'drums', 'bass', 'guitar', 'keys',
  'sound', 'camera', 'projector',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const capability = z.enum(CAPABILITIES);

export const toggleCapabilityInput = z.object({
  user_id: z.string().uuid(),
  capability,
  enabled: z.boolean(),
});
export type ToggleCapabilityInput = z.infer<typeof toggleCapabilityInput>;
