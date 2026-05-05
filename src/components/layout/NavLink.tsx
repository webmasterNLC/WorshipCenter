'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType } from 'react';

interface Props {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}

export function NavLink({ href, label, icon: Icon }: Props) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
        active
          ? 'bg-(--color-muted) text-(--color-fg) font-medium'
          : 'text-(--color-muted-fg) hover:bg-(--color-muted) hover:text-(--color-fg)'
      }`}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r bg-(--color-accent)"
        />
      )}
      <Icon className="size-4" aria-hidden />
      <span>{label}</span>
    </Link>
  );
}
