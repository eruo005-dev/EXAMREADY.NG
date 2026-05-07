-- ===================================================================
-- 0004_rls_extend_sprint6.sql — enable RLS on tables added in Sprints 4-6.
-- ===================================================================
-- Sprint 6 audit found that tables added after the Sprint 0 RLS baseline
-- (study_plans, ai_usage_log, ai_feedback, app_settings, exam_waitlist,
-- consent_log, bulk_generation_jobs, theory_attempts) were missing
-- ENABLE ROW LEVEL SECURITY. The API uses BYPASSRLS via the service-role
-- connection so this isn't exploitable today, but defense-in-depth says
-- every public.* table should have RLS on regardless.
--
-- This migration extends the Sprint 0 baseline. New tables added in
-- future sprints should be added to this list.
-- ===================================================================

DO $$
DECLARE
  tbl text;
  -- Tables added in Sprints 1-6 that aren't in 0003_rls_baseline.sql.
  -- Tables prefixed with `_` indicate "may not exist yet in this env" —
  -- the IF EXISTS check below handles that.
  tables text[] := ARRAY[
    -- Sprint 4
    'study_plans',
    'ai_usage_log',
    'ai_feedback',
    -- Sprint 0/1 misses
    'app_settings',
    'exam_waitlist',
    'consent_log',
    'target_exams',
    -- Sprint 6 additions (created later in this sprint)
    'bulk_generation_jobs',
    'theory_attempts'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', tbl);
    END IF;
  END LOOP;
END $$;

-- exam_waitlist is public-INSERTable so the marketing /coming-soon page
-- can collect signups without authentication. We allow INSERT but not
-- SELECT/UPDATE/DELETE for anon — admin reads via service-role.
-- (DROP-IF-EXISTS first because CREATE POLICY IF NOT EXISTS is PG 17+ only.)
DROP POLICY IF EXISTS "exam_waitlist_public_insert" ON public.exam_waitlist;
CREATE POLICY "exam_waitlist_public_insert" ON public.exam_waitlist
  FOR INSERT TO anon, authenticated WITH CHECK (true);
