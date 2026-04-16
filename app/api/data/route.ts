import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const DADOS_DIR = path.join(process.cwd(), 'dados');

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type'); // 'history' or 'playlists'

  if (!type || !['history', 'playlists', 'keywords', 'templates'].includes(type)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  const filePath = path.join(DADOS_DIR, `${type}.json`);
  
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return NextResponse.json(JSON.parse(data));
  } catch (error) {
    return NextResponse.json([]);
  }
}

export async function POST(request: Request) {
  const { type, data } = await request.json();

  if (!type || !['history', 'playlists', 'keywords', 'templates'].includes(type)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  const filePath = path.join(DADOS_DIR, `${type}.json`);

  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save data' }, { status: 500 });
  }
}
