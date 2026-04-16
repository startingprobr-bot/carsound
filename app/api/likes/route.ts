import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const LIKES_FILE = path.join(process.cwd(), 'dados', 'likes.json');

async function loadLikes(): Promise<number> {
  try {
    const data = await fs.readFile(LIKES_FILE, 'utf-8');
    return JSON.parse(data).count || 0;
  } catch {
    return 0;
  }
}

// GET: return like count
export async function GET() {
  const count = await loadLikes();
  return NextResponse.json({ count });
}

// POST: increment like count
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const fingerprint = body.fp || 'unknown';
    
    // Read current data
    let data: { count: number; fingerprints?: string[] } = { count: 0, fingerprints: [] };
    try {
      const raw = await fs.readFile(LIKES_FILE, 'utf-8');
      data = JSON.parse(raw);
      if (!data.fingerprints) data.fingerprints = [];
    } catch {
      // file doesn't exist yet
    }

    // Check if already liked (simple fingerprint dedup)
    if (data.fingerprints && data.fingerprints.includes(fingerprint)) {
      return NextResponse.json({ count: data.count, alreadyLiked: true });
    }

    data.count = (data.count || 0) + 1;
    if (data.fingerprints) data.fingerprints.push(fingerprint);

    await fs.writeFile(LIKES_FILE, JSON.stringify(data, null, 2));
    return NextResponse.json({ count: data.count, alreadyLiked: false });
  } catch {
    return NextResponse.json({ error: 'Erro' }, { status: 500 });
  }
}
