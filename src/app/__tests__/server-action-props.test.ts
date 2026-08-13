import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards a bug class that neither the type checker nor the build catches, and
 * that has now reached production twice: handing a plain server-only function
 * to a client component as a prop.
 *
 * `import 'server-only'` modules export ordinary async functions. React cannot
 * serialise those across the server/client boundary, so the page 500s at
 * request time with "Functions cannot be passed directly to Client
 * Components". TypeScript is happy — the signatures match. The fix is always
 * the same: wrap the call in a local `'use server'` function on the page.
 *
 * This is a text-level check, not an AST one. It looks for the exact shape
 * that broke: a JSX prop whose value is a bare identifier that the same file
 * imported from a server-only actions module. That misses cleverer spellings,
 * but it catches the mistake anyone actually makes.
 */

const ACTIONS_DIR = 'src/server/actions';
const APP_DIR = 'src/app';

function serverOnlyModules(): Set<string> {
  const out = new Set<string>();
  for (const file of readdirSync(ACTIONS_DIR)) {
    if (!file.endsWith('.ts')) continue;
    const head = readFileSync(join(ACTIONS_DIR, file), 'utf8').slice(0, 400);
    // A module is safe to pass around only if it is a 'use server' module.
    if (head.includes("'server-only'") && !head.includes("'use server'")) {
      out.add(file.replace(/\.ts$/, ''));
    }
  }
  return out;
}

function pageFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...pageFiles(full));
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/** Identifiers this file imports from a server-only actions module. */
function serverOnlyImports(source: string, modules: Set<string>): Set<string> {
  const names = new Set<string>();
  // The segment between `import` and `{` is length-bounded so the pattern
  // cannot backtrack pathologically; `type` is detected in it afterwards
  // rather than as an optional group, which is what made it ambiguous.
  const importRe = /import\b([^{;]{0,20})\{([^}]*)\}\s*from\s*'@\/server\/actions\/([\w.-]+)'/g;
  for (const m of source.matchAll(importRe)) {
    const [, lead, clause, mod] = m;
    if (/\btype\b/.test(lead!) || !modules.has(mod!)) continue;
    for (const raw of clause!.split(',')) {
      const name = raw.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && !name.startsWith('type ')) names.add(name);
    }
  }
  return names;
}

describe('client components never receive raw server-only functions', () => {
  const modules = serverOnlyModules();

  it('knows which action modules are server-only', () => {
    // Sanity: if this ever empties out, the check below silently passes.
    expect(modules.size).toBeGreaterThan(0);
    expect(modules.has('service')).toBe(true);
  });

  it('finds no page passing one straight into JSX', () => {
    const offenders: string[] = [];

    for (const file of pageFiles(APP_DIR)) {
      const src = readFileSync(file, 'utf8');
      const imported = serverOnlyImports(src, modules);
      if (imported.size === 0) continue;

      for (const m of src.matchAll(/(\w+)=\{(\w+)\}/g)) {
        const [, prop, value] = m;
        if (imported.has(value!)) {
          offenders.push(`${file}: ${prop}={${value}}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
