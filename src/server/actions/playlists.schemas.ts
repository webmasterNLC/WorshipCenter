import { z } from 'zod';

export const createPlaylistInput = z.object({
  name: z.string().trim().min(1).max(120),
  scheduled_for: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().max(2000).optional(),
});
export type CreatePlaylistInput = z.infer<typeof createPlaylistInput>;

export const updatePlaylistInput = createPlaylistInput.partial();
export type UpdatePlaylistInput = z.infer<typeof updatePlaylistInput>;

export const playlistIdInput = z.object({ id: z.string().uuid() });

export const addSongInput = z.object({
  playlist_id: z.string().uuid(),
  song_id: z.string().uuid(),
  transpose_semitones: z.number().int().min(-12).max(12).default(0),
  capo: z.number().int().min(0).max(11).optional(),
  performance_notes: z.string().max(2000).optional(),
});
export type AddSongInput = z.infer<typeof addSongInput>;

export const updateItemInput = z.object({
  id: z.string().uuid(),
  transpose_semitones: z.number().int().min(-12).max(12).optional(),
  capo: z.number().int().min(0).max(11).optional().nullable(),
  performance_notes: z.string().max(2000).optional().nullable(),
});
export type UpdateItemInput = z.infer<typeof updateItemInput>;

export const reorderInput = z.object({
  playlist_id: z.string().uuid(),
  ordered_item_ids: z.array(z.string().uuid()).min(1),
});
export type ReorderInput = z.infer<typeof reorderInput>;

export const sharePlaylistInput = z.object({
  playlist_id: z.string().uuid(),
  message: z.string().max(2000).optional(),
});
export type SharePlaylistInput = z.infer<typeof sharePlaylistInput>;
