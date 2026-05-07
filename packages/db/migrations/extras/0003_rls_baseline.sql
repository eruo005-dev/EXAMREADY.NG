-- ===================================================================
-- 0003_rls_baseline.sql — enable RLS, install deny-all policies.
-- ===================================================================
-- RLS is defense-in-depth. Our API uses the service-role connection
-- (BYPASSRLS) so policies don't constrain it. The only callers that
-- DO traverse RLS are Supabase Realtime channels and any direct frontend
-- queries via the anon key — both must be granted access via specific
-- policies added in later migrations (e.g. leaderboard read access).
--
-- Local dev: superuser bypasses RLS automatically; this script is
-- effectively a no-op locally but the policies are still created so
-- CI integration tests (which connect as the `authenticated` role) catch
-- regressions.
-- ===================================================================

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'users',
    'target_exams',
    'exams',
    'subjects',
    'topics',
    'questions',
    'options',
    'attempts',
    'attempt_answers',
    'bookmarks',
    'subscriptions',
    'payments',
    'notification_log',
    'ad_impressions',
    'study_groups',
    'study_group_members',
    'ready_points_log',
    'referrals'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', tbl);
  END LOOP;
END $$;

-- Reference catalog tables (exams, subjects, topics) are public-readable.
-- Their content is the same for every visitor and unauthenticated marketing
-- pages render exam lists.
--
-- Note: CREATE POLICY IF NOT EXISTS is PG 17+. We use DROP IF EXISTS first
-- to keep this idempotent across the broader Postgres versions Supabase
-- supports (currently 15-17). The migration runner's _extras_applied table
-- normally prevents re-runs, so the DROP-then-CREATE only fires once per env.
DROP POLICY IF EXISTS "exams_public_read" ON public.exams;
CREATE POLICY "exams_public_read" ON public.exams
  FOR SELECT TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "subjects_public_read" ON public.subjects;
CREATE POLICY "subjects_public_read" ON public.subjects
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "topics_public_read" ON public.topics;
CREATE POLICY "topics_public_read" ON public.topics
  FOR SELECT TO anon, authenticated USING (true);
