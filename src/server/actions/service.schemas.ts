import { z } from 'zod';
import { ROTA_ROLES, ROTA_ROLE_LABEL, type RotaRole } from './rota.constants';

export { ROTA_ROLES, ROTA_ROLE_LABEL, type RotaRole };

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
