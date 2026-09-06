/**
 * Shared cloud connection used by the desktop build. Login, signup and sync all
 * go through this single client so the app has exactly one online identity.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const CLOUD_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const CLOUD_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const hasCloudConfig = Boolean(CLOUD_URL && CLOUD_KEY);

let cloud: SupabaseClient | null = null;

export function getCloudClient(): SupabaseClient | null {
  if (!hasCloudConfig) return null;
  if (!cloud) {
    cloud = createClient(CLOUD_URL as string, CLOUD_KEY as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'kinair-desktop-auth',
      },
    });
  }
  return cloud;
}
