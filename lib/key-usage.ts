import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

// Limite indicativo do plano gratuito do Gemini TTS (req/dia por chave).
export const FREE_TIER_REQ_PER_KEY = 10;

const COMMUNITY_KEYS_FILE = path.join(process.cwd(), 'dados', 'community_keys.json');
const USAGE_FILE = path.join(process.cwd(), 'dados', 'key_usage.json');

type Usage = { day: string; used: Record<string, number>; exhausted: Record<string, true> };

// A cota diária do Google zera à meia-noite do Pacífico.
function currentDay(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

export function keyId(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 12);
}

export function getEnvKeys(): string[] {
  const multi = process.env.GEMINI_API_KEYS;
  if (multi) return multi.split(',').map(k => k.trim()).filter(Boolean);
  const single = process.env.GEMINI_API_KEY;
  if (single && single !== 'COLE_SUA_CHAVE_AQUI') return [single];
  return [];
}

export async function getCommunityKeys(): Promise<string[]> {
  try {
    const keys: { key: string }[] = JSON.parse(await fs.readFile(COMMUNITY_KEYS_FILE, 'utf-8'));
    return keys.map(k => k.key).filter(Boolean);
  } catch {
    return [];
  }
}

export async function getAllKeys(): Promise<string[]> {
  return [...new Set([...getEnvKeys(), ...(await getCommunityKeys())])];
}

async function loadUsage(): Promise<Usage> {
  const day = currentDay();
  try {
    const u: Usage = JSON.parse(await fs.readFile(USAGE_FILE, 'utf-8'));
    if (u.day === day) return { day, used: u.used || {}, exhausted: u.exhausted || {} };
  } catch {}
  return { day, used: {}, exhausted: {} };
}

// Serializa as escritas para não perder contagens em requisições simultâneas.
let queue: Promise<unknown> = Promise.resolve();
function mutate(fn: (u: Usage) => void): Promise<void> {
  const run = queue.then(async () => {
    const u = await loadUsage();
    fn(u);
    try { await fs.writeFile(USAGE_FILE, JSON.stringify(u, null, 2)); } catch {}
  });
  queue = run.catch(() => {});
  return run;
}

export const recordUse = (key: string) =>
  mutate(u => { const id = keyId(key); u.used[id] = (u.used[id] || 0) + 1; });
export const markExhausted = (key: string) =>
  mutate(u => { u.exhausted[keyId(key)] = true; });

export async function isExhausted(key: string): Promise<boolean> {
  const u = await loadUsage();
  return !!u.exhausted[keyId(key)];
}

export async function getStatus() {
  const keys = await getAllKeys();
  const u = await loadUsage();
  let remaining = 0;
  let active = 0;
  for (const k of keys) {
    const id = keyId(k);
    if (u.exhausted[id]) continue;
    active++;
    remaining += Math.max(0, FREE_TIER_REQ_PER_KEY - (u.used[id] || 0));
  }
  return {
    totalKeys: keys.length,
    activeKeys: active,
    exhaustedKeys: keys.length - active,
    remaining,
    capacity: keys.length * FREE_TIER_REQ_PER_KEY,
  };
}
