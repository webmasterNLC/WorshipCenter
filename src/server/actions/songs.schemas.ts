import { z } from 'zod';

export const songLanguage = z.enum(['de','en','ta']);
export const tagSchema = z.string().trim().min(1).max(40);

export const songTranslationInput = z.object({
  language: songLanguage,
  title: z.string().trim().min(1).max(200),
  body_chordpro: z.string().min(1).max(50_000),
  is_primary: z.boolean().default(false),
});
export type SongTranslationInput = z.infer<typeof songTranslationInput>;

const translationsArray = z
  .array(songTranslationInput)
  .min(1, 'At least one translation is required')
  .max(3, 'A song can have at most three translations')
  .superRefine((arr, ctx) => {
    const primaryCount = arr.filter((t) => t.is_primary).length;
    if (primaryCount !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'Exactly one translation must be marked primary',
        path: [],
      });
    }
    const langs = new Set(arr.map((t) => t.language));
    if (langs.size !== arr.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'Each language can appear at most once',
        path: [],
      });
    }
  });

export const createSongInput = z.object({
  original_key: z.string().regex(/^[A-G](#|b)?m?$/),
  bpm: z.number().int().min(30).max(300).optional(),
  time_signature: z.string().regex(/^\d+\/\d+$/).optional(),
  notes: z.string().max(5_000).optional(),
  tags: z.array(tagSchema).max(20).default([]),
  translations: translationsArray,
});
export type CreateSongInput = z.infer<typeof createSongInput>;

export const updateSongInput = z.object({
  original_key: z.string().regex(/^[A-G](#|b)?m?$/).optional(),
  bpm: z.number().int().min(30).max(300).optional(),
  time_signature: z.string().regex(/^\d+\/\d+$/).optional(),
  notes: z.string().max(5_000).optional(),
  tags: z.array(tagSchema).max(20).optional(),
  translations: translationsArray.optional(),
});
export type UpdateSongInput = z.infer<typeof updateSongInput>;

export const songIdInput = z.object({ id: z.string().uuid() });
