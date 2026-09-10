Date created: 2026-09-10
Date last modified: 2026-09-10

# Register, Login, and Logout - Technical PRD

## Overview/Problem

Quiz Maker is a greenfield application for teachers who need to collaborate on a shared bank of multiple-choice questions. Before any of that collaboration can happen, each teacher needs an account they can create and return to. Today the starter has no users, no database, and no way to sign in. This first slice gives teachers a way to register, log in, and log out, then lands them on a stub page that the next sprint will turn into the MCQ workflow.

---

## Hypothesis

We believe that a simple hashed-password register/login/logout flow, without sessions or tokens, will let multiple teachers obtain accounts and reach the future MCQ workspace so later sprints can focus on the question bank itself.

---

## Scope

### In Scope

- A `users` table in Cloudflare D1, created through a Wrangler migration
- Password hashing on the client before the HTTP POST, and a salted hash stored in the database (never plaintext)
- A user service with create, update, delete, and the read helpers login/register need
- HTTP endpoints for register, login, and logout
- Register and login pages that POST to those endpoints
- After a successful register or login, navigate to an MCQ stub page
- A Logout control on the MCQ stub that calls the logout endpoint and returns the teacher to login
- **Test-driven implementation with Vitest**: each phase starts by writing failing tests, then implementation until those tests are green. A phase is not done while its tests fail.

### Out of Scope

- Multiple-choice question create/edit/list (the `/mcqs` page is a stub only)
- Social logins (Google, Microsoft, etc.)
- Tokens (JWT, opaque API tokens, refresh tokens)
- Session management, cookies, and route guards
- Password reset, email verification, and profile editing UI
- Roles, permissions, or multi-tenant school/org models
- HTTPS/TLS configuration beyond what the platform already provides
- `@cloudflare/vitest-pool-workers` and hitting a real D1 from unit tests (mock D1 / services instead)

### Cut

- **Server Actions for auth forms** — The Next.js convention in this repo prefers Server Actions, but this slice is explicitly HTTP POST so the client can hash the password and send it in a JSON body. Forms will `fetch` the route handlers.
- **Public HTTP routes for user update/delete** — The user service will implement update and delete for later sprints. This phase only exposes register, login, and logout over HTTP.
- **Auth-gated `/mcqs`** — Without cookies or tokens there is nothing to check. The stub is reachable by URL; "logged in" means the teacher just arrived from a successful register or login.
- **Client-only SHA-256 stored as-is** — Hashing in the browser keeps plaintext out of the request body, but an unsalted SHA-256 is a password equivalent. The server still applies a per-user salt and PBKDF2 before persist so the database is not holding a replayable digest.

---

## Testing Approach (TDD with Vitest)

This feature is built **test-first**. Vitest is the unit test runner (not installed in the starter today). Follow `.cursor/skills/testing/SKILL.md`.

### Red → green → next phase

For every implementation phase:

1. **Red.** Write the tests listed in that phase *before* the production code (or before the migration SQL). Run `npm test`. They must fail for a real reason: missing module, failing assertion, or unmet behavior. Do not skip this run.
2. **Implement.** Write the minimum production code (or SQL/config) to satisfy those tests.
3. **Green.** Run `npm test` again. The phase is complete only when that phase's tests pass **and** no earlier phase's tests have gone red. Tests plus the acceptance criteria are the done signal.

Do not write assertions that cannot fail (`expect(true).toBe(true)`). Cover failure paths, not only the happy path. Name tests so a failure message explains what broke.

### Harness (install once, at the start of Phase 1)

```bash
npm install -D vitest @vitejs/plugin-react@4 @testing-library/react @testing-library/user-event jsdom vite-tsconfig-paths
```

These packages are **approved for this PRD** (Vitest is the chosen unit framework). Still ask before adding anything else, including `@cloudflare/vitest-pool-workers`.

Add `vitest.config.ts` at the repo root:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
  },
});
```

`vite-tsconfig-paths` is required so `@/` imports resolve. Add scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

### Conventions

- Colocate: `src/lib/password.ts` is tested by `src/lib/password.test.ts`
- Reset mocks in `beforeEach` with `vi.clearAllMocks()`
- Mock at the module boundary with `vi.mock`. Unit tests must not reach a real network, a real D1, or Wrangler
- Stub `server-only` when importing server modules: `vi.mock("server-only", () => ({}))`
- Mock `getCloudflareContext` (or, better, the user service) rather than reconstructing the whole D1 statement chain in every test
- React: `@testing-library/react` + `userEvent`; query by role and accessible name. Server Components are not rendered — test data/helpers as functions; render only `'use client'` components
- Keep D1 access inside `src/lib/services/user-service.ts` so route tests mock that module

---

## Technical Requirements

### Database Schema

Cloudflare D1 (SQLite) is not configured yet. This phase adds a D1 database bound as `DB` and a single `users` table.

Username and email are separate columns and both unique. They may hold the same value for a given teacher (for example both `ada@school.edu`).

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_username ON users (username);
CREATE INDEX idx_users_email ON users (email);
```

**Column notes:**

| Column | Purpose |
|--------|---------|
| `id` | Opaque text primary key |
| `first_name`, `last_name` | Display name for the teacher |
| `username` | Login identifier; unique |
| `email` | Contact / alternate identifier; unique |
| `password_hash` | PBKDF2-SHA-256 derived key, hex-encoded. Never returned in API responses |
| `password_salt` | Per-user random salt, hex-encoded. Never returned in API responses |

Do not store the client SHA-256 digest, and do not store the plaintext password.

### API Endpoints

All bodies are JSON. Route handlers live under `src/app/api/`. Validate every body with Zod before touching the database. Never echo `password`, `password_hash`, or `password_salt`.

#### POST /api/auth/register

Creates a user via the user service, then the client navigates to `/mcqs`.

**Request Body:**

```json
{
  "firstName": "Ada",
  "lastName": "Lovelace",
  "username": "ada",
  "email": "ada@school.edu",
  "password": "<sha-256 hex of the plaintext password>"
}
```

`password` is the **client-side SHA-256** of what the teacher typed, not the plaintext. The server hashes that value again with a new salt before insert.

**Response:**

- Success (201):

```json
{
  "id": "…",
  "firstName": "Ada",
  "lastName": "Lovelace",
  "username": "ada",
  "email": "ada@school.edu"
}
```

- Error (400): Validation failed (missing fields, invalid email, password too short before hashing, etc.)
- Error (409): Username or email already taken. Message should not reveal which one if that is easy to avoid; if not, a clear "username already taken" / "email already taken" is acceptable for this teaching app
- Error (500): Unexpected server error

#### POST /api/auth/login

Looks up the user by username, hashes the submitted digest with the stored salt, and compares.

**Request Body:**

```json
{
  "username": "ada",
  "password": "<sha-256 hex of the plaintext password>"
}
```

Login is by `username` (which may equal the email if the teacher registered that way). Email-as-alternate-login is not in this phase.

**Response:**

- Success (200): Same public user object as register (no password fields)
- Error (400): Validation failed
- Error (401): Invalid username or password. Use one generic message; do not say which field was wrong
- Error (500): Unexpected server error

There is no cookie, token, or session in the success response. The client treats 200 as "proceed to `/mcqs`."

#### POST /api/auth/logout

No server-side session exists to destroy. This endpoint exists so the UI has a real logout call and so a later sprint can attach session cleanup without changing the client contract.

**Request Body:** none (empty JSON object is fine)

**Response:**

- Success (200):

```json
{
  "ok": true
}
```

The client then navigates to `/login`.

### User Interface Requirements

Use existing shadcn/ui pieces (`button`, `card`, `field`, `input`, `label`). Do not add `react-hook-form`. Replace the current Next.js starter homepage; this app's first screens are auth.

#### Login (`/login`)

- Card with username and password fields
- Submit hashes the password in the browser, POSTs `/api/auth/login`, and on success navigates to `/mcqs`
- Link to `/register` for teachers without an account
- Inline field errors for validation; a form-level error for 401
- Password input uses `type="password"`

**Validation (client, before hash):**

- Username required
- Password required, minimum 8 characters (measure the plaintext, not the hex digest)

#### Register (`/register`)

- Card with first name, last name, username, email, password
- Submit hashes the password in the browser, POSTs `/api/auth/register`, and on success navigates to `/mcqs`
- Link back to `/login`
- Field errors for 400; form-level error for 409

**Validation (client, before hash):**

- First name, last name, username required, trimmed, non-empty
- Email required and must look like an email
- Password required, minimum 8 characters
- Username and email may be the same string

#### Home (`/`)

- Redirect to `/login` so the starter marketing page is gone

#### MCQ stub (`/mcqs`)

- Heading and short copy that this is where the shared multiple-choice question bank will live
- No question forms, lists, or APIs
- A Logout button that POSTs `/api/auth/logout` and then navigates to `/login`
- No auth check on this route in this phase

---

## Implementation Phases

Each phase below is a TDD loop. **Write the Red tests first, run them, watch them fail, then implement until Green.** Do not start the next phase while this phase's tests are red.

### Phase 1: Vitest harness, D1, and users migration - COMPLETED

**Objective**: Vitest runs, and teachers' accounts have a real table in a local D1 database.

**TDD gate**: Phase 1 is not complete until the schema contract tests are green and `npm test` exits 0.

#### Red — write these tests first

Install the Vitest harness (config + `test` scripts) so `npm test` can run, then add:

- `src/lib/db/users-schema.test.ts`
  - The migrations directory contains a SQL file that creates `users`
  - `CREATE TABLE users` includes `id`, `first_name`, `last_name`, `username`, `email`, `password_hash`, `password_salt`, `created_at`, `updated_at`
  - `username` and `email` are `UNIQUE`
  - Indexes exist on `username` and `email`
  - The table does **not** include a plaintext `password` column (only `password_hash` / `password_salt`)

Expected: tests fail because there is no migration (or the SQL does not match). That failure is the signal to implement.

#### Implement

1. Finish Vitest config and npm scripts if the red run needed them
2. Bind D1 as `DB` in `wrangler.jsonc` (`database_name`: `quizmaker`). Phase 1 used a local-only `database_id` rather than `wrangler d1 create`, so no remote database was created
3. Run `npm run cf-typegen` so `env.DB` is typed
4. Create a migration for the `users` table and indexes (`migrations/0001_create_users.sql`)
5. Apply the migration **locally only** (`--local`). Do not apply `--remote`

#### Green — phase complete when

- [x] `npm test` passes, including `users-schema.test.ts` (5 tests; red with no `migrations/`, then green)
- [x] D1 binding exists; migration applied locally (`0001_create_users.sql` on `--local` only)
- [x] `cloudflare-env.d.ts` regenerated (not hand-edited); `DB: D1Database` is present

**Deliverables**:
- `vitest.config.ts`, `package.json` `test` / `test:watch` scripts
- `src/lib/db/users-schema.test.ts`
- D1 binding in `wrangler.jsonc`
- Updated `cloudflare-env.d.ts` (generated)
- `migrations/` SQL for `users`
- Local database with the schema applied

### Phase 2: User service and password hashing - COMPLETED

**Objective**: All user persistence and password comparison live in one server module, proven by unit tests with a mocked D1.

**TDD gate**: Phase 2 is not complete until password and user-service tests are green.

#### Red — write these tests first

- `src/lib/password.test.ts` (client SHA-256)
  - Same plaintext always yields the same lowercase hex digest
  - Output is 64 hex characters
  - Different plaintexts yield different digests
  - Digest is not equal to the plaintext
- `src/lib/password-server.test.ts` (PBKDF2)
  - Hashing returns a salt and a hash, both hex, neither equal to the input digest
  - Two hashes of the same digest have different salts (and different hashes)
  - `verify` succeeds for the matching digest + stored salt/hash
  - `verify` fails for a wrong digest
  - `verify` fails when salt or hash is tampered with
- `src/lib/services/user-service.test.ts` (mock D1; never a real database)
  - `createUser` returns a `PublicUser` with id, names, username, email
  - `createUser` return value has no `password`, `password_hash`, or `password_salt`
  - Insert binds a hash and salt, not the plaintext and not the raw client digest as the stored hash
  - Duplicate username / email surfaces as a conflict the service (or caller) can map to 409
  - `getUserByUsername` returns the user when present and `null` when missing
  - `getUserById` returns the user when present and `null` when missing
  - `updateUser` changes name fields; re-hashes only when a new password digest is provided
  - `deleteUser` removes the row (subsequent get returns `null` / delete is invoked)

Expected: tests fail because the modules do not exist or the functions are unimplemented.

#### Implement

1. Propose and add `zod` for request and service input validation (not installed today; still confirm at install time if not already approved)
2. Client-safe SHA-256 helper using Web Crypto
3. Server-only PBKDF2 hash/verify using Web Crypto, with a random per-user salt
4. User service: `createUser`, `updateUser`, `deleteUser`, `getUserByUsername`, `getUserById`
5. `createUser` hashes with a new salt; `updateUser` re-hashes only when a password is provided
6. Public user type omits `password_hash` and `password_salt`

Use the production PBKDF2 iteration count in tests unless the suite becomes too slow; if lowered for tests, inject the count so production stays at 100,000.

#### Green — phase complete when

- [x] `npm test` passes, including all Phase 1 and Phase 2 tests (22 passed)
- [x] Queries use numbered placeholders (`?1`, `?2`)
- [x] User service is the only module that talks to `env.DB`

**Deliverables**:
- `src/lib/password.ts` + `password.test.ts`
- `src/lib/password-server.ts` + `password-server.test.ts`
- `src/lib/services/user-service.ts` + `user-service.test.ts`
- Mocked D1 (or statement helper) used only in tests

### Phase 3: Auth HTTP endpoints - COMPLETED

**Objective**: Register, login, and logout are callable over HTTP, proven by calling the exported route handlers with `Request` objects.

**TDD gate**: Phase 3 is not complete until route-handler tests are green.

#### Red — write these tests first

Mock `@/lib/services/user-service` (do not hit D1). Import `POST` from each `route.ts`.

- `src/app/api/auth/register/route.test.ts`
  - Valid body → 201 and public user; body has no password fields
  - Missing/invalid fields → 400
  - Invalid email → 400
  - Duplicate username or email (service conflict) → 409
- `src/app/api/auth/login/route.test.ts`
  - Valid credentials → 200 and public user; no password fields
  - Missing fields → 400
  - Unknown user → 401 with a generic message
  - Wrong password → 401 with the same generic message (do not leak which was wrong)
- `src/app/api/auth/logout/route.test.ts`
  - POST → 200 and `{ ok: true }`
  - Does not call user-service write methods

Expected: tests fail because the routes do not exist or return the wrong status/body.

#### Implement

1. `POST /api/auth/register` — validate, createUser, return 201 public user
2. `POST /api/auth/login` — validate, lookup, verify hash, return 200 or 401
3. `POST /api/auth/logout` — return `{ ok: true }`
4. Map unique-constraint failures to 409; never leak hashes in logs or bodies

#### Green — phase complete when

- [x] `npm test` passes, including all Phase 1–3 tests (34 passed)
- [x] Success JSON never includes `password`, `password_hash`, or `password_salt`

**Deliverables**:
- `src/app/api/auth/register/route.ts` + `route.test.ts`
- `src/app/api/auth/login/route.ts` + `route.test.ts`
- `src/app/api/auth/logout/route.ts` + `route.test.ts`

### Phase 4: Auth UI and MCQ stub - PLANNED

**Objective**: A teacher can register or log in in the browser and reach the stub, then log out. Client behavior is proven with Testing Library; pages that are Server Components are not rendered in jsdom.

**TDD gate**: Phase 4 is not complete until the client-component tests are green.

#### Red — write these tests first

Extract interactive UI into `'use client'` components (forms, logout button) so they can be rendered. Mock `fetch` and `next/navigation` (`useRouter` / `redirect` as needed).

- `src/components/auth/login-form.test.tsx` (name may match the file you create)
  - Renders username and password fields; password is `type="password"`
  - Submit with empty/short password does not POST
  - Submit hashes the password (body `password` is 64 hex chars, not the plaintext) and POSTs `/api/auth/login`
  - 200 → navigates to `/mcqs`
  - 401 → shows a generic error; stays on the form
  - Link to register is present
- `src/components/auth/register-form.test.tsx`
  - Renders first name, last name, username, email, password
  - Client validation blocks empty required fields and invalid email
  - Submit hashes then POSTs `/api/auth/register`
  - 201 → navigates to `/mcqs`
  - 409 → shows an error
- `src/components/auth/logout-button.test.tsx`
  - Click POSTs `/api/auth/logout` then navigates to `/login`

Expected: tests fail because the client components do not exist or do not hash/POST/navigate yet.

#### Implement

1. Login page at `/login` and register page at `/register` (compose the tested client components)
2. Replace `/` with a redirect to `/login`
3. Client forms hash the password, then `fetch` the matching endpoint
4. MCQ stub at `/mcqs` with the logout button
5. Surface API errors on the forms

Do not try to `render()` Server Component pages in Vitest. If `/` redirect or stub copy is awkward to unit test, prove it in Phase 5's browser pass and say so; do not add a hollow test.

#### Green — phase complete when

- [ ] `npm test` passes, including all Phase 1–4 tests
- [ ] Forms use shadcn `Field` / `Input` / `Button`; no `react-hook-form`

**Deliverables**:
- Client form/logout components + colocated `*.test.tsx`
- `src/app/login/page.tsx`, register page, `src/app/mcqs/page.tsx`
- `src/app/page.tsx` redirects to login

### Phase 5: Verify - PLANNED

**Objective**: The slice is proven with the full Vitest suite green, lint, build, and a real browser pass — not inspection.

This phase does **not** add a new red test list. It is the integration gate: all prior tests stay green while you confirm the running app.

#### Tasks

1. `npm test` — entire suite green (Phase 1–4). If anything is red, go back; do not proceed
2. `npm run lint` and `npm run build`; report actual results
3. Exercise register, duplicate register, login success, login failure, logout in the browser
4. Confirm `/mcqs` is a stub and that responses never include password fields
5. Prefer `npm run preview` for anything that touches D1 / Workers; `npm run dev` will not catch Workers-only issues

#### Green — phase complete when

- [ ] `npm test` exits 0
- [ ] Lint and build succeed (actual output recorded)
- [ ] Browser happy path and main error paths verified

**Deliverables**:
- Full unit suite green
- Lint and build results recorded
- Browser-verified happy path and the main error paths

---

## Technical Implementation Details

### Key Files

- `vitest.config.ts` — Vitest + jsdom + `@/` path resolution
- `wrangler.jsonc` — add D1 binding `DB`
- `migrations/*.sql` — `users` table
- `src/lib/db/users-schema.test.ts` — migration contract (Phase 1)
- `src/lib/password.ts` / `password.test.ts` — SHA-256 hex for the browser
- `src/lib/password-server.ts` / `password-server.test.ts` — generate salt, PBKDF2 derive, verify
- `src/lib/services/user-service.ts` / `user-service.test.ts` — create / update / delete / find / `authenticateUser`; only this module talks to `env.DB`
- `src/lib/auth-schemas.ts` — Zod bodies for register and login
- `src/lib/http.ts` — JSON error helper
- `src/app/api/auth/register/route.ts` / `route.test.ts`
- `src/app/api/auth/login/route.ts` / `route.test.ts`
- `src/app/api/auth/logout/route.ts` / `route.test.ts`
- `src/components/auth/*` — client forms and logout + `*.test.tsx`
- `src/app/login/page.tsx` — login UI
- `src/app/register/page.tsx` — register UI
- `src/app/mcqs/page.tsx` — MCQ stub
- `src/app/page.tsx` — redirect to `/login`

### Password flow

```
Register / Login form
  1. Teacher types plaintext password
  2. Browser: passwordSha256 = hex(SHA-256(utf8(plaintext)))
  3. POST JSON with passwordSha256 in `password` (plaintext never in the body)

Register (server)
  4. Validate body with Zod
  5. salt = 16 random bytes
  6. password_hash = PBKDF2-SHA-256(passwordSha256, salt, 100_000 iterations)
  7. INSERT user; return public fields

Login (server)
  4. Validate body with Zod
  5. Load user by username (including hash + salt)
  6. derived = PBKDF2-SHA-256(submittedSha256, stored salt, same iteration count)
  7. Constant-time compare derived vs password_hash
  8. 200 public user or 401 generic failure
```

Use `crypto.subtle` (Web Crypto) on both sides. Do not add bcrypt; it is a poor fit for Cloudflare Workers.

### User service shape

```typescript
type PublicUser = {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
};

type CreateUserInput = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  passwordSha256: string;
};

// createUser, updateUser, deleteUser, getUserByUsername, getUserById, authenticateUser
```

`updateUser` and `deleteUser` are required on the service even though no HTTP route calls them yet.

### Implementation Patterns

- Reach D1 only from server code via `getCloudflareContext({ async: true })` from `@opennextjs/cloudflare`, then `env.DB`. Centralize queries in the user service; route handlers do not run SQL.
- Prepared statements with numbered placeholders (`?1`, `?2`). Never concatenate user input into SQL.
- Prefer `all()` and read `results[0]` rather than `first()`.
- Mark the user service and password-server modules so they cannot be imported from `'use client'` files.
- Validate with Zod in the route handlers (and in the service if it is called from more than one place).
- Import UI from `@/components/ui/*`. Build forms with `Field`, `FieldLabel`, `FieldError` — there is no shadcn `Form` on Base UI.
- Unit tests mock D1 and `fetch`; they are not a substitute for the Phase 5 browser pass against `npm run preview`.

### Proposed dependencies

| Package | Why | Status |
|---------|-----|--------|
| `zod` | Validate service (and later route-handler) input | **Installed** in Phase 2 (`^4.6.1`) |
| `server-only` | Prevent password-server and user-service from being imported into client components | **Installed** in Phase 2 |
| `vitest`, `@vitejs/plugin-react@4`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `vite-tsconfig-paths` | Unit TDD harness | **Installed** in Phase 1. Pin `plugin-react` to v4; v6 pulls Babel 8 and conflicts with shadcn |

No auth library, no JWT library, no cookie session library. Web Crypto is already in the browser and in the Workers runtime.

D1 is a Cloudflare resource, not an npm package. Phase 1 binds `DB` to database `quizmaker` with a **local-only** `database_id` (`local-only-quizmaker`) so `wrangler d1 … --local` works without creating a remote database. Replace that id with the UUID from `npx wrangler d1 create quizmaker` before any remote use. Never apply migrations with `--remote` unless the user asks.

### Important Notes

- **Do not deploy. Do not apply migrations remotely.** Local `--local` only. The D1 `database_id` in `wrangler.jsonc` is `local-only-quizmaker` until a remote database is created.
- `npm run dev` runs on Node and will not prove D1/Workers behavior. Use `npm run preview` for runtime-sensitive checks.
- Logout cannot invalidate anything on the server in this phase. That is intentional.
- `/mcqs` is not protected. Do not add middleware or cookie checks "just in case."
- Username uniqueness and email uniqueness are both enforced in SQLite. Handle `UNIQUE` constraint errors as 409.
- Keep secrets out of the repo. This slice should not need a new secret if hashing is Web Crypto only.
- **Do not implement a phase's production code before its tests exist and have failed once.** The red run is part of the record.

---

## Acceptance Criteria

- [x] A teacher can register with first name, last name, username, email, and password and receive 201 plus a public user object
- [x] The plaintext password is never written to D1; `password_hash` and `password_salt` are populated
- [ ] The register and login requests send a SHA-256 hex digest, not the plaintext password
- [ ] Username and email may be the same string; both columns still exist and both are unique across users
- [x] A second register with the same username or email is rejected (409)
- [x] A teacher can log in with username + password and receive 200 plus the public user object
- [x] Wrong username or password returns 401 with a generic message
- [ ] Successful register and successful login both land the teacher on `/mcqs`
- [ ] `/mcqs` is a stub (copy + logout only), not an MCQ editor
- [ ] Logout calls `POST /api/auth/logout` and then shows `/login`
- [x] API success bodies never include `password`, `password_hash`, or `password_salt`
- [x] User service exposes create, update, and delete even if only create is used by HTTP in this phase
- [x] No cookies, tokens, or session records are introduced
- [ ] Each implementation phase was built test-first (tests written and failing before production code)
- [ ] `npm test` (Vitest) passes for the whole suite
- [ ] `npm run lint` and `npm run build` succeed

---

## Success Metrics

This is the first slice of a greenfield app; there is no production traffic yet. Treat the table as the bar for a teaching demo, not a live dashboard.

| Metric | Target | How Measured |
|--------|--------|--------------|
| Register happy path | Completes and reaches `/mcqs` without a second visit to the form | Manual browser pass |
| Login happy path | Completes and reaches `/mcqs` for an existing user | Manual browser pass |
| Duplicate account | Rejected with a visible error, no second row | Register twice; inspect D1 locally |
| Credential miss | Stays on login with a generic error | Wrong password in the browser |
| Password at rest | Zero plaintext passwords in `users` | Inspect a local row after register |
| Unit tests | `npm test` exits 0; failure paths covered | Vitest run at each phase gate and Phase 5 |

---

## Dependencies

### External Dependencies

- Cloudflare D1 — user persistence
- Wrangler — create DB, write/apply migrations locally, typegen
- Web Crypto (`crypto.subtle`) — SHA-256 in the browser, PBKDF2 on the server

### Internal Dependencies

- `@opennextjs/cloudflare` `getCloudflareContext()` — access `env.DB`
- shadcn/ui `button`, `card`, `field`, `input`, `label` — auth forms
- `zod` (to be added) — request validation
- Vitest + Testing Library (to be added) — unit TDD
- Next.js App Router — pages and `src/app/api` route handlers

### Environment / config

- `wrangler.jsonc` `d1_databases` binding named `DB`
- No new `.dev.vars` secrets expected for this slice

---

## Risks and Mitigation

### Technical Risks

- **Risk**: Client-side hashing is not authentication. Anyone who intercepts the SHA-256 can replay it. There is also no session, so a later page load cannot prove who is signed in.
- **Mitigation**: Document this as a deliberate Phase 1 baseline. HTTPS still matters in production. A later sprint should add salted server hashing (already in this design), then cookies/sessions and protected routes.

- **Risk**: PBKDF2 iteration count vs Workers CPU time (and slow unit tests).
- **Mitigation**: Start at 100,000 iterations. If preview/login or Vitest is too slow, lower only with a comment in `password-server.ts` and an update here. Do not switch to a Node-only bcrypt build.

- **Risk**: `npm run dev` hides D1 problems because it is not the Workers runtime. Green unit tests with a mocked D1 can hide the same class of bug.
- **Mitigation**: Verify register/login against `npm run preview` in Phase 5 before calling the backend done.

- **Risk**: Hash encoding mismatches (hex vs base64, extra whitespace, UTF-8 vs implicit encoding) cause every login to 401.
- **Mitigation**: One shared client helper, hex lowercase, UTF-8 bytes. Phase 2 tests must include a hash-then-verify round trip.

- **Risk**: Implementing production code before the red tests exist, then retrofitting tests to match the code.
- **Mitigation**: Each phase lists the tests to write first. Agents must run `npm test` once in the red state and keep that as the gate before implementation.

### User Experience Risks

- **Risk**: Teachers refresh `/mcqs` or open it directly and think they are still "logged in" — or that they were kicked out — because there is no session.
- **Mitigation**: Stub copy can stay neutral. Do not fake a signed-in name. Logout is a navigation back to login.

- **Risk**: Generic 401 ("Invalid username or password") feels unhelpful.
- **Mitigation**: Keep it generic anyway so usernames are not enumerable beyond what register 409 already reveals.

---

## Troubleshooting Guide

Add entries here when bugs are found and fixed during implementation.

### D1 not available in `next dev`

**Problem**: `env.DB` is missing or queries fail under `npm run dev`.
**Cause**: The Node dev server does not provide Workers bindings the same way the OpenNext preview does.
**Solution**: Confirm the binding in `wrangler.jsonc`, apply migrations with `--local`, and verify with `npm run preview`.

### Login always returns 401 after a successful register

**Problem**: The same password that registered cannot log in.
**Cause**: Client digest encoding differs from what the server PBKDF2s, or salt/hash columns were swapped.
**Solution**: Confirm both sides use lowercase hex SHA-256 of UTF-8 plaintext, then PBKDF2 with the stored salt and the same iteration count. Compare using a constant-time helper, not `===` on trimmed vs untrimmed strings if you add any encoding layer. Phase 2 round-trip tests should catch this before the UI exists.

### UNIQUE constraint on register

**Problem**: Insert throws instead of a 409 JSON body.
**Cause**: SQLite unique error not mapped in the route handler.
**Solution**: Catch the D1/SQLite unique failure in register (or the service) and return 409. Covered by Phase 2 conflict tests and Phase 3 409 tests.

### Vitest cannot resolve `@/` imports

**Problem**: Tests fail with "Cannot find module '@/…'".
**Cause**: `vite-tsconfig-paths` missing from `vitest.config.ts`.
**Solution**: Add the plugin as in the Testing Approach section.

### `getCloudflareContext` throws in unit tests

**Problem**: User service or route tests fail when importing server modules.
**Cause**: OpenNext context does not exist under jsdom.
**Solution**: Mock `@opennextjs/cloudflare` or mock the user service at the module boundary. Do not introduce `@cloudflare/vitest-pool-workers` without asking.

### In-memory D1 mock treats DELETE as SELECT

**Problem**: `deleteUser` appears to succeed but `getUserById` still returns the row.
**Cause**: A regex like `/FROM users WHERE id = \?1/` also matches `DELETE FROM users WHERE id = ?1`.
**Solution**: Match `SELECT` and `DELETE` separately (`^SELECT …` / `^DELETE …`) in `user-service.test.ts`.

### `npm` blocked in PowerShell (`npm.ps1` not digitally signed)

**Problem**: `npm install` fails with an execution-policy error on `C:\Program Files\nodejs\npm.ps1`.
**Cause**: PowerShell will not run unsigned scripts under the current execution policy.
**Solution**: Call `npm.cmd` (and `npx.cmd`) instead of `npm` / `npx`. Git may also be missing from PATH; use `Git\cmd\git.exe` or add it to PATH.

### `@vitejs/plugin-react@6` peer conflict

**Problem**: `npm install` fails with `ERESOLVE` on `@babel/core@8` vs `@babel/core@7`.
**Cause**: plugin-react v6 wants Babel 8; shadcn still brings Babel 7.
**Solution**: Install `@vitejs/plugin-react@4` (already pinned in `package.json`).

---

## Notes for AI Agents

When working with this PRD:

1. Start by reading the Problem and Hypothesis to understand intent
2. Use Scope (In/Out/Cut) to determine boundaries — do not build out-of-scope items
3. **TDD is mandatory.** For Phases 1–4: write the listed tests, run `npm test` (red), implement, run `npm test` (green). Do not implement first and backfill tests
4. Update phase status markers as work progresses
5. Add implementation details under "Technical Implementation Details" as code is written
6. Mark acceptance criteria as complete when features work
7. Add troubleshooting entries when bugs are found and fixed
8. Keep all sections current — remove outdated information
9. Use code references format: `filepath:line-number` when citing code
10. Vitest, `zod`, and `server-only` are already installed. Ask before adding any other dependency
11. Never run `npm run deploy` or `d1 migrations apply` with `--remote`
12. Do not add cookies, JWTs, NextAuth, or middleware auth in this phase
13. Phase 3 landed the auth HTTP endpoints; keep AGENTS.md current as later phases add UI
14. Follow `.cursor/skills/testing/SKILL.md` for Vitest setup, mocking, and what makes a test worth writing
15. Stop at the end of each phase for user review. Commit and push that phase to `feature/register-login-logout`

---

## Current Status

**Last Updated**: 2026-09-10
**Current Phase**: Phase 3 - Auth HTTP endpoints
**Status**: COMPLETED — stopped for review
**Next Steps**: After review, start Phase 4 (auth UI and MCQ stub) test-first. Do not start MCQ authoring.
