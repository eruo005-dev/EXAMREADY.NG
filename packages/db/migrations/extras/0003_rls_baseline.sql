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
CREATE POLICY IF NOT EXISTS "exams_public_read" ON public.exams
  FOR SELECT TO anon, authenticated USING (is_active = true);

CREATE POLICY IF NOT EXISTS "subjects_public_read" ON public.subjects
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY IF NOT EXISTS "topics_public_read" ON public.topics
  FOR SELECT TO anon, authenticated USING (true);
