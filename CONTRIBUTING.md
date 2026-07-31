# Contributing

This repository is in a governed rewrite phase. Delivery is spec-first, ADR-driven, and enforced through CI.

## Source Of Truth

- Workflow: `docs/process/development-workflow.md`
- Agent delegation model: `docs/process/agent-topology.md`
- Repo-local Codex skill: `.codex/skills/immersion-rewrite-governance/SKILL.md`
- Target architecture: `docs/architecture/target-architecture.md`
- Rewrite roadmap: `docs/roadmap/rewrite-program.md`
- ADRs: `docs/architecture/adrs/`

## Local Commands

```bash
npm run check
npm run dev
```

## Branching

- Branch from `dev`
- Use `rewrite/*`, `feat/*`, `fix/*`, or `refactor/*`
- Open every non-trivial change as a draft PR first

## Required Process

- Bugfixes need a reproducible report or issue
- Any change that affects stack, boundaries, state model, routing, data contracts, persistence, or process needs an ADR
- Any rewrite slice larger than a small isolated fix needs an RFC or rewrite-slice issue
- Merge only after `npm run check` is green

## Review Standard

- Primary review focus: bugs, regressions, boundary violations, missing verification
- PRs must include risk, test evidence, and rollback notes
- Legacy code may be patched for critical fixes, but new feature work should move toward the target architecture rather than deepening current monoliths
