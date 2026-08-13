import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { sendInvitationInput, revokeInvitationInput } from './invitations.schemas';
import { ValidationError } from '@/server/auth/errors';
import { requireRole, type Session } from '@/server/auth/require';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { generateInvitationToken, hashToken } from '@/lib/invitations/token';
import { defaultMailer, type SendInput } from '@/lib/email/transport';
import { appOrigin } from '@/lib/env';
import { renderInvitationEmail } from '@/lib/email/templates/invitation';

// --- Pure factory for tests ---
export interface InvitationDeps {
  requireAdmin: () => Promise<Session>;
  db: {
    insertInvitation(row: {
      email: string; role: 'admin'|'leader'|'viewer'; invited_by: string;
      token_hash: string; expires_at: Date;
    }): Promise<{ id: string } & Record<string, unknown>>;
    writeAudit(input: {
      actorId: string; action: string; targetType: string; targetId: string;
      metadata: Record<string, unknown>;
    }): Promise<void>;
  };
  mailer: { send(msg: SendInput): Promise<{ messageId: string }> };
  tokens: { generate(): string; hash(raw: string): Promise<string> };
  originUrl: string;
}

const TTL_MS = 72 * 60 * 60 * 1000;

export function makeSendInvitation(deps: InvitationDeps) {
  return async function sendInvitation(
    rawInput: z.input<typeof sendInvitationInput>,
  ): Promise<{ id: string }> {
    const session = await deps.requireAdmin();
    const parsed = sendInvitationInput.safeParse(rawInput);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());

    const raw = deps.tokens.generate();
    const tokenHash = await deps.tokens.hash(raw);
    const expiresAt = new Date(Date.now() + TTL_MS);

    const inserted = await deps.db.insertInvitation({
      email: parsed.data.email,
      role: parsed.data.role,
      invited_by: session.profile.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    const acceptUrl = `${deps.originUrl}/api/invitations/accept?token=${raw}`;
    const email = renderInvitationEmail({
      acceptUrl,
      inviterName: session.profile.display_name,
      role: parsed.data.role,
      expiresAt,
    });
    await deps.mailer.send({ to: parsed.data.email, ...email });

    await deps.db.writeAudit({
      actorId: session.profile.id,
      action: 'invite.send',
      targetType: 'invitation',
      targetId: inserted.id,
      metadata: { email: parsed.data.email, role: parsed.data.role },
    });

    return { id: inserted.id };
  };
}

// --- Default wired actions used by Next.js (each has inline 'use server') ---
export async function sendInvitation(rawInput: z.input<typeof sendInvitationInput>): Promise<{ id: string }> {
  'use server';
  const action = makeSendInvitation({
    requireAdmin: () => requireRole('admin'),
    db: {
      async insertInvitation(row) {
        const sb = createSupabaseAdminClient();
        const { data, error } = await sb
          .from('invitations')
          .insert(row)
          .select('id')
          .single();
        if (error || !data) throw new Error(`insertInvitation failed: ${error?.message}`);
        return data as { id: string };
      },
      async writeAudit({ actorId, action, targetType, targetId, metadata }) {
        const sb = createSupabaseAdminClient();
        const { error } = await sb.rpc('write_audit', {
          p_actor: actorId,
          p_action: action,
          p_target_type: targetType,
          p_target_id: targetId,
          p_metadata: metadata,
        });
        if (error) throw new Error(`writeAudit failed: ${error.message}`);
      },
    },
    mailer: defaultMailer(),
    tokens: { generate: generateInvitationToken, hash: hashToken },
    originUrl: appOrigin(),
  });
  return action(rawInput);
}

// --- listPending + revoke actions ---
export async function listPendingInvitations() {
  'use server';
  await requireRole('admin');
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from('invitations')
    .select('id, email, role, expires_at, accepted_at, created_at')
    .is('accepted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function revokeInvitation(rawInput: z.input<typeof revokeInvitationInput>) {
  'use server';
  const session = await requireRole('admin');
  const parsed = revokeInvitationInput.safeParse(rawInput);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());

  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from('invitations')
    .delete()
    .eq('id', parsed.data.id)
    .is('accepted_at', null)
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  await sb.rpc('write_audit', {
    p_actor: session.profile.id,
    p_action: 'invite.revoke',
    p_target_type: 'invitation',
    p_target_id: parsed.data.id,
    p_metadata: {},
  });

  revalidatePath('/admin/invites');
  return data;
}
