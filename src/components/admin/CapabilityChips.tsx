'use client';
import { useOptimistic, useTransition } from 'react';
import type { Capability } from '@/server/actions/profile.schemas';

const ALL: ReadonlyArray<{ value: Capability; label: string }> = [
  { value: 'worship_lead', label: 'Worship lead' },
  { value: 'vocal',        label: 'Vocal' },
  { value: 'drums',        label: 'Drums' },
  { value: 'bass',         label: 'Bass' },
  { value: 'guitar',       label: 'Guitar' },
  { value: 'keys',         label: 'Keys' },
  { value: 'sound',        label: 'Sound' },
  { value: 'camera',       label: 'Camera' },
  { value: 'projector',    label: 'Projector' },
];

interface Props {
  userId: string;
  initial: Capability[];
  toggle: (input: {
    user_id: string;
    capability: Capability;
    enabled: boolean;
  }) => Promise<unknown>;
}

export function CapabilityChips({ userId, initial, toggle }: Props) {
  const [pending, startTransition] = useTransition();
  const [optimistic, applyOptimistic] = useOptimistic<
    Capability[],
    { capability: Capability; enabled: boolean }
  >(initial, (state, { capability, enabled }) => {
    if (enabled) return state.includes(capability) ? state : [...state, capability];
    return state.filter((c) => c !== capability);
  });

  return (
    <div className="flex flex-wrap gap-1.5">
      {ALL.map(({ value, label }) => {
        const active = optimistic.includes(value);
        return (
          <button
            key={value}
            type="button"
            disabled={pending}
            aria-pressed={active}
            onClick={() => {
              const enabled = !active;
              startTransition(async () => {
                applyOptimistic({ capability: value, enabled });
                await toggle({ user_id: userId, capability: value, enabled });
              });
            }}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              active
                ? 'border-(--color-accent) bg-(--color-accent) text-(--color-accent-fg)'
                : 'border-(--color-border) text-(--color-muted-fg) hover:border-(--color-accent) hover:text-(--color-fg)'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
