// Fails CI if 'service_role' appears in any client-bundle JS file.
// We never want SUPABASE_SERVICE_ROLE_KEY to leak to the browser.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '.next/static';
const NEEDLES = ['service_role', 'SUPABASE_SERVICE_ROLE_KEY'];

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e);
    const s = statSync(full);
    if (s.isDirectory()) yield* walk(full);
    else if (full.endsWith('.js') || full.endsWith('.mjs')) yield full;
  }
}

let bad = 0;
for (const file of walk(ROOT)) {
  const text = readFileSync(file, 'utf8');
  for (const needle of NEEDLES) {
    if (text.includes(needle)) {
      console.error(`SECURITY: '${needle}' found in client bundle: ${file}`);
      bad += 1;
    }
  }
}
if (bad > 0) {
  console.error(`Bundle scan failed: ${bad} hit(s).`);
  process.exit(1);
} else {
  console.log('Bundle scan clean.');
}
