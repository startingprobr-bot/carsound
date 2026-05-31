import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const KEYS_FILE = path.join(process.cwd(), 'dados', 'community_keys.json');

interface CommunityKey {
  key: string;
  addedAt: number;
}

async function loadKeys(): Promise<CommunityKey[]> {
  try {
    const data = await fs.readFile(KEYS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function countEnvKeys(): number {
  const multi = process.env.GEMINI_API_KEYS;
  if (multi) {
    return multi.split(',').map(k => k.trim()).filter(Boolean).length;
  }
  const single = process.env.GEMINI_API_KEY;
  if (single && single !== 'COLE_SUA_CHAVE_AQUI') return 1;
  return 0;
}

// GET: return key counts (community + env), without exposing the keys themselves
export async function GET() {
  const keys = await loadKeys();
  const envCount = countEnvKeys();
  const community = keys.length;
  return NextResponse.json({
    count: community + envCount, // compat: total de chaves
    community,
    env: envCount,
  });
}

// POST: add a new community API key
export async function POST(request: NextRequest) {
  try {
    const { key } = await request.json();

    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'Chave inválida' }, { status: 400 });
    }

    // Basic validation: aceita formato antigo (AIza...) e novo (AQ....) do Google AI Studio
    const trimmed = key.trim();
    const isValid = (trimmed.startsWith('AIza') || trimmed.startsWith('AQ.')) && trimmed.length >= 30;
    if (!isValid) {
      return NextResponse.json({ error: 'Formato de chave inválido. A chave deve começar com "AIza..." ou "AQ..."' }, { status: 400 });
    }

    const keys = await loadKeys();

    // Check if key already exists
    if (keys.some(k => k.key === trimmed)) {
      return NextResponse.json({ error: 'Esta chave já foi adicionada' }, { status: 409 });
    }

    keys.push({ key: trimmed, addedAt: Date.now() });
    await fs.writeFile(KEYS_FILE, JSON.stringify(keys, null, 2));

    return NextResponse.json({ success: true, count: keys.length });
  } catch {
    return NextResponse.json({ error: 'Erro ao salvar chave' }, { status: 500 });
  }
}
