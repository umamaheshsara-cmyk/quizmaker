Date created: 2026-09-10
Date last modified: 2026-09-10

# MCQ CRUD - Technical PRD

**Branch:** `feature/register-login-logout` (MCQ work is currently on this branch; move to `feature/mcq-crud` if the user asks)
**Status:** Phase 4 COMPLETED; Phase 5 PLANNED

This document is the source of truth for the shared multiple-choice question bank. Auth remains specified by `ai-workspace/register-login-logout_prd.md` and `.cursor/rules/auth.mdc`. Do not change hashing, sessions, or auth routes unless this PRD is explicitly updated.

---

## Overview/Problem

Quiz Maker exists so teachers can collaborate on a shared bank of multiple-choice questions. Register, login, and logout are already shipped. After a successful register or login, teachers land on `/mcqs`, which is still a stub: heading, placeholder copy, and Logout. There is no table for questions, no service, no HTTP API, and no way to create, list, edit, or delete an MCQ.

This slice turns `/mcqs` into a working test-bank: four-choice questions that any teacher who can open the page can add, browse, update, and remove.

---

## Hypothesis

We believe that a simple shared MCQ bank with HTTP CRUD, a four-choice schema, and no per-teacher ownership will let multiple teachers start contributing questions immediately, while leaving sessions, quizzes, and AI generation for later sprints.

---

## Scope

### In Scope

- An `mcqs` table in the existing Cloudflare D1 database `quizmaker`, created through a Wrangler migration applied **locally only**
- An MCQ service with create, list, get-by-id, update, and delete
- HTTP JSON endpoints for those operations
- Replace the `/mcqs` stub with a list of questions, create, edit, and delete
- Keep Logout on the MCQ pages
- **Test-driven implementation with Vitest**: each phase starts with failing tests, then implementation until those tests are green

### Out of Scope

- Sessions, cookies, JWT, route guards, or “current user” identity (unchanged from auth)
- Per-teacher ownership, author fields, or edit/delete permissions
- Assembling quizzes/tests from the bank, or a student-facing take-quiz flow
- Variable number of choices (always four: A–D)
- Tags, subjects, difficulty, explanations, images, or rich text
- AI-generated questions (the AI SDK is not installed)
- Social login, password reset, or any change to auth hashing / auth HTTP
- `@cloudflare/vitest-pool-workers` and hitting a real D1 from unit tests (mock D1 / services instead)

### Cut

- **Server Actions for auth forms** — Auth still uses client `fetch` + JSON route handlers so the password can be hashed in the browser. **MCQ UI uses Server Actions** (`src/app/mcqs/actions.ts`) wrapping the service. JSON `/api/mcqs` remains for the HTTP contract.
- **Author / `created_by` / FK to `users`** — There is still no session, so the server cannot know which teacher is writing. A client-supplied username would be spoofable. The bank is shared and ungated, same as the current `/mcqs` stub.
- **Normalized `choices` table** — Four columns on `mcqs` is enough for this teaching slice. A child table can wait until the product needs N options.
- **Auth-gated `/mcqs` or `/api/mcqs`** — Without cookies/tokens there is nothing to check. Anyone with the URL can list and mutate the bank. That is intentional and must stay documented, not “fixed” with a fake header.

---

## Testing Approach (TDD with Vitest)

Vitest **is installed**. Follow `.cursor/skills/testing/SKILL.md` and the auth PRD’s testing conventions.

### Red → green → next phase

For every implementation phase:

1. **Red.** Write the tests listed in that phase *before* the production code (or before the migration SQL). Run `npm test`. They must fail for a real reason. Do not skip this run.
2. **Implement.** Write the minimum production code (or SQL) to satisfy those tests. Do not start the next phase.
3. **Green.** Run `npm test` again. The phase is complete only when that phase’s tests pass **and** no earlier tests (including all auth tests) have gone red.

Do not write assertions that cannot fail. Cover failure paths (validation, missing id, empty list). Name tests so a failure message explains what broke.

Auth tests must stay green. This slice adds files; it does not rewrite password hashing or auth routes.

### Conventions (same as auth)

- Colocate: `src/lib/services/mcq-service.ts` is tested by `src/lib/services/mcq-service.test.ts`
- `beforeEach(() => { vi.clearAllMocks(); })`
- Mock at the module boundary. Unit tests must not reach a real network, a real D1, or Wrangler
- `vi.mock("server-only", () => ({}))` when importing server modules
- Route tests mock `@/lib/services/mcq-service`
- Service tests mock `@opennextjs/cloudflare` `getCloudflareContext` with an in-memory D1 (copy the user-service test style)
- Form/list tests mock `fetch` and `next/navigation` `useRouter` as needed
- Query React by role and accessible name. Do not `render()` Server Component pages
- Keep D1 access inside `src/lib/services/` modules (`user-service.ts` and `mcq-service.ts`). Route handlers do not run SQL.

On Windows, PowerShell may block `npm.ps1`. Use `npm.cmd` / `npx.cmd`. Git may need `Git\cmd` on PATH.

---

## Technical Requirements

### Database Schema

D1 is already bound as `DB`, database name `quizmaker`. Users live in `migrations/0001_create_users.sql`. This slice adds a second migration for `mcqs`. Do not recreate D1. Do not alter `users`.

```sql
CREATE TABLE mcqs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  prompt TEXT NOT NULL,
  choice_a TEXT NOT NULL,
  choice_b TEXT NOT NULL,
  choice_c TEXT NOT NULL,
  choice_d TEXT NOT NULL,
  correct TEXT NOT NULL CHECK (correct IN ('A', 'B', 'C', 'D')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_mcqs_created_at ON mcqs (created_at);
```

**Column notes:**

| Column | Purpose |
|--------|---------|
| `id` | Opaque text primary key. The service supplies `crypto.randomUUID()` on insert (same as users; do not rely on the SQLite default). |
| `prompt` | The question stem teachers write |
| `choice_a` … `choice_d` | The four answer texts, shown as A/B/C/D |
| `correct` | Which choice is right: exactly `A`, `B`, `C`, or `D` |
| `created_at`, `updated_at` | Set by SQLite on insert; `updated_at` refreshed on update |

No `password` analog, no author column, no soft-delete flag.

Apply with `npx wrangler d1 migrations apply quizmaker --local` only. **Never `--remote` unless the user asks.**

### API Endpoints

All bodies are JSON. Route handlers live under `src/app/api/mcqs/`. Validate every body with Zod before touching the database. Errors always:

```json
{ "error": "human readable message" }
```

Use `jsonError` from `src/lib/http.ts`.

Public MCQ object (camelCase, matching auth’s public user):

```json
{
  "id": "uuid",
  "prompt": "What is 2 + 2?",
  "choiceA": "3",
  "choiceB": "4",
  "choiceC": "5",
  "choiceD": "22",
  "correct": "B",
  "createdAt": "2026-09-10 12:00:00",
  "updatedAt": "2026-09-10 12:00:00"
}
```

`correct` is one of `"A" | "B" | "C" | "D"`.

#### GET /api/mcqs

Lists every question, newest first (`created_at` DESC).

**Request Body:** none

**Response:**

- Success (200): `{ "mcqs": [ /* public MCQ objects */ ] }` — `mcqs` is `[]` when the bank is empty
- Error (500): Unexpected server error

#### GET /api/mcqs/[id]

**Response:**

- Success (200): public MCQ object
- Error (404): `Question not found`
- Error (500)

#### POST /api/mcqs

Creates a question via the MCQ service.

**Request Body:**

```json
{
  "prompt": "What is 2 + 2?",
  "choiceA": "3",
  "choiceB": "4",
  "choiceC": "5",
  "choiceD": "22",
  "correct": "B"
}
```

**Response:**

- Success (201): public MCQ object
- Error (400): Validation failed (missing/blank fields, `correct` not A–D, duplicate choice texts)
- Error (500)

#### PUT /api/mcqs/[id]

Replaces the editable fields. All of `prompt`, `choiceA`–`choiceD`, and `correct` are required (full replace, not a sparse patch). This keeps the client and Zod schema the same as create.

**Request Body:** same as POST

**Response:**

- Success (200): public MCQ object
- Error (400): Validation failed
- Error (404): `Question not found`
- Error (500)

#### DELETE /api/mcqs/[id]

**Request Body:** none

**Response:**

- Success (200): `{ "ok": true }`
- Error (404): `Question not found` if the id does not exist (do not return 200 for a missing row)
- Error (500)

### Validation (Zod, shared by routes)

| Field | Rule |
|-------|------|
| `prompt` | string, trimmed, min 1, max 2000 |
| `choiceA`–`choiceD` | string, trimmed, min 1, max 500 |
| `correct` | enum `A` `B` `C` `D` |
| choices | the four trimmed texts must be pairwise distinct (case-sensitive) |

Id in the URL is a non-empty string. Do not require UUID format in the parser (the service looks the row up).

### User Interface Requirements

Use existing shadcn/ui: `button`, `card`, `field`, `input`, `label`, `table`, `dialog`. Do not add `react-hook-form`. Do not add a new shadcn component unless a listed primitive is missing.

Keep auth pages unchanged. Keep `/` → `/login`.

#### List (`/mcqs`)

- Heading that this is the shared multiple-choice question bank (replace the stub “coming later” copy)
- `LogoutButton` (existing) in the header, same as today
- “Add question” control that navigates to `/mcqs/new`
- Table of questions: prompt (truncated if long), correct letter, Edit, Delete
- Empty state when `mcqs` is `[]`: short copy plus the Add control. Do not render an empty table body as the only hint.
- Delete asks for confirmation (shadcn `dialog`) then `DELETE /api/mcqs/[id]` and refreshes the list
- Edit navigates to `/mcqs/[id]/edit`
- Load the list with `GET /api/mcqs` from a `'use client'` component (do not call `mcq-service` from client code)
- Show a form-level / page-level error if the list request fails

#### Create (`/mcqs/new`)

- Card form: prompt (textarea or input), choices A–D, correct answer (four radios or a select — radios preferred so all options stay visible)
- Submit POSTs JSON to `/api/mcqs` (no password hashing)
- 201 → navigate to `/mcqs`
- 400 → show the API error (and client-side field errors for blanks / duplicate choices / missing correct)
- Link or button back to `/mcqs`
- Logout not required on this page but a back link is required

**Client validation before POST:** same rules as Zod (trimmed non-empty, distinct choices, correct selected).

#### Edit (`/mcqs/[id]/edit`)

- Same fields as create, pre-filled from `GET /api/mcqs/[id]`
- Submit PUT `/api/mcqs/[id]`
- 200 → `/mcqs`
- 404 → message and a way back to the list
- 400 → field / form errors

---

## Implementation Phases

Each of Phases 1–4 is a TDD loop. Phase 5 is the verification gate only. **Do not start the next phase while this phase’s tests are red.** Stop at the end of each phase for user review if they asked to review per phase.

### Phase 1: Database Foundation - PLANNED

**Objective:** The shared question bank has a real `mcqs` table in local D1.

**TDD gate:** Phase 1 is not complete until the schema contract tests are green and `npm test` exits 0 (including existing auth tests).

#### Red — write these tests first

- `src/lib/db/mcqs-schema.test.ts`
  - The migrations directory contains a SQL file that creates `mcqs` (do not require it to be the *only* SQL file; `0001_create_users.sql` already exists)
  - `CREATE TABLE mcqs` includes `id`, `prompt`, `choice_a`, `choice_b`, `choice_c`, `choice_d`, `correct`, `created_at`, `updated_at`
  - `correct` has a `CHECK` that allows only `A`, `B`, `C`, `D`
  - An index exists on `created_at`
  - The table does **not** include `author`, `user_id`, `created_by`, or a plaintext dump of all choices as one JSON column named `choices`

Expected: tests fail because there is no `mcqs` migration (or the SQL does not match). That failure is the signal to implement.

Do not rewrite `users-schema.test.ts`. It must keep passing.

#### Implement

1. Create the migration with Wrangler: `npx wrangler d1 migrations create quizmaker create_mcqs` (or equivalent numbered file such as `migrations/0002_create_mcqs.sql`)
2. Put the `CREATE TABLE` / `CREATE INDEX` SQL from this PRD into that file
3. Apply **locally only**: `npx wrangler d1 migrations apply quizmaker --local`
4. Confirm with a local `PRAGMA table_info(mcqs);` (or `SELECT sql FROM sqlite_master WHERE name = 'mcqs'`)
5. Do **not** run `cf-typegen` unless `wrangler.jsonc` bindings change (they should not)
6. Do **not** apply `--remote`

#### Green — phase complete when

- [ ] `npm test` passes, including `mcqs-schema.test.ts` and all auth tests
- [ ] Local D1 has the `mcqs` table
- [ ] `users` table is unchanged

**Deliverables:**

- `src/lib/db/mcqs-schema.test.ts`
- `migrations/0002_create_mcqs.sql` (name may differ if Wrangler numbers it; keep `0001` untouched)
- Local database with the schema applied
- This PRD updated to COMPLETED for Phase 1 with the actual filename and test counts

### Phase 2: Data Access & Validation (MCQ service) - COMPLETED

**Objective:** All MCQ persistence and input validation live in one server module, proven with a mocked D1.

**TDD gate:** Phase 2 is not complete until `mcq-service` tests are green.

#### Red — write these tests first

`src/lib/services/mcq-service.test.ts` (mock D1; never a real database). First `npm test -- src/lib/services/mcq-service.test.ts` failed to resolve `./mcq-service` (0 tests collected). That was the red signal.

Covered:

- `createMcq` returns a public MCQ with id, prompt, four choices in A–D order, `correct`, timestamps (no `choice_a` / owner fields)
- `createMcq` rejects blank prompt / blank choice / `correct` not A–D (`ZodError`)
- `createMcq` rejects when two choices share the same trimmed text
- Insert uses numbered placeholders (`?1`…`?7`) and binds UUID + fields (not concatenated SQL)
- `listMcqs` returns `[]` when empty
- `listMcqs` returns created rows, newest first (`ORDER BY created_at DESC`)
- `getMcqById` returns the MCQ when present and `null` when missing
- `updateMcq` changes prompt/choices/correct and throws `McqNotFoundError` when the id is missing
- `deleteMcq` removes the row; subsequent get is `null`; missing id throws `McqNotFoundError`

#### Implement

1. `src/lib/mcq-schemas.ts` — Zod create/update body (`prompt` 1–2000, choices 1–500, `correct` A–D, pairwise-distinct trimmed texts)
2. `src/lib/services/mcq-service.ts` — `import "server-only"`; `getCloudflareContext({ async: true })`; `all()` + `results[0]`
3. Typed `McqNotFoundError` (`"Question not found"`) for missing id on update/delete
4. `toPublicMcq` maps snake_case columns to camelCase (does not leak `choice_a`)

This schema is a single `mcqs` table. There is **no** owner column (shared bank), **no** child `choices` table (so no `ON DELETE CASCADE` and no INTEGER `is_correct` boolean mapping). Choice order is the A–D columns. D1 access for questions is owned by this service only.

`user-service.ts` stays the users module. Both services may use `env.DB`. No HTTP routes were added (Phase 3).

#### Green — phase complete when

- [x] `npm test` passes — **11 files, 59 passed** (auth 48 + MCQ service 11)
- [x] Queries use `?1`, `?2`, … (insert binds seven fields; update binds six fields + id; delete binds id)
- [x] Only `src/lib/services/*` talks to `env.DB`
- [x] `npm run lint` — **exit 0**

**Deliverables:**

- `src/lib/mcq-schemas.ts`
- `src/lib/services/mcq-service.ts` + `mcq-service.test.ts`

### Phase 3: MCQ HTTP endpoints - COMPLETED

**Objective:** List, get, create, update, and delete are callable over HTTP.

**TDD gate:** Phase 3 is not complete until route-handler tests are green.

#### Red — write these tests first

Mock `@/lib/services/mcq-service`. Import handlers from each `route.ts`. First run failed to resolve `./route` in both test files (0 tests collected).

- `src/app/api/mcqs/route.test.ts`
  - GET → 200 `{ mcqs: [...] }` (including empty array)
  - GET unexpected failure → 500 `"Server error"`
  - POST valid body → 201 public MCQ
  - POST missing fields / invalid `correct` / duplicate choices → 400 `"Validation failed"`
  - POST invalid JSON → 400 `"Invalid JSON"`
  - POST unexpected failure → 500
- `src/app/api/mcqs/[id]/route.test.ts`
  - GET existing → 200
  - GET missing → 404 `Question not found`
  - PUT valid → 200
  - PUT invalid body / invalid JSON → 400
  - PUT missing id → 404
  - DELETE existing → 200 `{ ok: true }`
  - DELETE missing → 404

#### Implement

1. `GET`/`POST` in `src/app/api/mcqs/route.ts`
2. `GET`/`PUT`/`DELETE` in `src/app/api/mcqs/[id]/route.ts`
3. Zod `safeParse` of `mcqInputSchema` before the service; `McqNotFoundError` → 404; unknown errors → 500 `"Server error"`

Layering is **Client → `fetch` JSON route handler → `mcq-service` → D1**, matching auth. Server Actions were cut in this PRD (no session, same HTTP contract as register/login). No ownership checks, cascade deletes, choice-row repositioning, or quiz-attempt scoring — those are out of scope for this schema.

#### Green — phase complete when

- [x] `npm test` passes — **13 files, 76 passed** (auth + Phase 2 service + 17 route tests)
- [x] Success JSON uses the public camelCase shape
- [x] `npm run lint` — **exit 0**

**Deliverables:**

- `src/app/api/mcqs/route.ts` + `route.test.ts`
- `src/app/api/mcqs/[id]/route.ts` + `route.test.ts`

### Phase 4: Server Actions and MCQ UI - COMPLETED

**Objective:** Teachers manage the bank from `/mcqs`. Mutations go **Client → Server Action → `mcq-service` → D1**. Actions never touch `env.DB`.

**TDD gate:** Phase 4 is not complete until action tests and client-component tests are green.

#### Red — write these tests first

- `src/app/mcqs/actions.test.ts` — first run failed to resolve `./actions`
  - `createMcqAction` / `updateMcqAction` / `deleteMcqAction` / `listMcqsAction` / `getMcqAction`
  - Zod 400-equivalent `{ ok: false, error: "Validation failed" }` without calling the service
  - `McqNotFoundError` → `{ ok: false, error: "Question not found" }`
  - Success results; `revalidatePath("/mcqs")` on writes
  - Create input has no `ownerId` / `userId` (shared bank)
- `src/components/mcq-list.test.tsx` — mock actions, not `fetch`
- `src/components/mcq-form.test.tsx` — client validation blocks empty/duplicate choices; create/update actions; 404 edit state

#### Implement

1. `src/app/mcqs/actions.ts` (`"use server"`) wrapping the Phase 2 service + `mcqInputSchema` / `mcqIdSchema`
2. List/new/edit pages as Server Components that call list/get actions, then pass data into client forms
3. `McqList` / `McqForm` using shadcn `Table`, `Field`, `Input`, `Button`, `Dialog`, `Card`
4. Replace stub copy on `/mcqs`; keep `LogoutButton`
5. `.cursor/rules/mcq.mdc`

JSON `/api/mcqs` routes from Phase 3 stay. The UI does not `fetch` them. No ownership checks (no session). No quiz-attempt scoring.

#### Green — phase complete when

- [x] `npm test` — **16 files, 102 passed**
- [x] `/mcqs` is no longer a stub
- [x] No `react-hook-form`
- [x] `npm run lint` — **exit 0**
- [x] Server Actions do not import `getCloudflareContext` / `env.DB`

**Deliverables:**

- `src/app/mcqs/actions.ts` + `actions.test.ts`
- Client MCQ components + colocated `*.test.tsx`
- List / new / edit pages
- `.cursor/rules/mcq.mdc`

### Phase 5: Verify - PLANNED

**Objective:** Prove the slice with the full suite, lint, build, and a real browser pass.

This phase does **not** add a new red test list.

#### Tasks

1. `npm test` — entire suite green (auth + MCQ). If anything is red, go back
2. `npm run lint` and `npm run build`; report actual results
3. In the browser: empty list, create, list shows the row, edit, delete, validation errors, 404 edit URL
4. Confirm login → `/mcqs` still works; logout still returns to `/login`
5. Prefer `npm run preview` for anything that touches D1 / Workers

#### Green — phase complete when

- [ ] `npm test` exits 0 (record file and test counts)
- [ ] Lint and build succeed (recorded)
- [ ] Browser happy path and main error paths verified

---

## Technical Implementation Details

### Layering (do not skip)

```
McqList / McqForm     ('use client')
  Server Actions      src/app/mcqs/actions.ts
    Zod               src/lib/mcq-schemas.ts
      mcq-service.ts  src/lib/services/mcq-service.ts  ← D1 for questions
        D1            getCloudflareContext({ async: true })
```

JSON `src/app/api/mcqs/*` still exists (Phase 3). The UI does not `fetch` those routes.

Never import `mcq-service.ts` or `user-service.ts` from a `'use client'` file (types from `mcq-schemas.ts` are safe).

`user-service.ts` remains the only module that reads `users`. `mcq-service.ts` is the only module that reads `mcqs`.

### Key files

| Path | Role | Status |
|------|------|--------|
| `migrations/0002_create_mcqs.sql` | `mcqs` table | Phase 1 (not in this workspace at Phase 2) |
| `src/lib/db/mcqs-schema.test.ts` | Migration contract | Phase 1 |
| `src/lib/mcq-schemas.ts` | Zod create/update bodies + `PublicMcq` | **Phase 2/4 done** |
| `src/lib/services/mcq-service.ts` | Persistence | **Phase 2 done** |
| `src/lib/services/mcq-service.test.ts` | Mocked D1 (11 tests) | **Phase 2 done** |
| `src/app/api/mcqs/route.ts` | GET list, POST create | **Phase 3 done** |
| `src/app/api/mcqs/[id]/route.ts` | GET/PUT/DELETE one | **Phase 3 done** |
| `src/app/mcqs/actions.ts` | Server Actions | **Phase 4 done** |
| `src/components/mcq-list.tsx` | List + delete confirm | **Phase 4 done** |
| `src/components/mcq-form.tsx` | Create/edit form | **Phase 4 done** |
| `src/app/mcqs/page.tsx` | Bank list + logout | **Phase 4 done** |
| `src/app/mcqs/new/page.tsx` | Create | **Phase 4 done** |
| `src/app/mcqs/[id]/edit/page.tsx` | Edit | **Phase 4 done** |
| `.cursor/rules/mcq.mdc` | Conventions | **Phase 4 done** |

Reuse: `src/lib/http.ts` (`jsonError`), `src/components/logout-button.tsx`, shadcn table/dialog/field.

### MCQ service shape (as-built, Phase 2)

```typescript
type PublicMcq = {
  id: string;
  prompt: string;
  choiceA: string;
  choiceB: string;
  choiceC: string;
  choiceD: string;
  correct: "A" | "B" | "C" | "D";
  createdAt: string;
  updatedAt: string;
};

type McqInput = {
  prompt: string;
  choiceA: string;
  choiceB: string;
  choiceC: string;
  choiceD: string;
  correct: "A" | "B" | "C" | "D";
};

// createMcq(input): PublicMcq
// listMcqs(): PublicMcq[]
// getMcqById(id): PublicMcq | null
// updateMcq(id, input): PublicMcq  // throws McqNotFoundError
// deleteMcq(id): void              // throws McqNotFoundError
```

D1 access (same pattern as `user-service.ts`):

```ts
async function getDb() {
  const { env } = await getCloudflareContext({ async: true });
  return env.DB;
}

await db.prepare(sql).bind(...params).all();
```

Always `{ async: true }`. Numbered placeholders only. Prefer `all()` + `results[0]`, not `first()`.

`McqNotFoundError` default message is `Question not found` so Phase 3 can map it to 404 without a second string.

Validation lives in `mcqInputSchema` (`src/lib/mcq-schemas.ts`). The service calls `.parse()` on create and update so it is safe if later called from more than one place. Routes in Phase 3 should reuse the same schema.

### Implementation patterns

- Reach D1 only from server code via `getCloudflareContext({ async: true })`, then `env.DB`
- Prepared statements with numbered placeholders (`?1`, `?2`). Never concatenate user input into SQL
- Prefer `all()` and `results[0]` rather than `first()`
- Validate with Zod in the route handlers; the service may parse again so it is safe if called from more than one place
- Import UI from `@/components/ui/*`. Forms use `Field`, `FieldLabel`, `FieldError`
- Unit tests mock D1 and `fetch`; they are not a substitute for Phase 5 against `npm run preview`

### Proposed dependencies

None. `zod`, `server-only`, and Vitest are already installed. Ask before adding anything else.

### Important notes

- **Do not deploy. Do not apply migrations remotely.** Local `--local` only.
- `npm run dev` runs on Node and will not prove D1/Workers behavior. Use `npm run preview` for runtime-sensitive checks.
- `/mcqs` and `/api/mcqs` are not protected. Do not add middleware or cookie checks “just in case.”
- Do not store the correct answer in a separate secret table; this is a teacher bank, not a live exam.
- Do not change `wrangler.jsonc` `database_id` as part of this slice unless the user asks. Local migrations use `--local` regardless of whether the id is a placeholder or a real UUID.
- **Do not implement a phase’s production code before its tests exist and have failed once.**

---

## Acceptance Criteria

- [ ] Local D1 has an `mcqs` table with prompt, four choices, `correct` CHECK A–D, timestamps
- [x] `users` and auth behavior are unchanged
- [x] A teacher can create an MCQ and receive 201 plus the public object
- [x] List returns every question, newest first, including `[]` when empty
- [x] A teacher can edit an existing MCQ (200) and delete it (`{ ok: true }`)
- [x] Missing id on get/update/delete returns 404 `Question not found`
- [x] Invalid bodies (blank prompt, invalid `correct`, duplicate choice texts) return 400
- [x] `/mcqs` shows the bank, empty state, add/edit/delete, and Logout
- [x] Successful create/edit returns the teacher to `/mcqs`
- [ ] No cookies, tokens, sessions, or author columns are introduced
- [x] Each implementation phase was built test-first
- [x] `npm test` (Vitest) passes for the whole suite (auth + MCQ)
- [ ] `npm run lint` and `npm run build` succeed

---

## Success Metrics

There is no production traffic requirement for this teaching demo.

| Metric | Target | How Measured |
|--------|--------|--------------|
| Create happy path | Completes and the question appears on `/mcqs` | Manual browser pass |
| Edit happy path | Changed prompt/correct shows after save | Manual browser pass |
| Delete | Row disappears after confirm | Manual browser pass |
| Empty bank | Empty state, not a broken table | Open `/mcqs` on a fresh local DB |
| Auth still works | Login still reaches `/mcqs`; logout still reaches `/login` | Manual browser pass |
| Unit tests | `npm test` exits 0; failure paths covered | Vitest at each phase gate and Phase 5 |

---

## Dependencies

### External Dependencies

- Cloudflare D1 — already bound as `DB` (`database_name`: `quizmaker`)
- Wrangler — create/apply the `mcqs` migration locally

### Internal Dependencies

- `@opennextjs/cloudflare` `getCloudflareContext({ async: true })`
- `src/lib/http.ts` — `jsonError`
- `src/lib/services/user-service.ts` — do not call it from MCQ routes; auth stays as-is
- shadcn `button`, `card`, `field`, `input`, `label`, `table`, `dialog`
- `zod`, Vitest, Testing Library (already installed)
- Next.js App Router — pages and `src/app/api/mcqs` route handlers
- Existing `/login`, `/register`, Logout

### Environment / config

- Existing `wrangler.jsonc` `d1_databases` binding named `DB`
- No new `.dev.vars` secrets

---

## Risks and Mitigation

### Technical Risks

- **Risk:** Two services talking to D1 invite copied SQL helpers that drift (placeholders, `first()` vs `all()`).
- **Mitigation:** Copy the user-service access pattern (`getDb`, numbered `bind`, `all()` + `results[0]`). Do not introduce a generic query layer unless the user asks.

- **Risk:** Green unit tests with a mocked D1 hide Workers/D1 issues (`npm run dev` has the same gap).
- **Mitigation:** Phase 5 uses `npm run preview` for create/list/edit/delete.

- **Risk:** `CHECK (correct IN ('A','B','C','D'))` plus Zod can fail in two layers with different messages.
- **Mitigation:** Zod is the user-facing 400. The CHECK is a last-resort integrity constraint. Tests cover Zod; do not depend on the SQLite error string in HTTP.

- **Risk:** Implementing UI or HTTP before the migration exists.
- **Mitigation:** Phase 1 is database only. Do not start Phase 2 until Phase 1 is green and the user has reviewed if they asked to stop per phase.

- **Risk:** Accidental `--remote` migration.
- **Mitigation:** Never run `d1 migrations apply` without `--local` unless the user explicitly asks for remote.

### User Experience Risks

- **Risk:** Teachers think only they can see “their” questions. The bank is global.
- **Mitigation:** Page copy should say it is a **shared** bank. Do not show a fake “Signed in as …” name.

- **Risk:** Anyone with `/mcqs` can delete the bank.
- **Mitigation:** Keep delete behind a confirm dialog. Do not add auth gates in this slice. A later session sprint can add permissions.

- **Risk:** Long prompts blow up the table layout.
- **Mitigation:** Truncate prompt in the table; full text on the edit form.

---

## Troubleshooting Guide

Add entries here when bugs are found and fixed during implementation.

### D1 not available in `next dev`

**Problem:** `env.DB` is missing or queries fail under `npm run dev`.
**Cause:** The Node dev server does not provide Workers bindings the same way OpenNext preview does.
**Solution:** Confirm the binding in `wrangler.jsonc`, apply migrations with `--local`, and verify MCQ CRUD with `npm run preview`.

### Schema tests still see only `users`

**Problem:** `mcqs-schema.test.ts` fails with no `CREATE TABLE mcqs`.
**Cause:** Migration file not created, wrong directory, or SQL in a comment-only file.
**Solution:** Put real `CREATE TABLE mcqs` SQL under `migrations/`, keep `0001_create_users.sql` intact, re-run `npm test`.

### `getCloudflareContext` throws in unit tests

**Problem:** MCQ service tests fail when importing the service.
**Cause:** OpenNext context does not exist under jsdom.
**Solution:** Mock `@opennextjs/cloudflare` the way `user-service.test.ts` does. Do not add `@cloudflare/vitest-pool-workers` without asking.

### Unique choice validation only on the client

**Problem:** API accepts two identical choices.
**Cause:** Distinct-choice rule implemented only in the form.
**Solution:** Enforce in Zod (`mcq-schemas.ts`) so POST/PUT cannot skip it.

---

## Notes for AI Agents

When working with this PRD:

1. Read Problem, Hypothesis, and Scope (In/Out/Cut) before writing code
2. **TDD is mandatory** for Phases 1–4: listed tests, `npm test` (red), implement, `npm test` (green)
3. Implement **only the current phase**. Phase 4 is done (Server Actions + UI). Phase 5 is verify only — lint/build/browser; do not add features.
4. Update phase status markers and this Current Status section as work progresses
5. Add implementation details under Technical Implementation Details as code is written (filenames, commit hashes)
6. Mark acceptance criteria as complete when features work
7. Add troubleshooting entries when bugs are found and fixed
8. Keep all sections current — remove leftover PLANNED language after a phase ships
9. Cite code as `filepath:line-number`
10. Ask before adding any new dependency
11. Never run `npm run deploy` or `d1 migrations apply` with `--remote` unless the user asks
12. Do not add cookies, JWTs, NextAuth, middleware auth, or author columns
13. Do not change auth hashing, `users`, or `/api/auth/*`
14. Follow `.cursor/skills/testing/SKILL.md`, `.cursor/rules/d1.mdc`, `.cursor/rules/auth.mdc`, and `.cursor/rules/nextjs.mdc`
15. Windows: `npm.cmd` / `npx.cmd`
16. After each phase, stop for review if the user asked to review each phase. Phase 4 is complete; wait before Phase 5.

---

## Current Status

**Last Updated:** 2026-09-10
**Current Phase:** Phase 4 - Server Actions and MCQ UI
**Status:** COMPLETED
**Next Steps:** Phase 5 — verify (`npm test`, lint, build, browser). Do not start Phase 5 until asked. Do not add sessions.

**Phase 4 evidence**
- Red: `actions.test.ts` failed to resolve `./actions`
- Green: `npm test` — 16 files, **102 passed** (exit 0)
- `npm run lint` — exit 0 (list/form load on the server to avoid `setState` in `useEffect`)
- No new dependencies

**Phase 4 mapping of the “Server Actions” prompt**

| Prompt item | As-built |
|-------------|----------|
| Layering | Client UI → `src/app/mcqs/actions.ts` → `mcq-service` → D1 |
| Zod | `mcqInputSchema` / `mcqIdSchema` in the actions before the service |
| Ownership checks | None — shared ungated bank (no session) |
| Success / error | `{ ok: true, … }` or `{ ok: false, error }` (`Validation failed`, `Question not found`, `Server error`) |
| Server-side correctness | `correct` is A–D, unique choices; service CHECK is last-resort |
| Actions must not access DB | Actions import the service only; no `getCloudflareContext` |
