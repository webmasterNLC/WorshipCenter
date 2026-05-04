// Mock for `server-only` — allows server modules to be imported in vitest tests.
// The real package throws at import time outside a Next.js server context.
export {};
