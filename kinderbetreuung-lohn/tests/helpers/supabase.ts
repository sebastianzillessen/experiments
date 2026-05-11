import { execSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

// Node 20 has no global WebSocket. supabase-js initialises the realtime
// transport eagerly even though our tests never open channels — so we wire
// in `ws` to satisfy that check. Remove once we move to Node 22+.
const realtimeOptions = { transport: WebSocket as unknown as typeof globalThis.WebSocket };

export type StackInfo = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  inbucketUrl: string;
};

let cached: StackInfo | null = null;

export function getStackInfo(): StackInfo {
  if (cached) return cached;

  const raw = execSync('supabase status --output json', { encoding: 'utf8' });
  const parsed = JSON.parse(raw);

  cached = {
    url: parsed.API_URL ?? 'http://127.0.0.1:54321',
    anonKey: parsed.ANON_KEY,
    serviceRoleKey: parsed.SERVICE_ROLE_KEY,
    inbucketUrl: parsed.INBUCKET_URL ?? 'http://127.0.0.1:54324'
  };

  if (!cached.anonKey || !cached.serviceRoleKey) {
    throw new Error('supabase status did not return ANON_KEY / SERVICE_ROLE_KEY — is the stack running?');
  }

  return cached;
}

export function adminClient(): SupabaseClient {
  const s = getStackInfo();
  return createClient(s.url, s.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: realtimeOptions
  });
}

export function anonClient(): SupabaseClient {
  const s = getStackInfo();
  return createClient(s.url, s.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: realtimeOptions
  });
}

export function clientForUser(accessToken: string, refreshToken: string): SupabaseClient {
  const s = getStackInfo();
  const c = createClient(s.url, s.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: realtimeOptions
  });
  c.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  return c;
}
