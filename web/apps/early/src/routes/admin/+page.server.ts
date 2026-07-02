import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import {
  loadAllUsers,
  getWaitlistStats,
  loadAllEmailSignups,
  getEmailStats
} from '$lib/server/db';
import { resolveGateMode, gateAllowsEmail, gateAllowsX } from '$lib/server/gate';

export const load: PageServerLoad = async (event) => {
  const env = event.platform?.env;
  const db = env?.DB;
  if (!db) {
    throw error(500, 'platform bindings missing');
  }
  const gateMode = resolveGateMode(env);
  const showX = gateAllowsX(gateMode);
  const showEmail = gateAllowsEmail(gateMode);

  // Load both backends mode-aware: skip a table's queries when that gate is off
  // (its tables exist but are empty / irrelevant in that mode).
  const [users, stats, emailSignups, emailStats] = await Promise.all([
    showX ? loadAllUsers(db) : Promise.resolve([]),
    showX
      ? getWaitlistStats(db)
      : Promise.resolve({ total: 0, attested: 0, verified: 0, postVerified: 0, completed: 0 }),
    showEmail ? loadAllEmailSignups(db) : Promise.resolve([]),
    showEmail ? getEmailStats(db) : Promise.resolve({ total: 0, confirmed: 0 })
  ]);

  return {
    users,
    stats,
    emailSignups,
    emailStats,
    gateMode,
    brand: { name: env?.BRAND_NAME ?? 'Brand', handle: env?.BRAND_HANDLE ?? '' }
  };
};
