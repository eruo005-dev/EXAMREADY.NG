/**
 * GET  /api/admin/settings  — all app_settings as a key/value map (with defaults)
 * PUT  /api/admin/settings  — set one key (body: { key, value })
 */
import { z } from 'zod';

import { getAllSettings, setSetting } from '@/lib/admin/settings';
import { defineRoute, ok } from '@/lib/api/handler';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ auth: 'admin' })(async () => {
  const settings = await getAllSettings();
  return ok({ settings });
});

const setSettingInputSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.unknown(),
});

export const PUT = defineRoute({
  auth: 'admin',
  bodySchema: setSettingInputSchema,
})(async ({ parsed, user }) => {
  await setSetting(parsed.key, parsed.value, user?.profile.id);
  return ok({ updated: true, key: parsed.key });
});
