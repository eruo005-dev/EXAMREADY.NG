-- ===================================================================
-- 0001_auth_link.sql — link public.users to auth.users (Supabase managed)
-- ===================================================================
-- Adds the FK constraint that Drizzle cannot declare (auth schema is
-- outside Drizzle's scope) and installs the trigger that creates a
-- public.users row whenever GoTrue inserts into auth.users.
--
-- Idempotency: every statement uses IF EXISTS / IF NOT EXISTS or
-- CREATE OR REPLACE so re-running is safe.
-- ===================================================================

-- 1. FK constraint: public.users.id -> auth.users.id, cascading delete.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_id_fk_auth'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_id_fk_auth
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 2. Trigger function — when GoTrue inserts into auth.users, mirror the row
--    into public.users with a generated referral code. Onboarding wizard
--    fills in the rest of the columns later via PATCH /api/me/onboarding.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  generated_code text;
BEGIN
  -- 10-char alphanumeric referral code, retry on (extremely unlikely) collision.
  LOOP
    generated_code := upper(substr(md5(gen_random_uuid()::text), 1, 10));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.users WHERE referral_code = generated_code
    );
  END LOOP;

  INSERT INTO public.users (id, phone, email, referral_code, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.phone, ''),
    NEW.email,
    generated_code,
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
