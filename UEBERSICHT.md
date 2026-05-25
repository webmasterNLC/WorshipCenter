# NLC Burgdorf SongDrop – Tool-Übersicht

Ein internes Worship-Tool für die **NLC Burgdorf** (New Life Church Burgdorf). Verwaltet Lieder mit Akkorden, plant Gottesdienst-Programme und teilt Worship-Team-Rollen ein.

## Zweck

- **Liederbibliothek** mit Akkorden im ChordPro-Format, mehrsprachig (DE / EN / TA – Tamil)
- **Programme** (Setlists) für jeden Gottesdienst, mit Tonart-Override pro Lied
- **Rota / Dienstplan** – Zuteilung des Teams zu Rollen (Worship Lead, Vocals, Drums, Bass, Gitarre, Keys, Sound, Kamera, Beamer)
- **Bühnen-tauglicher Viewer** mit Live-Transponierung, Schriftgrösse, Auto-Scroll, Fullscreen, Stage-Dark-Theme

## Tech-Stack

| Bereich | Stack |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript 5 |
| Styling | Tailwind CSS v4 (CSS-Variablen für Themes) |
| Backend | Supabase (Auth, Postgres, RLS) + Next.js Server Actions |
| Validierung | Zod 4 (nur serverseitig, wegen CSP) |
| Tests | Vitest (Unit + RLS), Playwright (E2E), fast-check (Property-Tests) |
| Package Manager | pnpm |
| Deployment | Vercel (Region `fra1`), Vercel Web Analytics |

## Routen (App Router)

**Öffentlich** (`src/app/(auth)`)
- `/sign-in` – Login (E-Mail + Passwort)
- `/onboard` – Annahme einer Einladung

**Geschützt** (`src/app/(app)`, Auth-Guard im Layout)
- `/home` – Dashboard
- `/me` – Eigenes Profil (Name, E-Mail, Passwort)
- `/songs`, `/songs/[id]`, `/songs/[id]/edit`, `/songs/new` – Liederbibliothek + CRUD
- `/songs/import` – Import von pnwchords.com (Admin)
- `/playlists`, `/playlists/[id]`, `/playlists/[id]/edit`, `/playlists/new` – Programme
- `/playlists/[id]/play/[idx]` – Bühnen-Viewer mit Programm-Kontext
- `/admin/users`, `/admin/users/[id]`, `/admin/invites` – Admin-Bereich

## Kern-Features

### Liederbibliothek
- ChordPro-Quelltext mit Metadaten: Originaltonart, BPM, Taktart, Tags, Notizen
- Bis zu 3 Übersetzungen pro Lied (eine als `is_primary`)
- Sections im Viewer als Großbuchstaben-Labels (VERSE, CHORUS, BRIDGE, …)

### Viewer (`src/components/viewer/SongViewer.tsx`)
- **Transponierung** ±12 Halbtöne, mit ♭/♯-Präferenz aus Originaltonart
- **Schriftgrösse** in 5 Stufen (16 → 40px), im LocalStorage gespeichert
- **Sprach-Tabs** wenn Übersetzungen vorhanden
- **Theme** Light ↔ Stage-Dark (LocalStorage, via `ThemeProvider`)
- **Auto-Scroll** mit Tempo aus BPM (`bpm / 200`)
- **Fullscreen** via Fullscreen API
- Sticky-Header mit allen Controls + Edit-Pencil (für Admins)

### ChordPro-Engine (`src/lib/chordpro/`)
- `parse.ts` – Tokenizer für Text / Akkord / Directive / Newline
- `pitch.ts` – Pitch-Class-Behandlung inkl. Enharmonik
- `transpose.ts` – Akkord-Transponierung, erhält Quality (m, sus, maj7, /Bass)
- `render.ts` – Token → Render-Blocks für die UI
- Vollständig unit-getestet inkl. Property-Tests

### Import (`src/lib/import/pnwchords.ts`)
- Admin fügt URL von pnwchords.com ein → Server fetcht & parst
- Akkord-Spalten werden auf Wortgrenzen ausgerichtet (Anti-„Wort-Bruch"-Logik)
- Erkennt Titel, Künstler, Originaltonart aus HTML-Metadaten

### Programme & Rota
- Programm = Datum + Beschreibung + geordnete Liederliste
- Pro Item: Transponierung-Override (±12), Capo (0–11), Performance-Notiz
- Versionierung: jeder Speichervorgang schreibt einen Snapshot in `playlist_versions`
- Rota: Mitglieder werden via `service_assignments` Rollen pro Programm zugeteilt, gefiltert nach `profile_capabilities`

### Admin
- Einladungen ausstellen (Token mit bcrypt-Hash, Ablaufdatum)
- Benutzer-Rollen verwalten: `admin`, `leader`, `musician`
- Audit-Log für sicherheitsrelevante Aktionen
- Rate-Limiting via `auth_attempts`

## Domain-Modell (Supabase-Tabellen)

| Tabelle | Zweck |
|---|---|
| `profiles` | 1:1 zu `auth.users`, Name + Rolle |
| `profile_capabilities` | Welche Worship-Rollen kann ein User übernehmen |
| `invitations` | Einmal-Einladungen, bcrypt-Hash, expires_at |
| `audit_log` | Wer hat was wann gemacht |
| `auth_attempts` | Login-Versuche für Rate-Limit |
| `songs` | Hauptlied-Datensatz (mit gecachter Primärsprache) |
| `song_translations` | Pro Sprache: Titel + ChordPro-Body, `is_primary`-Flag |
| `playlists` | Programm: `scheduled_for`, Beschreibung, Owner |
| `playlist_items` | Lied-Reihenfolge, Transpose, Capo, Notiz |
| `playlist_versions` | Snapshot pro Speichervorgang |
| `service_assignments` | Programm × Rolle × Mitglied |

**RLS-Policies**: SQL-Funktion `role_of(uid)` liest die Rolle aus `profiles`; Reads sind allen authentifizierten Usern erlaubt, Writes auf Songs nur Admins, Writes auf Playlists Owner-oder-Admin. Self-Eskalation der Rolle ist trigger-blockiert.

## Wichtige Engineering-Details

- **Proxy statt Middleware** – `src/proxy.ts` (Next.js 16 hat `middleware.ts` deprecated). Setzt CSP-Header, CSRF-Check (Origin ≠ Host → 403) und Supabase-Session-Refresh.
- **Strenge CSP** – `script-src 'self' 'unsafe-inline'`, kein `unsafe-eval`. Zod ist deshalb komplett aus dem Client-Bundle entfernt, geteilte Konstanten leben in `src/server/actions/rota.constants.ts`.
- **Server Actions** – Alle Mutations laufen über Zod-validierte Server Actions, kein client-seitiges Supabase-Schreiben.
- **Auth-Guards** – `requireUser()`, `requireAdmin()`, `requireAdminOrAssignedLeader()` als Helper.
- **JWT-Rolle** – Auth-Hook (`SECURITY DEFINER`) hängt die Rolle aus `profiles` an jeden JWT, sodass RLS sie ohne Subquery sieht.

## Branding & Zielgruppe

- App-Titel: **NLC Burgdorf SongDrop**
- NLC-Logo via theme-aware CSS-Mask (`.nlc-logo`)
- Zielgruppe: das Worship-Team von NLC Burgdorf – Worship Leader, Sänger, Musiker, Technik (Sound / Beamer / Kamera) und Admins
- Default-Rolle für neue User: `musician` (read-only auf Songs, keine Rota-Bearbeitung)


