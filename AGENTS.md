# AGENTS.md

Instructions for AI agents working in this repository. This file is loaded into every
agent conversation, so it describes only what is stable and true of the project.

## Project

<!--
Replace this section during Sprint 1 with a short description of what you are building:
the problem, the primary user, and the current state. Two or three sentences.
Keep it current. An out-of-date description here misleads every future conversation.
-->

Quiz Maker is a greenfield app for teachers who will share a bank of multiple-choice
questions. Register, login, and logout are complete (HTTP + UI, Vitest, D1). `/mcqs`
is still a stub. Auth source of truth: `ai-workspace/register-login-logout_prd.md`.
MCQ CRUD source of truth: `ai-workspace/mcq-crud-prd.md` (not built yet; start at
Phase 1). Do not add sessions unless a PRD asks for them.

## Stack

- **Next.js 16** with the App Router and React 19
- **Cloudflare Workers** for hosting, via `@opennextjs/cloudflare`
- **Tailwind CSS v4**, configured in CSS rather than a JS config file
- **shadcn/ui** on Base UI, `base-nova` style, with Lucide icons
- **TypeScript** in strict mode
- **Wrangler** for Cloudflare configuration, secrets, and deployment
- **Cloudflare D1** bound as `DB` (`database_name`: `quizmaker`); migrations live in `migrations/`
- **Vitest** for unit tests (`npm test` / `npm run test:watch`)
- **Zod** for input validation
- **`server-only`** on modules that touch D1 or server password hashing

There is **no session, cookie, or JWT**. Login is by username. Do not add an auth
library unless a new PRD asks for it. Auth conventions live in
`.cursor/rules/auth.mdc`. An AI SDK is not installed yet.

## Layout

```
src/app/            Routes, layouts, and global styles (App Router)
src/components/ui/  shadcn/ui components (generated; avoid hand-editing)
src/lib/            Shared utilities and services (`src/lib/services/` for domain logic)
migrations/         D1 SQL migrations (apply locally only)
ai-workspace/       Technical PRDs and planning documents
.cursor/rules/      File-scoped conventions (`d1.mdc`, `auth.mdc`, …)
.cursor/skills/     Task-specific guidance loaded on demand
public/             Static assets
```

Import through the `@/` alias, which maps to `src/`.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server on Node at `localhost:3000` |
| `npm run preview` | Build and run on the local **Workers** runtime |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests (single run) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run deploy` | Build and deploy to Cloudflare |
| `npm run cf-typegen` | Regenerate `cloudflare-env.d.ts` after changing bindings |

`npm run dev` runs on Node and will not surface Workers-specific problems. Verify
anything runtime-sensitive with `npm run preview`.

## Working agreements

- **Do not deploy.** Never run `npm run deploy` unless explicitly asked.
- **Do not touch the remote database.** Migrations may be applied locally only.
- **Ask before adding a dependency.** This is a teaching repository; an unexplained
  dependency is a cost. Propose it and say why.
- **Do not edit generated files.** `cloudflare-env.d.ts`, `next-env.d.ts`, and
  `package-lock.json` are generated.
- **Keep secrets out of the repo.** Local values belong in `.dev.vars`, which is
  gitignored. When adding a variable, also add an empty placeholder to
  `.dev.vars.example`. Production values go in `wrangler secret put`.
- **Verify before claiming completion.** Run `npm test`, `npm run lint`, and `npm run build` and
  report the actual result. Do not describe work as done based on inspection alone.
  New behavior is test-first (see `.cursor/skills/testing/SKILL.md`).
- **Say when you are unsure.** A flagged uncertainty is more useful than a confident
  guess that has to be unwound later.

## Cursor Cloud specific instructions

Cloud agents have no Cloudflare credentials and no `.dev.vars`. In that environment:

- `npm run dev`, `npm run build`, and `npm run lint` work normally.
- `npm run preview`, `npm run deploy`, and any `wrangler` command that needs
  authentication will fail. This is expected. Do not try to authenticate.
- If a task genuinely requires Cloudflare access, stop and report that it must be run
  locally instead.
