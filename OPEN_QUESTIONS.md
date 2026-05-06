# Open Questions / Blockers

A running log of items that the autonomous Sprint 1 build couldn't resolve without explicit user input or credentials.

## Sprint 1 — Verified build setup notes

No version pin changes required. The original `package.json` versions installed cleanly:

- `@types/node@^20.16.5` was added to `packages/notifications` so its provider files (which use `process.env`, `fetch`, `Response`) typecheck. This was an oversight in the Sprint 0 manifest, not a version conflict.

## Sprint 1 — Decisions deferred

(none yet)

## Sprint 6 — Deferred UI work

These backends shipped this sprint but the admin UI is minimal. Build out
when there's a concrete reviewer workflow they need to support:

- **`/admin/bulk-generation-jobs` monitor page** — `GET /api/admin/bulk-generation-jobs`
  exists and returns progress percent. The admin can hit the endpoint
  directly, but a polling table page with progress bars and per-job notes
  would help during the 550-question content seed run.
- **`/admin/waitlist` page** — `GET /api/admin/waitlist` returns groups +
  recent signups. CSV export needs ~30 lines of client code.
- **Moderation queue filters** (3.6) — bulk-approve, filter by subject /
  difficulty / generated_by_model, "show only theory questions". The
  `approvedBy` + `approvedAt` columns are now in schema; the queue page
  needs to write them on approve and surface the filters.
- **100-signup waitlist email trigger** (3.7) — needs a cron job that
  polls `bulk_generation_jobs` daily and Resends the operator when any
  exam crosses 100 signups. Defer until at least one coming-soon exam
  approaches the threshold (no point adding plumbing for an event that
  won't fire for weeks).

## Sprint 6 — Audit follow-throughs

See AUDIT_REPORT.md for severity. Two action items not completed in code:

- **Apply migration 0004_rls_extend_sprint6.sql** (M-1 fix) — needs
  `pnpm db:migrate` against staging + production. The schema rows are
  in repo; nothing about the application breaks if it's not applied;
  but RLS won't engage on the Sprint 4-6 tables until it is.
- **Promote staging admin via app_metadata** — the new admin gate reads
  `app_metadata.role`, NOT `user_metadata.role`. To make a user admin
  on staging:
  ```bash
  curl -X PUT https://<project-ref>.supabase.co/auth/v1/admin/users/<user-id> \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d '{"app_metadata":{"role":"admin"}}'
  ```
  Or use `supabase.auth.admin.updateUserById(id, { app_metadata: { role: 'admin' } })`
  from a server-only script with the service-role key.
