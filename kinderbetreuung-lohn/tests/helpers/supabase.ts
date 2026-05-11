import { execSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export function anonClient(): SupabaseClient {
  const s = getStackInfo();
  return createClient(s.url, s.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export function clientForUser(accessToken: string, refreshToken: string): SupabaseClient {
  const s = getStackInfo();
  const c = createClient(s.url, s.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  c.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  return c;
}
