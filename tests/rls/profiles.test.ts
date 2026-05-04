import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeUser, cleanup } from './helpers';

let admin: Awaited<ReturnType<typeof makeUser>>;
let leader: Awaited<ReturnType<typeof makeUser>>;
let musician: Awaited<ReturnType<typeof makeUser>>;

beforeAll(async () => {
  admin = await makeUser('admin');
  leader = await makeUser('leader');
  musician = await makeUser('musician');
});

afterAll(async () => {
  await cleanup([admin.id, leader.id, musician.id]);
});

describe('profiles RLS', () => {
  it('musician can read own profile', async () => {
    const { data } = await musician.sb.from('profiles').select('id').eq('id', musician.id).single();
    expect(data?.id).toBe(musician.id);
  });

  it('musician cannot read other profiles', async () => {
    const { data } = await musician.sb.from('profiles').select('id').eq('id', leader.id);
    expect(data ?? []).toHaveLength(0);
  });

  it('admin can read all profiles', async () => {
    const { data } = await admin.sb.from('profiles').select('id');
    const ids = (data ?? []).map((p) => p.id);
    expect(ids).toContain(admin.id);
    expect(ids).toContain(leader.id);
    expect(ids).toContain(musician.id);
  });

  it('musician cannot self-promote to admin', async () => {
    const { error } = await musician.sb.from('profiles')
      .update({ role: 'admin' })
      .eq('id', musician.id);
    expect(error).not.toBeNull(); // RLS update with-check denies the new role.
  });

  it('admin can change another user role', async () => {
    const { error } = await admin.sb.from('profiles')
      .update({ role: 'leader' })
      .eq('id', musician.id);
    expect(error).toBeNull();
    const { data } = await admin.sb.from('profiles').select('role').eq('id', musician.id).single();
    expect(data?.role).toBe('leader');
    // Restore for other tests
    await admin.sb.from('profiles').update({ role: 'musician' }).eq('id', musician.id);
  });

  it('leader cannot read invitations', async () => {
    const { data, error } = await leader.sb.from('invitations').select('id');
    expect(data ?? []).toHaveLength(0);
    // RLS with no matching policy returns empty rather than error in select.
    expect(error).toBeNull();
  });

  it('admin can read invitations', async () => {
    const { error } = await admin.sb.from('invitations').select('id').limit(1);
    expect(error).toBeNull();
  });

  it('leader cannot insert invitations', async () => {
    const { error } = await leader.sb.from('invitations').insert({
      email: 'x@x.test', role: 'musician', invited_by: leader.id,
      token_hash: 'h', expires_at: new Date(Date.now() + 1e6).toISOString(),
    });
    expect(error).not.toBeNull();
  });

  it('musician cannot read audit_log', async () => {
    const { data, error } = await musician.sb.from('audit_log').select('id');
    expect(data ?? []).toHaveLength(0);
    expect(error).toBeNull();
  });
});
