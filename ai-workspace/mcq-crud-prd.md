Date created: 2026-09-10
Date last modified: 2026-09-10

# MCQ CRUD - Technical PRD

**Branch:** `feature/register-login-logout` (MCQ work is currently on this branch; move to `feature/mcq-crud` if the user asks)
**Status:** Phase 8 COMPLETED

This document is the source of truth for the shared multiple-choice question bank. Auth remains specified by `ai-workspace/register-login-logout_prd.md` and `.cursor/rules/auth.mdc`. Do not change hashing, sessions, or auth routes unless this PRD is explicitly updated.

---

## Overview/Problem

Quiz Maker exists so teachers can collaborate on a shared bank of multiple-choice questions. Register, login, and logout are already shipped. After a successful register or login, teachers land on `/mcqs`. Phases 1–7 shipped the shared four-choice bank: D1-backed service, JSON API, Server Actions, dashboard list, New/Edit forms, and a single-question preview/attempt graded on the server. Phase 8 verified that slice (tests, lint, build, local D1, Workers preview HTTP) and brought this PRD current.

This slice is the working test-bank: four-choice questions that any teacher who can open the page can add, browse, update, and remove.

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
- A single-question preview/attempt: select A–D, submit, server grades against D1, record an anonymous attempt, Try Again / Back
- **Test-driven implementation with Vitest**: each phase starts with failing tests, then implementation until those tests are green

### Out of Scope

- Sessions, cookies, JWT, route guards, or “current user” identity (unchanged from auth)
- Per-teacher ownership, author fields, or edit/delete permissions
- Assembling quizzes/tests from the bank, or a multi-question student exam
- Variable number of choices (always four: A–D)
- Tags, subjects, difficulty, explanations, images, or rich text
- AI-generated questions (the AI SDK is not installed)
- Social login, password reset, or any change to auth hashing / auth HTTP
- `@cloudflare/vitest-pool-workers` and hitting a real D1 from unit tests (mock D1 / services instead)

### Cut

- **Server Actions for auth forms** — Auth still uses client `fetch` + JSON route handlers so the password can be hashed in the browser. **MCQ UI uses Server Actions** (`src/app/mcqs/actions.ts`) wrapping the service. JSON `/api/mcqs` remains for the HTTP contract.
- **Author / `created_by` / FK to `users`** — There is still no session, so the server cannot know which teacher is writing. A client-supplied username would be spoofable. The bank is shared and ungated.
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
- Keep D1 access inside `src/lib/services/` modules (`user-service.ts`, `mcq-service.ts`, and `attempt-service.ts`). Route handlers do not run SQL.

On Windows, PowerShell may block `npm.ps1`. Use `npm.cmd` / `npx.cmd`. Git may need `Git\cmd` on PATH.

---

## Technical Requirements

### Database Schema

D1 is already bound as `DB`, database name `quizmaker`. Users live in `migrations/0001_create_users.sql`. This slice adds migrations for `mcqs` and `attempts`. Do not recreate D1. Do not alter `users`.

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

`attempts` (Phase 7, `migrations/0003_create_attempts.sql`): `id`, `mcq_id` (FK to `mcqs` ON DELETE CASCADE), `selected` CHECK A–D, `is_correct` 0/1, `created_at`. No `user_id`.

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
- “Create Question” control that navigates to `/mcqs/new`
- Table of questions: prompt (truncated if long), correct letter, Preview, Edit, Delete
- Preview navigates to `/mcqs/[id]` (attempt UI). Correctness is **not** shown on that page until the server grades a submit
- Empty state when `mcqs` is `[]`: short copy plus the Create Question control. Do not render an empty table body as the only hint.
- Loading: `Suspense` fallback on first paint; `role="status"` while the list refreshes after delete
- Delete asks for confirmation (shadcn `dialog`) then `deleteMcqAction` and refreshes the list
- Edit navigates to `/mcqs/[id]/edit`
- Load the list in a Server Component via `listMcqsAction` and pass `initialMcqs` / `initialError` into `McqList`. Do not `fetch` `/api/mcqs` from the client and do not `setState` in `useEffect` to load the list
- Show a page-level error if the list action fails

#### Create (`/mcqs/new`)

- Card titled **New Question**: Question stem (textarea, stored as `prompt`), choices A–D, correct answer (four radios so all options stay visible)
- Form helper copy (CardDescription) explains the shared four-choice bank. There is **no stored description/explanation field**
- Submit calls `createMcqAction` (no password hashing, no `fetch` to `/api/mcqs`)
- Success → navigate to `/mcqs`
- Validation / action errors stay on the form
- **Save** and **Cancel** (Cancel → `/mcqs`); `role="status"` Saving… while the action is in flight
- Link back to `/mcqs`
- Logout not required on this page but a back link is required

**Client validation before save:** same rules as Zod (trimmed non-empty Question, distinct A–D, exactly one correct selected). Always four choices; no add/remove.

#### Edit (`/mcqs/[id]/edit`)

- Same fields as create, titled **Edit Question**, pre-filled from `getMcqAction`
- Submit `updateMcqAction`
- Success → `/mcqs`
- 404 → message and a way back to the list
- Loading: `Suspense` fallback (`McqFormFallback`); page is `force-dynamic`

#### Preview / attempt (`/mcqs/[id]`)

- Load via `getMcqForAttemptAction` — props omit `correct`
- Radios A–D, **Submit** calls `submitAttemptAction(id, selected)` only (no client `isCorrect`)
- Server compares `selected` to the D1 `correct` column and inserts `attempts`
- Feedback: Correct / Incorrect (and the server letter when wrong)
- **Try Again** clears local state; **Back** → `/mcqs`
- Loading: `Suspense` + Checking… while grading; 404 when the id is missing

---

## Implementation Phases

Each of Phases 1–8 is a TDD loop except Phase 8, which is verification and documentation. Variable choice counts (2–6), stored descriptions/explanations, multi-question quizzes, and sessions stay out of scope. **Do not start the next phase while this phase’s tests are red.** Stop at the end of each phase for user review if they asked to review per phase.

### Phase 1: Database Foundation - COMPLETED

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

- [x] `npm test` includes `mcqs-schema.test.ts` (Phase 8 restored the missing migration + contract tests)
- [x] Local D1 has the `mcqs` table (`PRAGMA`/sqlite_master via `wrangler d1 execute --local`)
- [x] `users` table is unchanged

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

### Phase 5: Dashboard MCQ List - COMPLETED

**Objective:** `/mcqs` is the teacher dashboard: table, Create Question, row actions Edit / Preview / Delete, delete confirmation, and loading / empty / error states. Auth and hydration stay as Phase 4: no session, list loaded on the server, Logout still uses `POST /api/auth/logout`.

Do not redo Phases 1–4. Do not add a Phase 6 (preview route, quizzes, ownership). No new dependencies.

**TDD gate:** Phase 5 is not complete until the new list tests are green and `npm test` / `npm run lint` exit 0.

#### Red — write these tests first (`src/components/mcq-list.test.tsx`)

- Create Question links to `/mcqs/new`
- Preview opens a dialog with the full prompt, A–D, and a Correct badge
- Loading `role="status"` while the list refreshes after a confirmed delete
- Existing empty, error, Edit, and delete-confirm cases stay green

First run after those tests: Create Question / Preview / loading failed (link still said “Add question”; no Preview button; no status).

#### Implement

1. `McqList`: Create Question, Preview dialog (shadcn `Dialog` + `Badge`), `role="status"` while `listMcqsAction` refreshes
2. `McqListFallback` + `Suspense` around the server `McqBank` loader so first paint can show loading without a client `useEffect`
3. Keep `LogoutButton` outside the suspense boundary so logout hydration is unchanged
4. Do not `fetch` `/api/mcqs` from the client

#### Green — phase complete when

- [x] `npm test` — **16 files, 104 passed** (exit 0). One earlier full-suite run had two `signup-form` timeouts; a clean re-run passed all 104.
- [x] `npm run lint` — **exit 0**
- [x] `npm run build` — **exit 0** (Next.js 16.2.12; first run failed typecheck on `deleteMcqAction`, then succeeded after the return-type fix)
- [x] No `react-hook-form`, no new dependencies, no auth/session changes
- [ ] Browser / `npm run preview` — not run in Phase 5. Covered in Phase 8 over HTTP against Workers preview (no GUI browser tools).

**Deliverables:**

- `src/components/mcq-list.tsx` — dashboard table + Preview + Create Question + loading/empty/error
- `src/app/mcqs/page.tsx` — `Suspense` + server-loaded `McqBank`
- Updated `mcq-list.test.tsx`

### Phase 6: Create/Edit MCQ - COMPLETED

**Objective:** `/mcqs/new` and `/mcqs/[id]/edit` are complete teacher flows: Question stem, four choices, exactly one correct, validation, Save/Cancel, loading, and errors. Auth and the four-column schema stay as Phases 1–5.

Do not redo Phases 1–5. Do not start Phase 7. No new dependencies.

**TDD gate:** Phase 6 is not complete until the new form tests are green and `npm test` / `npm run lint` exit 0.

#### Red — write these tests first (`src/components/mcq-form.test.tsx`)

- Titles: New Question / Edit Question
- Question label (maps to `prompt`); A–D; no Add/Remove choice
- Cancel → `/mcqs`
- Exactly one correct radio
- Saving `role="status"` while `createMcqAction` is in flight; Save disabled
- Existing empty-field, duplicate-choice, create/update, and 404 cases stay green (Save button name is **Save**)

First run: 10 failed (titles still “Add a question”, label still Prompt, no Cancel, Save still “Save question”).

#### Implement

1. `McqForm`: New/Edit titles, Question textarea, Save + Cancel, Saving… status
2. Edit page: `Suspense` + `McqFormFallback`, `force-dynamic`
3. Keep four radios A–D. Do not add a description column or 2–6 choice UI

#### Green — phase complete when

- [x] `src/components/mcq-form.test.tsx` — **12 passed**
- [x] `npm test` — **16 files, 109 passed** (exit 0)
- [x] `npm run lint` — **exit 0**
- [x] No `react-hook-form`, no new dependencies, no 2–6 choice schema change

**Deliverables:**

- `src/components/mcq-form.tsx` + `mcq-form.test.tsx`
- `src/app/mcqs/new/page.tsx`, `src/app/mcqs/[id]/edit/page.tsx`

### Phase 7: Preview & Attempts - COMPLETED

**Objective:** Teachers can preview a question, pick an answer, and get server-side correct/incorrect feedback. The attempt is recorded. Auth, four-choice CRUD, and the dashboard stay as Phases 1–6.

Do not redo Phases 1–6. Do not start Phase 8. No new dependencies. No sessions — attempts have no `user_id`.

**TDD gate:** Phase 7 is not complete until schema/service/action/UI tests are green and `npm test` / `npm run lint` exit 0.

#### Red — write these tests first

- `src/lib/db/attempts-schema.test.ts` — `CREATE TABLE attempts` with `mcq_id`, `selected` A–D, `is_correct`, no `user_id`
- `src/lib/services/attempt-service.test.ts` — grade from the stored letter; persist; 404
- `src/app/mcqs/actions.test.ts` — `getMcqForAttemptAction` omits `correct`; `submitAttemptAction` validates and grades
- `src/components/mcq-attempt.test.tsx` — select, submit, feedback, Try Again, Back, loading, 404
- `src/components/mcq-list.test.tsx` — Preview links to `/mcqs/[id]`

First run: schema/service files missing; actions not exported; Preview still a dialog.

#### Implement

1. `migrations/0003_create_attempts.sql` (apply **locally** after `0002` exists)
2. `attempt-service.ts` — `SELECT correct FROM mcqs`, then `INSERT INTO attempts`. Never trust a client `isCorrect`
3. `getMcqForAttemptAction` / `submitAttemptAction` — actions must not use `env.DB`
4. `McqAttempt` + `/mcqs/[id]/page.tsx` (`force-dynamic`, `Suspense`)
5. Dashboard Preview becomes a link (dialog removed so the attempt page does not leak the letter before submit)

#### Green — phase complete when

- [x] `npm test` — **19 files, 127 passed** (exit 0)
- [x] `npm run lint` — **exit 0**
- [x] Client submit payload is `(id, selected)` only
- [x] No new dependencies, no session, no multi-question quiz

**Deliverables:**

- `migrations/0003_create_attempts.sql`
- `src/lib/services/attempt-service.ts` + test
- `src/components/mcq-attempt.tsx` + test
- `src/app/mcqs/[id]/page.tsx`

### Phase 8: Quality, Documentation & Final Verification - COMPLETED

**Objective:** Prove the shipped MCQ slice against this PRD. No new features, no new dependencies, no scope change.

Do not redo Phases 1–7 except to restore missing documented artifacts or fix bugs found in verification.

#### Tasks

1. Review code against In/Out/Cut, layering, and acceptance criteria
2. `npm test`, `npm run lint`, `npm run build` — record actual results
3. Confirm local D1 has `users`, `mcqs`, and `attempts`
4. Confirm no cookies/JWT/sessions/author columns
5. Walk the user flow against `npm run preview` (Workers + local D1). Record GUI gaps if no browser tools.
6. Bring this PRD current (phase markers, schema, key files, troubleshooting)

#### Verification findings (fixed)

- Missing `migrations/0002_create_mcqs.sql` and `mcqs-schema.test.ts` — restored from this PRD’s Phase 1 SQL (not a new feature)
- Preview/attempt Submit was `type="button"` outside a form — wrapped in a form with `type="submit"`; answer radios in a labelled `radiogroup`
- `signup-form.test.tsx` timed out at 5s while typing six fields — `userEvent.setup({ delay: null })` (test-only; register UI unchanged)
- After `npm run preview`, `eslint .` scanned `.wrangler/tmp` worker bundles — ignore `.wrangler/**` in `eslint.config.mjs`

#### `npm run preview` user-flow pass (Workers on `http://127.0.0.1:8787`)

No GUI browser tools in this session. The flow was exercised with HTTP against the OpenNext/Wrangler preview (D1 bound locally), which is the runtime that matters for this stack.

- `GET /` → **307** `/login`; `/login`, `/register`, `/mcqs`, `/mcqs/new` → **200**
- Register **201**, login **200** (no `Set-Cookie`), bad password **401** `"Invalid username or password"`, logout **200** `{ ok: true }`, then `/login` **200**
- Validation: blank prompt / duplicate choices / invalid `correct` → **400** `"Validation failed"`
- Create **201** public MCQ; list and dashboard HTML include the prompt; get-by-id **200**; missing id **404** `"Question not found"`
- `/mcqs/[id]` preview: prompt, A–D, Submit, labelled `radiogroup`; no `"correct":"B"` in the attempt payload; unknown id shows Question not found
- `/mcqs/[id]/edit` shows Edit Question with the prompt prefilled; PUT **200** updates prompt/`correct`; DELETE **200** `{ ok: true }` then GET **404**
- `submitAttemptAction` on preview: selected B (correct) → `{ ok: true, isCorrect: true, correct: "B" }`; selected A → `{ ok: true, isCorrect: false, correct: "B" }`; local D1 `attempts` recorded `is_correct` 1 then 0. No `Set-Cookie` on the action response
- Dashboard HTML: Create Question, Preview/Edit links, Delete, Logout

Not visually clicked in a browser: delete confirm dialog, Saving… spinner, Try Again in the GUI.

#### Green — phase complete when

- [x] `npm test` — **20 files, 131 passed** (exit 0)
- [x] `npm run lint` — **exit 0**
- [x] `npm run build` — **exit 0** (Next.js 16.2.12; routes include `/mcqs`, `/mcqs/new`, `/mcqs/[id]`, `/mcqs/[id]/edit`, `/api/mcqs`)
- [x] Local D1 tables: `users`, `mcqs`, `attempts` (`mcqs` has no author/`user_id`; `attempts` has no `user_id`)
- [x] No session/cookie/JWT usage under `src/`
- [x] `npm run preview` user flow verified over HTTP (Workers + local D1); GUI click-through was not available in this session

**Deliverables:** this PRD updated; missing `0002` migration + schema tests in repo

---

## Technical Implementation Details

### Layering (do not skip)

```
McqList / McqForm / McqAttempt   ('use client')
  Server Actions                 src/app/mcqs/actions.ts
    Zod                          src/lib/mcq-schemas.ts
      mcq-service.ts             D1 for question CRUD
      attempt-service.ts         SELECT mcqs.correct + INSERT attempts
        D1                       getCloudflareContext({ async: true })
```

JSON `src/app/api/mcqs/*` still exists (Phase 3). The UI does not `fetch` those routes.

Never import `mcq-service.ts`, `attempt-service.ts`, or `user-service.ts` from a `'use client'` file (types from `mcq-schemas.ts` are safe).

`user-service.ts` remains the only module that reads `users`. `mcq-service.ts` owns question CRUD. `attempt-service.ts` may `SELECT correct FROM mcqs` only to grade, then writes `attempts`.

### Key files

| Path | Role | Status |
|------|------|--------|
| `migrations/0002_create_mcqs.sql` | `mcqs` table | **Phase 1/8 done** |
| `src/lib/db/mcqs-schema.test.ts` | Migration contract | **Phase 1/8 done** |
| `src/lib/mcq-schemas.ts` | Zod create/update bodies + `PublicMcq` | **Phase 2/4 done** |
| `src/lib/services/mcq-service.ts` | Persistence | **Phase 2 done** |
| `src/lib/services/mcq-service.test.ts` | Mocked D1 (11 tests) | **Phase 2 done** |
| `src/app/api/mcqs/route.ts` | GET list, POST create | **Phase 3 done** |
| `src/app/api/mcqs/[id]/route.ts` | GET/PUT/DELETE one | **Phase 3 done** |
| `src/app/mcqs/actions.ts` | Server Actions | **Phase 4 done** |
| `migrations/0003_create_attempts.sql` | Anonymous attempts | **Phase 7 done** |
| `src/lib/services/attempt-service.ts` | Server-side grade + insert | **Phase 7 done** |
| `src/components/mcq-attempt.tsx` | Preview/attempt UI | **Phase 7 done** |
| `src/app/mcqs/[id]/page.tsx` | Preview route | **Phase 7 done** |
| `src/components/mcq-list.tsx` | Dashboard list; Preview → `/mcqs/[id]` | **Phase 7 done** |
| `src/components/mcq-form.tsx` | Create/edit form (New/Edit, Save/Cancel) | **Phase 6 done** |
| `src/app/mcqs/page.tsx` | Bank list + logout + Suspense | **Phase 5 done** |
| `src/app/mcqs/new/page.tsx` | Create | **Phase 6 done** |
| `src/app/mcqs/[id]/edit/page.tsx` | Edit + Suspense | **Phase 6 done** |
| `.cursor/rules/mcq.mdc` | Conventions | **Phase 7/8 current** |

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

- [x] Local D1 has an `mcqs` table with prompt, four choices, `correct` CHECK A–D, timestamps
- [x] `users` and auth behavior are unchanged
- [x] A teacher can create an MCQ and receive 201 plus the public object
- [x] List returns every question, newest first, including `[]` when empty
- [x] A teacher can edit an existing MCQ (200) and delete it (`{ ok: true }`)
- [x] Missing id on get/update/delete returns 404 `Question not found`
- [x] Invalid bodies (blank prompt, invalid `correct`, duplicate choice texts) return 400
- [x] `/mcqs` shows the bank, empty/loading/error states, Create Question, Preview/Edit/Delete, and Logout
- [x] Successful create/edit returns the teacher to `/mcqs`
- [x] Preview/attempt grades on the server (`(id, selected)` only) and records `attempts`
- [x] No cookies, tokens, sessions, or author columns are introduced
- [x] Each implementation phase was built test-first
- [x] `npm test` (Vitest) passes for the whole suite (auth + MCQ)
- [x] `npm run lint` and `npm run build` succeed
- [x] `npm run preview` (Workers) end-to-end HTTP: auth, CRUD, preview page, server-graded attempt + D1 `attempts` row, logout → `/login` (no GUI browser in this session)

---

## Success Metrics

There is no production traffic requirement for this teaching demo.

| Metric | Target | How Measured |
|--------|--------|--------------|
| Create happy path | Completes and the question appears on `/mcqs` | Phase 8: POST `/api/mcqs` 201 + dashboard HTML; Vitest list/form |
| Edit happy path | Changed prompt/correct shows after save | Phase 8: PUT 200 then GET; Vitest form/actions |
| Delete | Row disappears after confirm | Phase 8: DELETE 200 then GET 404; Vitest confirm dialog |
| Empty bank | Empty state, not a broken table | Vitest empty copy; list returns `{ mcqs: [] }` |
| Auth still works | Login still reaches `/mcqs`; logout still reaches `/login` | Phase 8: register/login/logout HTTP; `/login` 200 after logout |
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
- **Mitigation:** Truncate prompt in the table; full text in Preview and on the edit form.

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

### `wrangler d1 migrations apply` waits for confirmation

**Problem:** The command hangs in a local PowerShell session with no table applied.
**Cause:** Wrangler prompts for confirmation in interactive terminals.
**Solution:** Set `CI=true` so the prompt is skipped (`$env:CI = "true"; npx wrangler d1 migrations apply quizmaker --local`). Never add `--remote`.

### `deleteMcqAction` fails `next build` typecheck

**Problem:** `Type '{ ok: true; }' is not assignable to type 'McqActionResult<Record<string, never>>'`.
**Cause:** `{ ok: true } & Record<string, never>` makes `ok` incompatible with the empty index signature.
**Solution:** Type delete success as `{ ok: true } | McqActionError` instead of intersecting with `Record<string, never>`.

### Signup form Vitest cases time out at 5s

**Problem:** `signup-form.test.tsx` fails with `Test timed out in 5000ms` while typing six fields.
**Cause:** `@testing-library/user-event` default key delay plus a busy machine (for example `npm run preview` running) exceeds the default test timeout.
**Solution:** Call `userEvent.setup({ delay: null })` in that file so typing is synchronous. Do not change the register form itself.

### `npm run lint` floods warnings after preview

**Problem:** `eslint .` reports thousands of warnings from generated worker bundles.
**Cause:** Wrangler writes `.wrangler/tmp/**/worker.js` while `npm run preview` is running; those files were not in ESLint ignores.
**Solution:** Ignore `.wrangler/**` in `eslint.config.mjs` (same idea as `.next/**` and `.open-next/**`). Do not edit the generated bundles.

---

## Notes for AI Agents

When working with this PRD:

1. Read Problem, Hypothesis, and Scope (In/Out/Cut) before writing code
2. **TDD is mandatory** for Phases 1–7: listed tests, `npm test` (red), implement, `npm test` (green). Phase 8 is verification only.
3. Implement **only the current phase**. Phase 8 (quality and documentation) is done. Do not invent multi-question quizzes, 2–6 choices, stored descriptions, or ownership unless a new PRD asks.
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
16. After each phase, stop for review if the user asked to review per phase. Phase 8 is complete. Wait for review.

---

## Current Status

**Last Updated:** 2026-09-10
**Current Phase:** Phase 8 - Quality, Documentation & Final Verification
**Status:** COMPLETED
**Next Steps:** Wait for user review. Do not add sessions, 2–6 choices, or a multi-question exam.

**Phase 8 evidence**
- `npm test` — 20 files, **131 passed** (exit 0)
- `npm run lint` — exit 0
- `npm run build` — exit 0
- Local D1 (`wrangler d1 execute --local`): `users`, `mcqs`, `attempts`
- `src/` has no cookie/JWT/session usage
- Restored missing `0002_create_mcqs.sql` + `mcqs-schema.test.ts` from the Phase 1 contract
- Attempt UI: form submit + labelled radiogroup
- Signup Vitest flake: `userEvent.setup({ delay: null })` so six-field fills stay under 5s
- ESLint ignore `.wrangler/**` so preview temp bundles are not linted
- `npm run preview` on `127.0.0.1:8787`: auth + CRUD + preview HTML + `submitAttemptAction` grades and writes `attempts`; no new dependencies
- GUI browser click-through was not available; HTTP against Workers preview was used instead

**Phase 7 evidence**
- Red: attempts schema/service missing; Preview still a dialog; actions not exported
- Green: `npm test` — 19 files, **127 passed** (exit 0)
- `npm run lint` — exit 0
- Grading reads `correct` from D1; client sends only `(id, selected)`
- Attempts have no `user_id` (no session)
- No new dependencies

**Phase 7 mapping of the “Preview & Attempts” prompt**

| Prompt item | As-built |
|-------------|----------|
| Display question and choices | `/mcqs/[id]` via `getMcqForAttemptAction` (no `correct` in props) |
| Select / submit | Radios A–D + Submit → `submitAttemptAction` |
| Correct/incorrect feedback | Server `isCorrect` + letter when wrong |
| Record the attempt | `INSERT INTO attempts` |
| Try Again / Back | Clears local state / links to `/mcqs` |
| Loading / error | Checking…; Suspense; 404 |
| Server-side correctness | `attempt-service` compares to D1; client cannot send `isCorrect` |

**Phase 6 evidence**
- Red: 10 form tests failed (titles, Question label, Cancel, Save name, saving status)
- Green: `mcq-form.test.tsx` — **12 passed**; `npm test` — 16 files, **109 passed** (exit 0)
- `npm run lint` — exit 0
- Four-choice schema and Server Actions unchanged
- No new dependencies

**Phase 6 mapping of the “Create/Edit MCQ” prompt**

| Prompt item | As-built |
|-------------|----------|
| Question / description | Question textarea → `prompt`. No stored description (out of scope) |
| 2–6 choices, add/remove | Always four A–D; no add/remove controls |
| Exactly one correct | Radios named `correct` |
| Validation | Client + Zod: required, unique choices, correct A–D |
| Save / Cancel | Save submits the action; Cancel links to `/mcqs` |
| Loading | Saving… on submit; edit page `Suspense` + `McqFormFallback` |
| Errors | Field errors, action `formError`, 404 edit load |

**Phase 5 evidence**
- Red: Create Question / Preview / loading tests failed against the Phase 4 list
- Green: `npm test` — 16 files, **104 passed** (exit 0)
- `npm run lint` — exit 0
- `npm run build` — exit 0 after typing delete success as `{ ok: true } | McqActionError`
- List still hydrates from server `initialMcqs` (no client `useEffect` load); page is `force-dynamic` so D1 is not snapshotted at build time
- Auth unchanged: login/register still `fetch` + JSON; logout still `POST /api/auth/logout`
- No new dependencies

**Phase 5 mapping of the “Dashboard MCQ List” prompt**

| Prompt item | As-built |
|-------------|----------|
| Table | Prompt (truncated to 80), correct letter, actions |
| Create Question | Link to `/mcqs/new` |
| Edit / Preview / Delete | Edit → `/mcqs/[id]/edit`; Preview → `/mcqs/[id]` (Phase 7 replaced the dialog); Delete confirm dialog |
| Delete confirmation | Existing “Delete this question?” dialog then `deleteMcqAction` |
| Loading / empty / error | `Suspense` + refresh `role="status"`; empty copy; `initialError` alert |
| Auth / hydration | `LogoutButton` kept; no session; no client list `fetch` |

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
