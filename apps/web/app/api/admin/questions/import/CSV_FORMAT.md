# Question Bulk Import — CSV Format

`POST /api/admin/questions/import` accepts a UTF-8 CSV file via `multipart/form-data` with the field name `file`. Cap: 1000 rows, 5 MB.

## Required columns

| Column | Description |
|---|---|
| `exam_slug` | One of the seeded exam slugs (e.g. `jamb-utme`, `waec-ssce`). Must already exist. |
| `subject_slug` | Subject slug under the exam (e.g. `mathematics`, `english-language`). |
| `topic_slug` | Topic slug under the subject (e.g. `algebra`, `comprehension`). |
| `difficulty` | Integer 1–5. |
| `stem` | The question text (the prompt). |
| `explanation` | The full explanation, 3–5 sentences minimum. |
| `option_a` | First answer choice. |
| `option_b` | Second answer choice. |
| `correct_option` | Comma-separated list of correct labels (e.g. `A` or `A,C` for multi-select). |

## Optional columns

| Column | Description |
|---|---|
| `option_c`, `option_d`, `option_e` | Additional choices (up to 5 total). |
| `passage` | Comprehension passage; presence triggers `question_type = 'comprehension'`. |
| `year` | Exam year (e.g. `2023`). |
| `source` | Free-form source label (e.g. `JAMB 2023 Paper 1`). |

## Question type detection

- `correct_option` has a single label → `mcq_single`
- `correct_option` has multiple labels → `mcq_multi`
- `passage` is non-empty → `comprehension` (overrides single)

For other types (theory, fill-blank, diagram), use the create-one endpoint instead — they have richer structure than CSV cleanly handles.

## Response

```json
{
  "ok": true,
  "data": {
    "inserted": 47,
    "errors": [
      { "row": 12, "message": "Unknown topic_slug: quantum_physics" },
      { "row": 18, "message": "correct_option references missing option: D" }
    ]
  }
}
```

`row` is 1-based, counting from row 1 = header. Row 2 is the first data row.

## Format notes

- Use UTF-8 encoding. Excel "Save As CSV" may default to Windows-1252; use "CSV UTF-8" instead.
- Wrap fields containing commas, quotes, or newlines in double quotes. Escape internal quotes by doubling them: `"He said ""hello"""`.
- Empty cells are treated as missing/optional. Don't write `null` or `none`.
- Re-running the same CSV inserts duplicates — there's no dedupe by stem in import. Hand-edit before retry.
