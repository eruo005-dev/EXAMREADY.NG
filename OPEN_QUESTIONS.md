# Open Questions / Blockers

A running log of items that the autonomous Sprint 1 build couldn't resolve without explicit user input or credentials.

## Sprint 1 — Verified build setup notes

No version pin changes required. The original `package.json` versions installed cleanly:
- `@types/node@^20.16.5` was added to `packages/notifications` so its provider files (which use `process.env`, `fetch`, `Response`) typecheck. This was an oversight in the Sprint 0 manifest, not a version conflict.

## Sprint 1 — Decisions deferred

(none yet)
