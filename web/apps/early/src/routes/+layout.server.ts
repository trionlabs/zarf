import type { LayoutServerLoad } from './$types';
import { resolveGateMode } from '$lib/server/gate';

export const load: LayoutServerLoad = async ({ platform }) => {
  const env = platform?.env;
  return {
    gateMode: resolveGateMode(env),
    brand: { name: env?.BRAND_NAME ?? 'Brand', handle: env?.BRAND_HANDLE ?? '' }
  };
};
