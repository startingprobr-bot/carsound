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

// GET: return count of community keys (not the keys themselves)
export async function GET() {
  const keys = await loadKeys();
  return NextResponse.json({ count: keys.length });
}

// POST: add a new community API key
export async function POST(request: NextRequest) {
  try {
    const { key } = await request.json();

    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'Chave inválida' }, { status: 400 });
    }

    // Basic validation: Gemini API keys start with "AIza" and are ~39 chars
    const trimmed = key.trim();
    if (!trimmed.startsWith('AIza') || trimmed.length < 30) {
      return NextResponse.json({ error: 'Formato de chave inválido. A chave deve começar com "AIza..."' }, { status: 400 });
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
