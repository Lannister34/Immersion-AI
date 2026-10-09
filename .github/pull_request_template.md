## Summary

- What changed and why?

## Problem

- Link the issue, bug report, or rewrite slice.
- Describe the user or system impact.

## Ownership

- Source of truth:
- Owner module(s):
- Why this change belongs at this boundary:

## Scope

- In scope:
- Out of scope:

## Reuse / Refactor

- Existing logic reviewed for reuse:
- What was extracted, consolidated, or deliberately not refactored:
- Why layering more code was avoided:

## Verification

- [ ] `npm run check`
- [ ] Manual verification documented below
- [ ] Migration and compatibility impact checked

## Engineering Checks

- [ ] No server-owned durable state was introduced in a frontend store or ad hoc cache
- [ ] Business rules live in one owner module and are not duplicated across layers
- [ ] Repeated or adjacent logic was refactored or extracted instead of copied
- [ ] Reload, refresh, and external file mutation behavior were considered
- [ ] Regression coverage was added for the touched invariant, or the gap is explained below

## Manual Checks

- [ ] Happy path
- [ ] Regression path
- [ ] Failure path

## Architecture

- ADR:
- Source of truth impact:
- Boundary impact:
- Migration or rollback notes:

## Risks

- Primary risk:
- Follow-up work:

## Screenshots / Logs / Examples

Add UI screenshots, terminal output, or API examples if behavior changed.
