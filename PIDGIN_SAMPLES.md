# Pidgin Quality Samples

Hand-curated AI-output samples used to verify the Pidgin moat. Populated during the §4 launch-checklist task — empty until that runs against the production endpoint with a real Anthropic key.

> Source endpoint: `POST /api/ai/explain-differently` with `level: 'in-pidgin'`, model `claude-haiku-4-5-20251001` (per `AI_MODELS` in `apps/web/lib/ai/client.ts`).

## Acceptance criteria

Each sample is hand-rated 1–5 across four axes. The suite passes if **average across all axes ≥ 4** and **no single sample scores ≤ 2 on any axis**.

| Axis                        | What to check                                                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Authenticity**            | Authentic Nigerian Pidgin register. Markers like `make we`, `una`, `the answer na`, `wahala`, `fit` should appear naturally.       |
| **Clarity**                 | A junior-secondary student should follow the explanation without rereading.                                                        |
| **Tech-term preservation**  | "Quadratic", "denominator", "photosynthesis", etc. stay in English (so students recognise them on the actual exam).                |
| **Negative-marker absence** | No Jamaican Patois (`mi`, `nuh`, `dem`). No Yoruba/Igbo/Hausa words leaking in. No "Lemme explain" / "Lemme break it down" filler. |

If a sample scores ≤ 2 on the negative-marker axis, tighten the prompt at `apps/web/lib/ai/prompts/explain-differently.ts` and re-run the suite.

## Sample template

Copy the block below per question, fill it in.

```
### Sample N — <subject> · <topic>

**Question stem:** <verbatim>

**Pidgin output (verbatim):**

> <paste output>

**Scores:**
- Authenticity: _/5
- Clarity: _/5
- Tech-term preservation: _/5
- Negative-marker absence: _/5

**Notes:** <what worked, what didn't, any prompt tightening needed>
```

## Suite (15 questions)

Pick from the seeded question pool:

- 5 × Mathematics (mix: algebra, geometry, calculus)
- 5 × English (comprehension, lexis, grammar)
- 5 × Physics (mechanics, electricity, waves)

Capture all 15 outputs in one sitting so register comparisons are like-for-like.

---

_(Empty — to be populated during launch-checklist §4.)_
