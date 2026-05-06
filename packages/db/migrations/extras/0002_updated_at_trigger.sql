-- ===================================================================
-- 0002_updated_at_trigger.sql — auto-bump updated_at on every UPDATE.
-- ===================================================================
-- Single trigger function reused on every table that has updated_at.
-- Adding a new table with updated_at? Add a CREATE TRIGGER for it here.
-- ===================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

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
    'subscriptions',
    'study_groups'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_updated_at_trg ON public.%I;', tbl
    );
    EXECUTE format(
      'CREATE TRIGGER set_updated_at_trg
         BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
      tbl
    );
  END LOOP;
END $$;
