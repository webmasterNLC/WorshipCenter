'use client';
import { useState, useTransition } from 'react';
import { Plus, X, Check } from 'lucide-react';
import {
  ROTA_ROLES,
  ROTA_ROLE_LABEL,
  type RotaRole,
} from '@/server/actions/service.schemas';

interface Assignment {
  id: string;
  role: RotaRole;
  member_id: string;
  member_name: string;
  notes: string | null;
}

interface Candidate {
  id: string;
  display_name: string;
  capabilities: RotaRole[];
}

interface Props {
  playlistId: string;
  assignments: Assignment[];
  candidates: Candidate[];
  canEdit: boolean;
  assign: (input: {
    playlist_id: string;
    role: RotaRole;
    member_id: string;
  }) => Promise<unknown>;
  unassign: (input: {
    playlist_id: string;
    role: RotaRole;
    member_id: string;
  }) => Promise<unknown>;
}

const ROLE_GROUPS: ReadonlyArray<{ label: string; roles: RotaRole[] }> = [
  { label: 'Band',   roles: ['worship_lead', 'vocal', 'drums', 'bass', 'guitar', 'keys'] },
  { label: 'Technik', roles: ['sound', 'camera', 'projector'] },
];

export function RotaBlock({
  playlistId,
  assignments,
  candidates,
  canEdit,
  assign,
  unassign,
}: Props) {
  const [openRole, setOpenRole] = useState<RotaRole | null>(null);
  const [pending, startTransition] = useTransition();

  const byRole = new Map<RotaRole, Assignment[]>();
  for (const role of ROTA_ROLES) byRole.set(role, []);
  for (const a of assignments) byRole.get(a.role)?.push(a);

  // One duty per program: anyone already assigned to ANY role on this
  // program is hidden from every picker, not just the picker for that
  // specific role.
  const allAssignedMemberIds = new Set(assignments.map((a) => a.member_id));

  function candidatesFor(role: RotaRole): Candidate[] {
    return candidates.filter(
      (c) => c.capabilities.includes(role) && !allAssignedMemberIds.has(c.id),
    );
  }

  const handleAssign = (role: RotaRole, member_id: string) => {
    startTransition(async () => {
      setOpenRole(null);
      await assign({ playlist_id: playlistId, role, member_id });
    });
  };

  const handleUnassign = (role: RotaRole, member_id: string) => {
    startTransition(async () => {
      await unassign({ playlist_id: playlistId, role, member_id });
    });
  };

  const totalAssigned = assignments.length;

  return (
    <section className="grid gap-4 rounded-2xl border border-(--color-border) bg-(--color-muted)/30 p-5">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-display text-xl flex items-baseline gap-2">
            <span className="numeral text-base">№</span>
            Service rota
          </h2>
          <p className="text-xs text-(--color-muted-fg) mt-0.5">
            {totalAssigned} {totalAssigned === 1 ? 'assignment' : 'assignments'}{' '}
            {canEdit ? '· tap a role to add' : '· read-only'}
          </p>
        </div>
      </header>

      <div className="grid gap-5">
        {ROLE_GROUPS.map((group) => (
          <div key={group.label} className="grid gap-2">
            <p className="text-[0.65rem] uppercase tracking-[0.22em] text-(--color-muted-fg)">
              {group.label}
            </p>
            <ul className="grid gap-1.5">
              {group.roles.map((role) => {
                const assigned = byRole.get(role) ?? [];
                const available = candidatesFor(role);
                const isOpen = openRole === role;
                return (
                  <li
                    key={role}
                    className="grid grid-cols-[8rem_1fr] items-start gap-3 rounded-xl border border-(--color-border) bg-(--color-bg) px-3 py-2"
                  >
                    <div className="text-sm font-medium pt-1">
                      {ROTA_ROLE_LABEL[role]}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 relative">
                      {assigned.length === 0 && (
                        <span className="text-xs text-(--color-muted-fg) py-1">
                          —
                        </span>
                      )}
                      {assigned.map((a) => (
                        <span
                          key={a.id}
                          className="inline-flex items-center gap-1 rounded-full border border-(--color-border) bg-(--color-muted) px-2.5 py-1 text-xs"
                        >
                          {a.member_name}
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => handleUnassign(role, a.member_id)}
                              disabled={pending}
                              aria-label={`Remove ${a.member_name} from ${ROTA_ROLE_LABEL[role]}`}
                              className="grid size-4 place-items-center rounded-full text-(--color-muted-fg) hover:bg-(--color-danger)/10 hover:text-(--color-danger) disabled:opacity-50"
                            >
                              <X className="size-3" aria-hidden />
                            </button>
                          )}
                        </span>
                      ))}
                      {canEdit && (
                        <>
                          <button
                            type="button"
                            onClick={() => setOpenRole(isOpen ? null : role)}
                            disabled={pending || available.length === 0}
                            className="inline-flex items-center gap-1 rounded-full border border-dashed border-(--color-border) px-2.5 py-1 text-xs text-(--color-muted-fg) hover:border-(--color-accent) hover:text-(--color-accent) transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                            title={
                              available.length === 0
                                ? `No more capable members for ${ROTA_ROLE_LABEL[role]}`
                                : `Add to ${ROTA_ROLE_LABEL[role]}`
                            }
                          >
                            <Plus className="size-3" aria-hidden />
                            {available.length === 0 ? 'all assigned' : 'Add'}
                          </button>
                          {isOpen && (
                            <div
                              className="absolute left-0 top-full z-20 mt-1 max-h-60 w-64 overflow-auto rounded-lg border border-(--color-border) bg-(--color-bg) p-1 shadow-lg"
                              role="listbox"
                            >
                              {available.length === 0 ? (
                                <p className="px-2 py-3 text-xs text-(--color-muted-fg)">
                                  No capable members available.
                                </p>
                              ) : (
                                available.map((c) => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    role="option"
                                    aria-selected="false"
                                    onClick={() => handleAssign(role, c.id)}
                                    disabled={pending}
                                    className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-(--color-muted) disabled:opacity-50"
                                  >
                                    <span>{c.display_name}</span>
                                    <Check className="size-3.5 text-(--color-accent) opacity-0 group-hover:opacity-100" aria-hidden />
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
