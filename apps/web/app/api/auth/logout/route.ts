import { defineRoute, ok } from '@/lib/api/handler';
import { createServerClient } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({ auth: 'user' })(async () => {
  const supabase = createServerClient();
  await supabase.auth.signOut();
  return ok({ loggedOut: true });
});
