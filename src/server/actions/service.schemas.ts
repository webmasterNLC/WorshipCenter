import { z } from 'zod';
import { CAPABILITIES, type Capability } from './profile.schemas';

// Rota roles are exactly the same set as profile capabilities.
export const ROTA_ROLES = CAPABILITIES;
export type RotaRole = Capability;

export const rotaRole = z.enum(ROTA_ROLES);

export const assignToServiceInput = z.object({
  playlist_id: z.string().uuid(),
  role: rotaRole,
  member_id: z.string().uuid(),
  notes: z.string().max(500).optional(),
});
export type AssignToServiceInput = z.infer<typeof assignToServiceInput>;

export const unassignFromServiceInput = z.object({
  playlist_id: z.string().uuid(),
  role: rotaRole,
  member_id: z.string().uuid(),
});
export type UnassignFromServiceInput = z.infer<typeof unassignFromServiceInput>;

export const ROTA_ROLE_LABEL: Record<RotaRole, string> = {
  worship_lead: 'Worship lead',
  vocal:        'Vocal',
  drums:        'Drums',
  bass:         'Bass',
  guitar:       'Guitar',
  keys:         'Keys',
  sound:        'Sound',
  camera:       'Camera',
  projector:    'Projector',
};
