Date created: 2026-09-10
Date last modified: 2026-09-10

# Register, Login, and Logout - Technical PRD

**Branch:** `feature/register-login-logout`
**Status:** COMPLETED (Phases 1–5)

This document is the source of truth for the auth slice. Keep it current when the next sprint (MCQ authoring) starts — do not treat leftover "PLANNED" language as still true.

---

## Overview/Problem

Quiz Maker is a greenfield application for teachers who need to collaborate on a shared bank of multiple-choice questions. Before that collaboration can happen, each teacher needs an account. This slice gives teachers a way to register, log in, and log out, then lands them on `/mcqs`, a stub that the next sprint will turn into the question-bank workflow.

**As of Phase 5 this slice is shipped:** HTTP + UI work locally and the user has deployed and verified them.

---

## Hypothesis

We believe that a simple hashed-password register/login/logout flow, without sessions or tokens, will let multiple teachers obtain accounts and reach the future MCQ workspace so later sprints can focus on the question bank itself.

---

## Scope

### In Scope (done)

- A `users` table in Cloudflare D1, created through a Wrangler migration
- Password hashing on the client before the HTTP POST, and a salted PBKDF2 hash stored in the database (never plaintext)
- A user service with create, update, delete, find, and `authenticateUser`
- HTTP endpoints for register, login, and logout
- Register and login pages (shadcn login/signup blocks, adapted)
- After a successful register or login, navigate to an MCQ stub page
- A Logout control on the MCQ stub that calls logout and returns the teacher to login
- **Test-driven implementation with Vitest** (red → green per phase)

### Out of Scope (still true for the next sprint unless a new PRD says otherwise)

- Multiple-choice question create/edit/list (`/mcqs` is a stub only)
- Social logins (Google, Microsoft, etc.)
- Tokens (JWT, opaque API tokens, refresh tokens)
- Session management, cookies, and route guards
- Password reset, email verification, and profile editing UI
- Roles, permissions, or multi-tenant school/org models
- `@cloudflare/vitest-pool-workers` and hitting a real D1 from unit tests (mock D1 / services instead)

### Cut (do not reintroduce without asking)

- **Server Actions for auth forms** — Client hashes the password then `fetch`es JSON route handlers.
- **Public HTTP routes for user update/delete** — Methods exist on the service only.
- **Auth-gated `/mcqs`** — No cookies/tokens, so there is nothing to check. The stub is reachable by URL.
- **Client-only SHA-256 stored as-is** — Browser SHA-256 plus server salt + PBKDF2.
- **Forgot password / Login with Google / Sign up with Google** — Present on stock shadcn blocks; removed.

---

## As-built map (read this first next time)

### Routes

| Route | Kind | File |
|--------|------|------|
| `/` | Redirect to `/login` | `src/app/page.tsx` |
| `/login` | Static page + client form | `src/app/login/page.tsx`, `src/components/login-form.tsx` |
| `/register` | Static page + client form | `src/app/register/page.tsx`, `src/components/signup-form.tsx` |
| `/mcqs` | Static stub + logout | `src/app/mcqs/page.tsx`, `src/components/logout-button.tsx` |
| `POST /api/auth/register` | Dynamic | `src/app/api/auth/register/route.ts` |
| `POST /api/auth/login` | Dynamic | `src/app/api/auth/login/route.ts` |
| `POST /api/auth/logout` | Dynamic | `src/app/api/auth/logout/route.ts` |

### Layering (do not skip)

```
LoginForm / SignupForm  ('use client')
  sha256Hex()           src/lib/password.ts          ← safe to import from client
  fetch POST JSON
    route.ts            Zod (src/lib/auth-schemas.ts)
      user-service.ts   src/lib/services/user-service.ts  ← only module that uses env.DB
        password-server.ts  PBKDF2 + salt             ← import "server-only"
        D1                  getCloudflareContext({ async: true })
```

Never import `password-server.ts` or `user-service.ts` from a `'use client'` file.

### HTTP contract

Error bodies are always:

```json
{ "error": "human readable message" }
```

| Endpoint | Success | Failures |
|----------|---------|----------|
| `POST /api/auth/register` | 201 public user | 400 validation / invalid JSON; 409 `Username or email already taken`; 500 |
| `POST /api/auth/login` | 200 public user | 400; 401 `Invalid username or password` (same text for unknown user and wrong password); 500 |
| `POST /api/auth/logout` | 200 `{ "ok": true }` | none in this slice |

Public user (never includes password fields):

```json
{
  "id": "uuid",
  "firstName": "Ada",
  "lastName": "Lovelace",
  "username": "ada",
  "email": "ada@school.edu"
}
```

Register body: `{ firstName, lastName, username, email, password }` where `password` is **64-char lowercase SHA-256 hex**, not plaintext.

Login body: `{ username, password }` with the same digest. Login is by **username**, not email.

### Password pipeline (do not change encoding without updating tests)

1. Teacher types plaintext (min 8 chars, measured on plaintext).
2. Browser: `sha256Hex(plaintext)` → 64 lowercase hex chars (`src/lib/password.ts`).
3. POST that digest as `password`.
4. Server: `hashPassword(digest)` → 16-byte random salt + PBKDF2-SHA-256, 100_000 iterations, 256-bit key (`src/lib/password-server.ts`). Store hex `password_hash` and `password_salt`.
5. Login: `authenticateUser(username, digest)` loads the row, `verifyPassword` with constant-time compare, returns `PublicUser` or `null`.

### Git commits on this branch

| Phase | Commit | Message |
|-------|--------|---------|
| 1 | `d52d56f` | Add Vitest and a local D1 users migration. |
| 2 | `356c6b5` | Add hashed-password user service with mocked D1 tests. |
| 3 | `76268f1` | Add register, login, and logout HTTP endpoints. |
| 4 | `b491e8e` | Add shadcn login and signup pages with an MCQ stub. |
| 5 | `2bd9639` | Record Phase 5 verification and bring the auth PRD current. |
| 5b | `461f399` | Document as-built auth code and pin conventions for the next sprint. |

---

## Testing Approach (TDD with Vitest)

Vitest **is installed**. Follow `.cursor/skills/testing/SKILL.md`.

### Red → green (mandatory for new work)

1. **Red.** Write tests before production code. Run `npm test`. They must fail for a real reason.
2. **Implement.** Minimum code to satisfy those tests.
3. **Green.** `npm test` passes, including earlier tests.

Do not write assertions that cannot fail. Cover failure paths. Name tests so a failure message explains what broke.

### Harness (already in the repo)

Pin `@vitejs/plugin-react` to **v4** if reinstalling (v6 wants Babel 8; shadcn still uses Babel 7):

```bash
npm install -D vitest @vitejs/plugin-react@4 @testing-library/react @testing-library/user-event jsdom vite-tsconfig-paths
```

`vitest.config.ts`:

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

Scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

On this Windows machine, PowerShell blocks `npm.ps1`. Use `npm.cmd` / `npx.cmd`. Git may need `Git\cmd` on PATH.

### Conventions

- Colocate: `src/lib/password.ts` ↔ `src/lib/password.test.ts`
- `beforeEach(() => { vi.clearAllMocks(); })`
- Mock at the module boundary. Unit tests must not reach a real network, real D1, or Wrangler
- `vi.mock("server-only", () => ({}))` when importing server modules
- Route tests mock `@/lib/services/user-service`
- User-service tests mock `@opennextjs/cloudflare` `getCloudflareContext` with an in-memory D1
- Form tests mock `fetch` and `next/navigation` `useRouter().push`
- Query React by role and accessible name. Do not `render()` Server Component pages
- Keep D1 access inside `src/lib/services/user-service.ts`

Current suite: **10 files, 48 tests**.

| Test file | Proves |
|-----------|--------|
| `src/lib/db/users-schema.test.ts` | Migration SQL contract |
| `src/lib/password.test.ts` | Client SHA-256 hex |
| `src/lib/password-server.test.ts` | PBKDF2 round-trip, wrong password fails |
| `src/lib/services/user-service.test.ts` | CUD, find, authenticate, UNIQUE → `UserConflictError` (mocked D1) |
| `src/app/api/auth/register/route.test.ts` | 201 / 400 / 409 / 500 |
| `src/app/api/auth/login/route.test.ts` | 200 / 400 / 401 / 500 |
| `src/app/api/auth/logout/route.test.ts` | 200 `{ ok: true }` |
| `src/components/login-form.test.tsx` | Hash + POST + navigate; 401 stays |
| `src/components/signup-form.test.tsx` | Confirm password client-only; 201 navigate; 409 error |
| `src/components/logout-button.test.tsx` | POST logout then `/login` |

---

## Technical Requirements

### Database Schema

Cloudflare D1 is bound as `DB`, database name `quizmaker`. Migration: `migrations/0001_create_users.sql` (applied locally with `--local`).

Username and email are separate unique columns. They may hold the same value (for example both `ada@school.edu`).

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

The service supplies `id` with `crypto.randomUUID()` on insert (does not rely on the SQLite default).

`wrangler.jsonc` in this repo still uses a **local-only placeholder** `database_id` (`local-only-quizmaker`). Production deploy was done by the user. If remote D1 was created for that deploy, keep the real UUID in the deployed config; do not apply migrations with `--remote` unless the user asks.

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "quizmaker",
    "database_id": "local-only-quizmaker"
  }
]
```

After changing bindings: `npm run cf-typegen` (do not hand-edit `cloudflare-env.d.ts`). `env.DB` is `D1Database`.

### API Endpoints

Validate with Zod (`src/lib/auth-schemas.ts`) before touching the database. Never echo `password`, `password_hash`, or `password_salt`.

#### POST /api/auth/register

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

**Response:** 201 public user; 400; 409; 500.

#### POST /api/auth/login

**Request Body:**

```json
{
  "username": "ada",
  "password": "<sha-256 hex of the plaintext password>"
}
```

**Response:** 200 public user; 400; 401 `Invalid username or password`; 500.

No cookie, token, or session. The client treats 200 as "go to `/mcqs`."

#### POST /api/auth/logout

No body required. Always 200 `{ "ok": true }`. No server session to destroy. Client then navigates to `/login`.

### User Interface Requirements

Built from **shadcn login and signup blocks** (Card + Field + Input + Button, Tailwind via `globals.css` tokens). No `react-hook-form`. Do not hand-edit `src/components/ui/*` unless changing the design system.

| Stock shadcn block | Quiz Maker |
|---|---|
| Login field labeled Email | **Username** (API authenticates by username) |
| Signup "Full Name" | **First name** and **Last name** |
| Signup email only | Email **plus username** |
| Signup password | Password **and confirm password** |
| Forgot password / Google buttons | **Removed** |
| `<a href="#">` | Next.js `Link` to `/login` or `/register` |

Auth page shell:

```tsx
<div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
  <div className="w-full max-w-sm">
    {/* LoginForm or SignupForm */}
  </div>
</div>
```

#### Login (`/login`) — `src/components/login-form.tsx`

- Title: "Login to your account"
- Username + password (`type="password"`)
- Client: min 8-char plaintext, then `sha256Hex`, POST `/api/auth/login`, `router.push("/mcqs")` on 200
- 401 → `FieldError` with generic message; stay on the form
- Link: "Don't have an account? Sign up" → `/register`

#### Register (`/register`) — `src/components/signup-form.tsx`

- Title: "Create an account"
- First name, last name, username, email, password, confirm password
- Confirm password is **client-only** (not in the JSON body)
- Client validation: required trimmed names/username, email pattern, password ≥ 8, confirmation matches
- POST `/api/auth/register`; 201 → `/mcqs`; 409 → form-level error
- Link: "Already have an account? Sign in" → `/login`

#### Home (`/`)

`redirect("/login")` in `src/app/page.tsx`.

#### MCQ stub (`/mcqs`)

Heading "Multiple-choice questions", short copy that the shared bank will live here later, `LogoutButton` (POST `/api/auth/logout` then `/login`). No auth gate.

---

## Implementation Phases

Each of Phases 1–4 was a TDD loop. Phase 5 is the verification gate only.

### Phase 1: Vitest harness, D1, and users migration - COMPLETED

**Objective**: Vitest runs, and teachers' accounts have a real table in a local D1 database.

#### Red

`src/lib/db/users-schema.test.ts` — migration SQL creates `users` with required columns, UNIQUE username/email, indexes, no plaintext `password` column.

#### Implement

1. Vitest config + `test` scripts; pin `@vitejs/plugin-react@4`
2. Bind D1 as `DB` (`database_name`: `quizmaker`, local-only `database_id`)
3. `npm run cf-typegen`
4. `migrations/0001_create_users.sql`
5. Apply **locally only** (`npx wrangler d1 migrations apply quizmaker --local`)

#### Green

- [x] Schema tests green (5 tests; red with no `migrations/`, then green)
- [x] D1 binding; local migration applied
- [x] `cloudflare-env.d.ts` regenerated; `DB: D1Database`

### Phase 2: User service and password hashing - COMPLETED

#### Red

`password.test.ts`, `password-server.test.ts`, `user-service.test.ts` (mocked D1).

#### Implement

`zod`, `server-only`, `sha256Hex`, PBKDF2 100_000, user service CUD + finds. `UserConflictError` for UNIQUE failures.

#### Green

- [x] Queries use `?1`, `?2`, …
- [x] Only the user service talks to `env.DB`

### Phase 3: Auth HTTP endpoints - COMPLETED

#### Red

Route tests mock the user service; import `POST` from each `route.ts`.

#### Implement

Register / login / logout handlers. Login uses `authenticateUser` so hashes never leave the service.

#### Green

- [x] Success JSON never includes password fields

### Phase 4: Auth UI and MCQ stub - COMPLETED

#### Red

`login-form.test.tsx`, `signup-form.test.tsx`, `logout-button.test.tsx` (mock `fetch` + `useRouter`).

#### Implement

shadcn blocks adapted as in the UI table; `/` redirects to login; `/mcqs` stub.

Server Component pages are not rendered in Vitest; `/` redirect and stub copy were confirmed in the user's local/deployed browser pass (Phase 5).

### Phase 5: Verify - COMPLETED

**Objective**: Prove the slice with the full suite, lint, build, and a real browser pass.

This phase did not add a new red test list.

#### Results (2026-09-10)

| Check | Result |
|--------|--------|
| `npm test` | **exit 0** — 10 files, **48 passed** |
| `npm run lint` | **exit 0** — clean after removing unused logout `Request` param |
| `npm run build` | **exit 0** — Next.js 16.2.12 Turbopack; `/`, `/login`, `/register`, `/mcqs` static; auth APIs dynamic |
| Browser | **Verified by the user** locally and on their Cloudflare deploy (register, login, logout, stub). No browser MCP in this agent session. |

Build originally failed TypeScript on `Uint8Array` vs `BufferSource` in PBKDF2 (`src/lib/password-server.ts`). Fixed by copying the salt into an `ArrayBuffer` via `toArrayBuffer()` before `deriveBits`. Re-run: tests + lint + build all green.

#### Green

- [x] `npm test` exits 0 (48 passed)
- [x] Lint and build succeed (recorded above)
- [x] Browser happy path and main error paths verified (user local + deploy)

---

## Technical Implementation Details

### Key Files

| Path | Role |
|------|------|
| `vitest.config.ts` | jsdom + `@/` via `vite-tsconfig-paths` |
| `wrangler.jsonc` | D1 binding `DB` |
| `migrations/0001_create_users.sql` | `users` table |
| `src/lib/db/users-schema.test.ts` | Migration contract |
| `src/lib/password.ts` | Client SHA-256 hex |
| `src/lib/password-server.ts` | Salt + PBKDF2; `import "server-only"` |
| `src/lib/services/user-service.ts` | Persistence; only `env.DB` consumer |
| `src/lib/auth-schemas.ts` | Zod register/login bodies |
| `src/lib/http.ts` | `jsonError(message, status)` |
| `src/app/api/auth/*/route.ts` | HTTP |
| `src/components/login-form.tsx` | Client login |
| `src/components/signup-form.tsx` | Client register |
| `src/components/logout-button.tsx` | Client logout |
| `src/app/page.tsx` | Redirect `/` → `/login` |
| `AGENTS.md` | Stable project facts for every agent chat |
| `.cursor/rules/d1.mdc` | D1 conventions (`getCloudflareContext({ async: true })`) |
| `.cursor/rules/auth.mdc` | Hashing, HTTP contract, no sessions |
| `.cursor/skills/testing/SKILL.md` | Vitest conventions |

### Code: client hash

```ts
// src/lib/password.ts
export async function sha256Hex(plaintext: string): Promise<string> {
  const bytes = new TextEncoder().encode(plaintext);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
```

### Code: D1 access

```ts
// src/lib/services/user-service.ts
async function getDb() {
  const { env } = await getCloudflareContext({ async: true });
  return env.DB;
}

async function findFirst(sql: string, ...params: unknown[]) {
  const db = await getDb();
  const { results } = await db.prepare(sql).bind(...params).all<UserRow>();
  return results[0];
}
```

Always `{ async: true }`. Numbered placeholders only. Prefer `all()` + `results[0]`, not `first()`.

### Code: UNIQUE → 409

```ts
export class UserConflictError extends Error {
  constructor(message = "Username or email already taken") {
    super(message);
    this.name = "UserConflictError";
  }
}

function throwIfConflict(error: unknown): void {
  if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
    throw new UserConflictError();
  }
}
```

Register route maps `UserConflictError` to 409.

### Code: login verify stays in the service

```ts
export async function authenticateUser(
  username: string,
  passwordSha256: string,
): Promise<PublicUser | null> {
  // lookup by username, verifyPassword(digest, salt, hash), return PublicUser or null
}
```

Route handlers must not read `password_hash` / `password_salt`.

### Code: PBKDF2 salt typing (Workers + Next typecheck)

`crypto.subtle.deriveBits` wants `BufferSource`. TypeScript's `Uint8Array` generic is not assignable. Copy bytes first:

```ts
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}
```

`PBKDF2_ITERATIONS = 100_000`. Do not switch to bcrypt.

### User service API

```typescript
type PublicUser = {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
};

createUser(input: CreateUserInput): Promise<PublicUser>
updateUser(id: string, patch: UpdateUserInput): Promise<PublicUser>
deleteUser(id: string): Promise<void>
getUserByUsername(username: string): Promise<PublicUser | null>
getUserById(id: string): Promise<PublicUser | null>
authenticateUser(username: string, passwordSha256: string): Promise<PublicUser | null>
```

`updateUser` re-hashes only when `passwordSha256` is provided.

### Code: Zod request bodies (`src/lib/auth-schemas.ts`)

```ts
export const passwordDigestSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "password must be a SHA-256 hex digest");

export const registerBodySchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  username: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: passwordDigestSchema,
});

export const loginBodySchema = z.object({
  username: z.string().trim().min(1),
  password: passwordDigestSchema,
});
```

Route handlers call `safeParse`. Invalid JSON → `jsonError("Invalid JSON", 400)`. Failed Zod → `jsonError("Validation failed", 400)`.

```ts
export function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}
```

### Code: register and login routes

Register maps the JSON `password` field to `createUser({ …, passwordSha256 })`. Login never loads hash/salt itself — it only calls `authenticateUser`.

```ts
// src/app/api/auth/register/route.ts (shape)
const user = await createUser({
  firstName, lastName, username, email,
  passwordSha256: parsed.data.password,
});
return Response.json(user, { status: 201 });
// UserConflictError → jsonError(error.message, 409)
// other → jsonError("Server error", 500)
```

```ts
// src/app/api/auth/login/route.ts (shape)
const user = await authenticateUser(parsed.data.username, parsed.data.password);
if (!user) return jsonError("Invalid username or password", 401);
return Response.json(user); // 200
```

```ts
// src/app/api/auth/logout/route.ts
export async function POST() {
  return Response.json({ ok: true });
}
```

### Code: user-service SQL (numbered placeholders)

```sql
INSERT INTO users (id, first_name, last_name, username, email, password_hash, password_salt)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7);

UPDATE users
SET first_name = ?1, last_name = ?2, username = ?3, email = ?4,
    password_hash = ?5, password_salt = ?6, updated_at = CURRENT_TIMESTAMP
WHERE id = ?7;

DELETE FROM users WHERE id = ?1;

SELECT id, first_name, last_name, username, email, password_hash, password_salt
FROM users WHERE username = ?1;
```

`execute()` and `findFirst()` both use `.prepare(sql).bind(...params).all()`. Do not use `first()`.

### Code: client forms hash then fetch (not Server Actions)

```ts
const response = await fetch("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    username: trimmedUsername,
    password: await sha256Hex(password),
  }),
});
if (response.ok) router.push("/mcqs");
```

Register is the same pattern against `/api/auth/register`, success is **status 201**, body omits confirm-password. Logout: `fetch("/api/auth/logout", { method: "POST" })` then `router.push("/login")`.

Password minimum **8** is measured on plaintext in the browser, not on the digest.

### Code: Vitest mocks the next agent should copy

```ts
vi.mock("server-only", () => ({}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}));

vi.mock("@/lib/services/user-service", () => ({
  createUser: vi.fn(),
  authenticateUser: vi.fn(),
  UserConflictError: class UserConflictError extends Error {
    constructor(message = "Username or email already taken") {
      super(message);
      this.name = "UserConflictError";
    }
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
```

In-memory D1 mock in `user-service.test.ts`: match `^SELECT` and `^DELETE` separately — `/FROM users WHERE id = \?1/` also matches `DELETE FROM users WHERE id = ?1`.

### Cursor rules and skills (already in the repo)

| File | When it applies |
|------|-----------------|
| `.cursor/rules/auth.mdc` | Auth files (hashing, HTTP, no sessions) |
| `.cursor/rules/d1.mdc` | D1 / migrations / `wrangler.jsonc` |
| `.cursor/rules/nextjs.mdc` | App Router |
| `.cursor/rules/shadcn.mdc` | UI primitives |
| `.cursor/rules/tailwind.mdc` | Tailwind v4 tokens |
| `.cursor/rules/cloudflare.mdc` | Workers / OpenNext |
| `.cursor/skills/testing/SKILL.md` | Vitest TDD |
| `AGENTS.md` | Stable project facts every chat |

### Implementation Patterns / rules for the next sprint

- Forms: shadcn `Field`, `FieldLabel`, `FieldError`, `Input`, `Button`, `Card`. No `react-hook-form` unless asked.
- Add shadcn pieces with `npx shadcn@latest add @shadcn/<name>` (the `@shadcn/` namespace is required).
- Tailwind v4 lives in `src/app/globals.css`. No `tailwind.config.js`. Use theme tokens (`bg-background`, `text-muted-foreground`), not one-off hex.
- Validate every route-handler body with Zod. Treat input as untrusted.
- Ask before adding a dependency.
- Do not add cookies, JWT, NextAuth, or middleware auth unless a new PRD asks for sessions.
- Do not build MCQ CRUD until there is a new PRD / phase for it.
- Do not run `npm run deploy` or `d1 migrations apply --remote` unless the user asks.
- TDD for new work. Colocate tests. Mock D1/fetch.

### Installed dependencies (this slice)

| Package | Why | Status |
|---------|-----|--------|
| `zod` ^4.6.1 | Request and service validation | Installed |
| `server-only` | Guard server hashing + D1 modules | Installed |
| `vitest` ^5, `@vitejs/plugin-react` ^4, Testing Library, `jsdom`, `vite-tsconfig-paths` | Unit TDD | Installed |

No auth/JWT/session library.

---

## Acceptance Criteria

- [x] A teacher can register with first name, last name, username, email, and password and receive 201 plus a public user object
- [x] The plaintext password is never written to D1; `password_hash` and `password_salt` are populated
- [x] The register and login requests send a SHA-256 hex digest, not the plaintext password
- [x] Username and email may be the same string; both columns still exist and both are unique across users
- [x] A second register with the same username or email is rejected (409)
- [x] A teacher can log in with username + password and receive 200 plus the public user object
- [x] Wrong username or password returns 401 with a generic message
- [x] Successful register and successful login both land the teacher on `/mcqs`
- [x] `/mcqs` is a stub (copy + logout only), not an MCQ editor
- [x] Logout calls `POST /api/auth/logout` and then shows `/login`
- [x] API success bodies never include `password`, `password_hash`, or `password_salt`
- [x] User service exposes create, update, and delete even if only create is used by HTTP in this phase
- [x] No cookies, tokens, or session records are introduced
- [x] Each implementation phase was built test-first (tests written and failing before production code)
- [x] `npm test` (Vitest) passes for the whole suite (48 tests)
- [x] `npm run lint` and `npm run build` succeed

---

## Success Metrics

| Metric | Target | How Measured | Phase 5 |
|--------|--------|--------------|---------|
| Register happy path | Completes and reaches `/mcqs` | Browser | User verified local + deploy |
| Login happy path | Completes and reaches `/mcqs` | Browser | User verified |
| Duplicate account | Rejected with a visible error | Register twice | User verified; unit 409 |
| Credential miss | Stays on login with generic error | Wrong password | User verified; unit 401 |
| Password at rest | Zero plaintext in `users` | D1 + service tests | Service tests bind hash/salt only |
| Unit tests | `npm test` exits 0 | Vitest | 48 passed |

---

## Dependencies

### External

- Cloudflare D1 — user persistence
- Wrangler — local migrations, typegen. Worker name in `wrangler.jsonc` is still `aisprints-starter` unless the user renamed it on deploy.
- Web Crypto — SHA-256 (browser) and PBKDF2 (server)

### Internal

- `@opennextjs/cloudflare` `getCloudflareContext({ async: true })` — `env.DB`
- shadcn/ui `button`, `card`, `field`, `input`, `label`
- `zod` — request/service validation
- Vitest + Testing Library
- Next.js App Router

### Environment

- `wrangler.jsonc` `d1_databases` binding `DB`
- No `.dev.vars` secrets for this slice

---

## Risks and Mitigation

### Technical

- **Client SHA-256 is replayable; there is no session.** Deliberate baseline. Next auth hardening = cookies/sessions + protected `/mcqs`, not more client hashing.
- **PBKDF2 vs Workers CPU.** 100_000 iterations; change only with a comment in `password-server.ts` and an update here. No bcrypt.
- **`npm run dev` is Node, not Workers.** D1-sensitive checks: `npm run preview` or a real deploy (user already did the latter).
- **Uint8Array vs BufferSource** fails `next build` typecheck. Use `toArrayBuffer()` in `password-server.ts`.
- **Hash encoding mismatch → perpetual 401.** Lowercase hex, UTF-8. Round-trip tests in Phase 2 cover this.

### User experience

- Refreshing `/mcqs` is not "still logged in." Copy stays neutral. No fake signed-in name.
- Keep 401 generic so login does not leak whether the username exists (register 409 already reveals collisions).

---

## Troubleshooting Guide

### D1 not available in `next dev`

**Problem**: `env.DB` missing under `npm run dev`.
**Cause**: Node dev server ≠ Workers bindings.
**Solution**: Binding in `wrangler.jsonc`, migrations `--local`, verify with `npm run preview` or deploy.

### Login always 401 after register

**Cause**: Digest encoding or salt/hash column swap.
**Solution**: Both sides lowercase hex SHA-256 of UTF-8 plaintext; PBKDF2 with stored salt and 100_000 iterations; constant-time compare.

### UNIQUE constraint not mapped to 409

**Cause**: SQLite error not caught.
**Solution**: `throwIfConflict` in the service; register route maps `UserConflictError`.

### Vitest cannot resolve `@/`

**Cause**: Missing `vite-tsconfig-paths` in `vitest.config.ts`.

### `getCloudflareContext` throws in unit tests

**Cause**: No OpenNext context under jsdom.
**Solution**: Mock `@opennextjs/cloudflare` or mock the user service. Do not add `@cloudflare/vitest-pool-workers` without asking.

### In-memory D1 mock treats DELETE as SELECT

**Cause**: `/FROM users WHERE id = \?1/` also matches `DELETE FROM users WHERE id = ?1`.
**Solution**: Match `^SELECT` and `^DELETE` separately in `user-service.test.ts`.

### `npm` blocked in PowerShell (`npm.ps1` not signed)

**Solution**: `npm.cmd` / `npx.cmd`. Git: `Git\cmd\git.exe` if not on PATH.

### `@vitejs/plugin-react@6` peer conflict

**Cause**: Babel 8 vs shadcn's Babel 7.
**Solution**: `@vitejs/plugin-react@4` (pinned in `package.json`).

### `next build` Uint8Array / BufferSource

**Cause**: TS DOM types vs `deriveBits` salt.
**Solution**: `toArrayBuffer()` in `src/lib/password-server.ts`.

### Logout lint unused `Request`

**Cause**: Handler accepted `_request` but never used it.
**Solution**: `export async function POST()` with no param. Tests may still `POST(new Request(...))`.

---

## Notes for AI Agents

1. Read Problem, Hypothesis, **As-built map**, and Scope before writing code.
2. This auth slice is **done**. The next feature is MCQ authoring on `/mcqs` — write/update a PRD for that; do not silently expand this one into sessions or question CRUD.
3. **TDD is mandatory** for new work: listed tests, `npm test` red, implement, `npm test` green.
4. Keep this file and `AGENTS.md` current. Stale "not installed yet" language misleads every future chat.
5. Cite code as `filepath:line-number`.
6. Vitest, `zod`, and `server-only` are installed. Ask before adding anything else.
7. Never `npm run deploy` or `d1 migrations apply --remote` unless the user asks. The user has already deployed this slice themselves.
8. Do not add cookies, JWTs, NextAuth, or middleware auth unless a new PRD says so.
9. Follow `.cursor/skills/testing/SKILL.md`, `.cursor/rules/d1.mdc`, and `.cursor/rules/auth.mdc`.
10. Work on `feature/register-login-logout` unless the user starts a new branch for MCQ.
11. Windows: `npm.cmd` / `npx.cmd`.

### Suggested start for the MCQ sprint

- New PRD under `ai-workspace/` from `TEMPLATE_TECHNICAL_PRD.md`.
- Do not replace `/mcqs` stub copy until the new PRD's first phase.
- Reuse `users.id` as the author if questions are per-teacher; there is still **no session**, so "current user" is not available unless the new PRD adds it.
- Keep auth hashing, endpoints, and forms unless the new PRD explicitly changes them.

---

## Current Status

**Last Updated**: 2026-09-10
**Current Phase**: Phase 5 - Verify
**Status**: COMPLETED
**Next Steps**: New PRD for MCQ authoring from `ai-workspace/TEMPLATE_TECHNICAL_PRD.md`. Do not extend this slice with sessions or social login unless asked. There is still no current-user identity on `/mcqs`.

**Phase 5 evidence**
- `npm test` — 48 passed (10 files)
- `npm run lint` — exit 0
- `npm run build` — exit 0 (routes: `/`, `/login`, `/register`, `/mcqs`, `/api/auth/{register,login,logout}`)
- Browser — user confirmed local and deployed
