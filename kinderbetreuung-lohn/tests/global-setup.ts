import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { getStackInfo } from './helpers/supabase';

async function isStackUp(): Promise<boolean> {
  try {
    const res = await fetch('http://127.0.0.1:54321/auth/v1/health', { signal: AbortSignal.timeout(2_000) });
    return res.ok;
  } catch {
    return false;
  }
}

function run(cmd: string, opts: { cwd?: string; env?: Record<string, string> } = {}): void {
  execSync(cmd, {
    stdio: 'inherit',
    cwd: opts.cwd,
    env: opts.env ? { ...process.env, ...opts.env } : process.env
  });
}

export default async function globalSetup(): Promise<void> {
  const subfolder = process.cwd();           // .../kinderbetreuung-lohn
  const repoRoot = resolve(subfolder, '..'); // .../experiments

  if (!(await isStackUp())) {
    console.log('[global-setup] Local Supabase stack not running — starting it (may take ~2 min on cold start).');
    run('supabase start', { cwd: subfolder });
  } else {
    console.log('[global-setup] Local Supabase stack already running.');
  }

  console.log('[global-setup] Resetting local DB…');
  run('supabase db reset --local --no-seed', { cwd: subfolder });

  const stack = getStackInfo();

  console.log('[global-setup] Building static site with local-stack config…');
  run('bash build.sh kinderbetreuung-lohn', {
    cwd: repoRoot,
    env: {
      SUPABASE_URL: stack.url,
      SUPABASE_PUBLISHABLE_KEY: stack.anonKey
    }
  });

  // Make stack info available to test files via env.
  process.env.LOCAL_SUPABASE_URL = stack.url;
  process.env.LOCAL_ANON_KEY = stack.anonKey;
  process.env.LOCAL_SERVICE_ROLE_KEY = stack.serviceRoleKey;
  process.env.LOCAL_INBUCKET_URL = stack.inbucketUrl;
}
