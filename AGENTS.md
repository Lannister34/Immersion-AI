# Immersion AI - Operating Guide

## Project State

- The current `client/` and `server/` application is the legacy operational baseline.
- The approved rewrite target is a server-authoritative modular monolith with explicit domain boundaries, shared runtime-validated contracts, and file-backed canonical storage.
- Do not treat the legacy architecture as the target architecture.
- For rewrite work, default to the approved target workspace shape: `apps/api`, `apps/web`, and `packages/*`.

## Runtime Baseline

- Legacy backend: TypeScript in `server/`, currently Express-based, port `4777`
- Legacy frontend: React + Vite in `client/`, port `4778`
- LLM backend default: KoboldCpp at `http://127.0.0.1:5001`
- PM2 start: `pm2 start ecosystem.config.cjs`
- PM2 logs: `pm2 logs`, `pm2 logs immersion-backend`, `pm2 logs immersion-frontend`
- Local app URL: `http://localhost:4778/`
- Legacy route names and legacy file paths are a tech-debt map only, not the target module model.

## Internal Docs To Read

For any non-trivial task, read only the documents needed for the task from `docs/`:

- `docs/architecture/target-architecture.md`
- `docs/architecture/domain-inventory.md`
- `docs/architecture/frontend-module-inventory.md`
- `docs/architecture/type-system-standards.md`
- `docs/engineering/engineering-standards.md`
- `docs/roadmap/rewrite-program.md`
- `docs/process/ai-tooling.md`

For workflow and governance tasks also read:

- `docs/process/development-workflow.md`
- `docs/process/agent-topology.md`
- `docs/architecture/adrs/`

## Non-Negotiable Architecture Rules

- The backend is the only source of truth for persisted data.
- Files remain canonical storage.
- The frontend is a projection of backend-owned state, not a second database.
- Route handlers are transport adapters, not business-rule containers.
- Filesystem access belongs to backend infrastructure and repositories only.
- Prompt building belongs to backend domain/application layers, not React hooks or UI stores.
- Read models and indexes are rebuildable and never canonical.

## Approved Rewrite Stack

### Workspace

- `pnpm` workspaces
- TypeScript project references
- `apps/` + `packages/` layout

### Frontend

- React 19
- Vite
- TanStack Router
- TanStack Query
- Zustand only for UI shell state and ephemeral draft state
- Tailwind CSS v4
- React Hook Form + Zod

### Backend

- Node 24 Active LTS
- Fastify 5
- Zod 4
- Pino

## Backend Domain Inventory

Approved backend modules:

- `characters`
- `chats`
- `lorebooks`
- `scenarios`
- `settings`
- `providers`
- `runtime`
- `prompting`
- `generation`
- `indexing`

Default ownership rules:

- `chats` owns transcript, title, and per-chat overrides
- `generation` never writes foreign files directly
- `providers` does not own runtime process logic
- `prompting` is a derived read-only module
- `indexing` is never a hidden source of truth

Use `docs/architecture/domain-inventory.md` for module responsibilities, public contracts, and allowed cross-domain dependencies.

## Frontend Structure Rules

- Route modules own params, search state, loaders, redirects, and prefetch wiring.
- TanStack Query owns server state.
- TanStack Router owns URL state.
- React local state owns local screen and form state.
- Zustand owns cross-route UI shell state only.
- Components never call `fetch` directly.
- Components do not hand-merge server-owned resources after mutations.
- Do not copy query results into Zustand or another durable client store.
- Keep `shared/` generic; do not dump domain logic into it.

Use `docs/architecture/frontend-module-inventory.md` for route and module boundaries.

## Type System Rules

- Shared types are allowed only through explicit package roles.
- `packages/contracts` owns public transport schemas and DTOs.
- `packages/domain` owns pure business meaning and invariants.
- `apps/api` owns storage models, provider payloads, and framework-specific types.
- `apps/web` owns view models, route state, form values, and UI-only types.
- `apps/web` must not import `packages/domain` directly.
- `packages/contracts` must not depend on `packages/domain`.
- Do not reuse file models as API contracts.
- Do not reuse API DTOs as UI models when the UI needs local shape changes.
- Prefer explicit suffixes such as `Schema`, `Dto`, `Command`, `Query`, `Response`, `Event`, `ViewModel`, `FormValues`, and `Stored*`.
- Do not create generic dump files such as `shared/types.ts` for unrelated exports.

Use `docs/architecture/type-system-standards.md` for detailed naming, import, and review rules.

## Legacy Guardrails

Until the rewrite scaffold becomes the primary path:

- do not grow `client/src/stores/index.ts` with new domain logic
- do not grow `client/src/pages/*.tsx` into larger orchestrators
- do not add more transport, filesystem, and prompt logic into `server/src/routes/*.ts`
- patch legacy only for critical fixes or narrow documented bridge changes

## API And Storage Notes

- API client modules remain the only frontend entry point to the backend.
- Current data lives under `data/` and is gitignored.
- Main current storage areas:
  - `data/characters/`
  - `data/chats/`
  - `data/worlds/`
  - `data/scenarios/`
  - `data/settings.json`
  - `data/user-settings.json`

## Code Design Rules

- One module = one responsibility.
- Prefer refactor over layering.
- Extract repeated logic by the second real use.
- Page and route components are thin orchestrators.
- Hooks coordinate UI flows and query wiring, not domain rules.
- Pure logic lives in domain modules or non-React libs.
- Use named exports.
- Use named interfaces or named types for exported non-primitive shapes.
- No `any`.
- No casual `unknown` or `Record<string, unknown>` when the structure is known.
- Prefer explicit mappers at boundaries.
- Avoid silent fallbacks that hide broken invariants or data loss.
- Do not use `useEffect` to repair state divergence created by poor ownership.

## Workflow

Classify work before changing code:

- `bugfix`
- `rewrite slice`
- `architecture decision`
- `release/process`

Default rules:

- create a feature branch from `dev`
- keep changes inside one slice
- use ADR/RFC discipline for architecture, boundary, or process changes
- do not merge exploratory rewrite spikes without sign-off

## Required Verification

Baseline verification:

- `npm run check`

Additional requirements:

- add regression coverage for touched invariants when practical
- for UI or route behavior changes, prefer Playwright-based evidence
- for high-risk changes, include manual verification notes if automation is still missing
- do not claim verification if a required backend or provider dependency was unavailable
- before push or PR creation, run `npm run verify:prepush`
- when a branch touches rewrite workspace, CI, hooks, lockfiles, or rewrite fixtures, `npm run verify:prepush` must stay green in a clean checkout, not just the current worktree

## AI Tooling Rules

Use the active tooling from `docs/process/ai-tooling.md`.

Minimum expectations:

- use `openai-docs` plus the OpenAI Docs MCP for OpenAI, Codex, Apps SDK, MCP, and API questions
- use `playwright` and `screenshot` for meaningful frontend verification
- use GitHub plugin flows for PR, issue, and CI work when relevant

### Immersion project skills and subagents

Project skills own architecture, boundaries, rewrite-slice discipline, and Immersion-specific verification:

- `immersion-rewrite-governance`
- `rewrite-pr-readiness`
- `immersion-browser-smoke`

Project subagents own deep work inside one boundary:

- `architecture-reviewer`
- `backend-platform-owner`
- `frontend-slice-owner`
- `qa-release-guardian`

### General engineering skills (`agent-skills@addy-agent-skills`)

Use as the craft layer underneath Immersion governance. Lifecycle commands:

- `/spec` and `/plan` — required before any rewrite slice or architecture decision
- `/build` — incremental implementation, one slice at a time
- `/test` — TDD discipline; treat tests as proof, not paperwork
- `/code-simplify` and `/review` — run on touched code before opening a PR
- `/ship` — final pre-merge checks; complements `rewrite-pr-readiness`, never replaces it

Topical skills auto-activate by task type. Rely on them for: `code-review-and-quality`, `code-simplification`, `debugging-and-error-recovery`, `test-driven-development`, `incremental-implementation`, `api-and-interface-design`, `frontend-ui-engineering`, `browser-testing-with-devtools`, `performance-optimization`, `security-and-hardening`, `context-engineering`, `documentation-and-adrs`, `deprecation-and-migration`, `ci-cd-and-automation`, `git-workflow-and-versioning`, `shipping-and-launch`.

General subagents are supplemental, never replacements for Immersion boundary owners:

- `code-reviewer` — extra read on touched code for clarity and dead paths
- `test-engineer` — extra read on test plan and coverage
- `security-auditor` — required for any auth, file-write, provider-credential, or external-input change

### Precedence

When both layers apply:

1. Immersion architecture rules and boundary ownership win on every conflict.
2. `immersion-rewrite-governance` decides classification, slice scope, and required artifacts.
3. `rewrite-pr-readiness` is the source of truth for push/PR readiness; `/ship` adds checks, never overrides.
4. Boundary subagents own implementation; topical skills inform craft inside that boundary.
5. `architecture-reviewer` decides on boundary or framework changes; `code-reviewer` is supplemental.

### Default multi-agent pattern for non-trivial work

1. `immersion-rewrite-governance` — classify and scope
2. `/spec` then `/plan` — capture intent and break down the slice
3. `architecture-reviewer` — challenge boundaries and migration risk
4. one boundary owner:
   - `backend-platform-owner`, or
   - `frontend-slice-owner`
5. `/build` with relevant topical skills active (`test-driven-development`, `incremental-implementation`, etc.)
6. `/code-simplify` then `/review` on touched code
7. `qa-release-guardian` — verification plan and regression gating
8. `immersion-browser-smoke` when UI behavior changed
9. `rewrite-pr-readiness` plus `/ship` before push or PR

Add `security-auditor` whenever the change touches auth, secrets, file writes outside owned repositories, or external-input parsing.

## Review Standard

Reject a change when any of the following is true:

- it introduces frontend-owned durable state for backend-owned resources
- it duplicates a business rule owned elsewhere
- it layers code on top of a broken seam instead of refactoring the owner
- it leaks storage shapes into public contracts
- it hides route state or server state in ad hoc stores
- it changes boundaries or framework assumptions without an ADR
- it changes risky flows without adequate verification

## UI Language

- Interface text is in Russian.
