/**
 * Server-side helpers for app_settings — the ops-controllable runtime flags
 * table. Cached per-request via React's cache() so multiple components in
 * the same render don't all hit the DB.
 *
 * Use sparingly: this isn't a CMS. As of Sprint 1 the only key is
 * `ads_enabled` for the AdSense kill switch.
 */
import { appSettings } from '@examready/db/schema';
import { cache } from 'react';

import { db } from '../db';

export const SETTING_KEYS = {
  adsEnabled: 'ads_enabled',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

/**
 * Read all settings as a key→value map. Returns sensible defaults for any
 * unset keys so callers don't need to special-case missing rows.
 */
export const getAllSettings = cache(async (): Promise<Record<string, unknown>> => {
  const rows = await db
    .select({ key: appSettings.key, value: appSettings.value })
    .from(appSettings);
  const map: Record<string, unknown> = {
    [SETTING_KEYS.adsEnabled]: true,
  };
  for (const r of rows) map[r.key] = r.value;
  return map;
});

export async function getAdsEnabled(): Promise<boolean> {
  const all = await getAllSettings();
  const v = all[SETTING_KEYS.adsEnabled];
  // Default true: ads on unless explicitly disabled.
  return v === undefined ? true : v === true;
}

export async function setSetting(
  key: string,
  value: unknown,
  updatedByUserId?: string,
): Promise<void> {
  await db
    .insert(appSettings)
    .values({
      key,
      value: value as never,
      updatedAt: new Date(),
      updatedByUserId: updatedByUserId ?? null,
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value: value as never,
        updatedAt: new Date(),
        updatedByUserId: updatedByUserId ?? null,
      },
    });
}
