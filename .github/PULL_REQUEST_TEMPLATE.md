<!--
  Thanks for opening a PR. Please fill in the sections below — keep it
  brief but specific. Empty PR descriptions get bounced back.
-->

## What changed

<!-- One or two sentences. What does this PR do? -->

## Why

<!-- What problem does it solve? Link the GitHub issue if there is one. -->

## Tests added

- [ ] Unit tests
- [ ] Integration tests (DB-backed)
- [ ] Manual smoke test (describe what you tested below)
- [ ] N/A — no behaviour change

<!-- If you ticked any test box, list the tests here. -->

## Screenshots / video

<!--
  For any UI change, attach a before-and-after screenshot at mobile width
  (360px). For interactive flows, a 10-second video is best.
-->

## Migration safety

<!-- Only fill in if this PR includes a packages/db schema change. -->

- [ ] Migration is additive (new columns nullable or defaulted, new tables)
- [ ] Migration is destructive — list affected rows / data movement plan below
- [ ] No schema change

## Checklist

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm build` passes
- [ ] Conventional commit message (`feat:`, `fix:`, `chore:`, etc.)
- [ ] Updated relevant docs (README / CSV_FORMAT / route comments)
- [ ] No secrets committed (`git diff --cached | grep -E '(KEY|TOKEN|SECRET|password)'`)
