/**
 * Single entry point for data access.
 *
 * - In the browser / hosted app this is the normal cloud client.
 * - In the packaged desktop app it is the offline client backed by a local
 *   database, which syncs with the cloud whenever internet is available.
 */
import { supabase as cloudClient } from '@/integrations/supabase/client';
import { localClient } from '@/lib/offline/localClient';
import { isOfflineMode } from '@/lib/offline/mode';

export const supabase = (isOfflineMode ? localClient : cloudClient) as typeof cloudClient;

export { isOfflineMode };
