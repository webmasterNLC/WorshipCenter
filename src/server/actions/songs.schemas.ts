import { z } from 'zod';

export const songLanguage = z.enum(['de','en','ta']);
export const tagSchema = z.string().trim().min(1).max(40);

export const createSongInput = z.object({
  title: z.string().trim().min(1).max(200),
  language: songLanguage,
  original_key: z.string().regex(/^[A-G](#|b)?m?$/),
  bpm: z.number().int().min(30).max(300).optional(),
  time_signature: z.string().regex(/^\d+\/\d+$/).optional(),
  body_chordpro: z.string().min(1).max(50_000),
  notes: z.string().max(5_000).optional(),
  tags: z.array(tagSchema).max(20).default([]),
});
export type CreateSongInput = z.infer<typeof createSongInput>;

export const updateSongInput = createSongInput.partial();
export type UpdateSongInput = z.infer<typeof updateSongInput>;

export const songIdInput = z.object({ id: z.string().uuid() });
