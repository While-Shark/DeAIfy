import { resolve } from 'node:path';

const normalize = (value: string) => value.replace(/\\/g, '/');

/** Keep source-module chunk selection conservative to avoid breaking third-party packages. */
export function shouldProtectChunk(
  modules: Record<string, unknown>,
  projectRoot: string,
): boolean {
  const appRoot = normalize(resolve(projectRoot, 'src')) + '/';
  const ids = Object.keys(modules).map(normalize);
  const hasOwnSource = ids.some(id => id.startsWith(appRoot));
  const hasVendorCode = ids.some(id => id.includes('/node_modules/'));
  return hasOwnSource && !hasVendorCode;
}

/** Vite client env variables are always public; fail builds that misname backend secrets. */
export function assertNoPrivateViteEnv(env: Record<string, string | undefined>): void {
  for (const key of Object.keys(env)) {
    if (!key.startsWith('VITE_') || key === 'VITE_TURNSTILE_SITE_KEY') continue;
    if (/SECRET|PASSWORD|TOKEN|PRIVATE|APPSECRET|MERCHANT|MYSQL|XUNHU|SMTP|OTP|ENCRYPTION|PROCESSOR/i.test(key)) {
      throw new Error('Unsafe public build environment variable: ' + key +
        '. Store merchant, database and encryption secrets only on the VPS.');
    }
  }
}

/** Keep vendor chunks unmodified, particularly Vue and C2PA dependencies. */
export function isolateVendorChunk(id: string): string | undefined {
  if (!normalize(id).includes('/node_modules/')) return undefined;
  return normalize(id).includes('/@contentauth/') ? 'vendor-provenance' : 'vendor-runtime';
}
