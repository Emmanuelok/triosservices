import { database } from './postgres-db';
import { privateStorage } from './private-storage';

export type Readiness = {
  status: 'ready' | 'setup_required' | 'unavailable';
  bookingAvailable: boolean;
  accountsAvailable: boolean;
  photosAvailable: boolean;
  checkedAt: string;
};

export function connectionConfiguration() {
  function validOrigin(value?: string) {
    if (!value) return false;
    try {
      const url = new URL(value);
      return (url.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/';
    } catch { return false; }
  }
  return {
    auth: validOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()),
    database: Boolean(process.env.DATABASE_URL),
    storage: validOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    owner: Boolean(process.env.OWNER_EMAILS?.split(',').some(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))),
    origin: validOrigin(process.env.SITE_ORIGIN),
    ai: Boolean(process.env.OPENAI_API_KEY),
  };
}

let lastProbe: { at: number; database: boolean; schema: boolean } | undefined;
let probing: Promise<{ database: boolean; schema: boolean }> | undefined;
async function probe() {
  if (lastProbe && Date.now() - lastProbe.at < 15000) return lastProbe;
  if (!probing) probing = (async () => {
    try {
      const row = await database.prepare("SELECT to_regclass('trios.requests') IS NOT NULL AND to_regclass('trios.service_changes') IS NOT NULL AS schema_ready").first();
      const value = { at: Date.now(), database: true, schema: Boolean(row?.schema_ready) };
      lastProbe = value;
      return value;
    } catch {
      const value = { at: Date.now(), database: false, schema: false };
      lastProbe = value;
      return value;
    } finally { probing = undefined; }
  })();
  return probing;
}

export async function readinessDetails() {
  const configured = connectionConfiguration();
  const connected = configured.database ? await probe() : { database: false, schema: false };
  const available = configured.auth && configured.owner && configured.origin && connected.database && connected.schema;
  const storage = available && configured.storage ? await privateStorage.available().catch(() => false) : false;
  const readiness: Readiness = {
    status: available ? 'ready' : configured.database && !connected.database ? 'unavailable' : 'setup_required',
    bookingAvailable: available,
    accountsAvailable: available,
    photosAvailable: storage,
    checkedAt: new Date().toISOString(),
  };
  return { ...readiness, configured, connected: { ...connected, storage } };
}
