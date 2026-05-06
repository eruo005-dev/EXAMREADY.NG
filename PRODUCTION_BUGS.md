# Production Bugs

Append-only log of issues found in production after launch. Populated during and after the §3 launch-checklist verification — empty until the platform sees real users.

> Newer entries on top. Each entry stays even after fix — the fix and the date go in the **Resolution** section so the row remains a self-contained postmortem.

## Entry template

```
## YYYY-MM-DD — <one-line summary>

**Severity:** P0 / P1 / P2
**Surface:** <route / component / job>
**Reported by:** <admin / user / Sentry / synthetic monitor>

### Symptom
<what was visible to the user>

### Root cause
<what was actually broken>

### Resolution
<commit SHA, env-var change, or vendor action that fixed it> — <date>

### Prevention
<test added / check added / nothing — and why>
```

---

_(Empty — to be populated as production issues surface post-launch.)_
