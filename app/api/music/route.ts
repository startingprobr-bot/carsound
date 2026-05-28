import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const MUSIC_DIR = path.join(process.cwd(), 'dados', 'musicas');
const ALLOWED_EXTENSIONS = /\.(mp3|wav|ogg|m4a|webm|aac|flac|opus)$/i;

async function ensureDir() {
  try {
    await fs.mkdir(MUSIC_DIR, { recursive: true });
  } catch {}
}

// GET: list all saved bg musics
export async function GET() {
  await ensureDir();
  try {
    const files = await fs.readdir(MUSIC_DIR);
    const musics = files
      .filter(f => ALLOWED_EXTENSIONS.test(f))
      .map(f => ({
        name: f,
        url: `/api/music/${encodeURIComponent(f)}`,
      }));
    return NextResponse.json(musics);
  } catch {
    return NextResponse.json([]);
  }
}

// POST: upload a new bg music
export async function POST(request: NextRequest) {
  await ensureDir();
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    // Sanitize filename
    const safeName = file.name.replace(/[^a-zA-Z0-9._\-\s]/g, '').replace(/\s+/g, '_');
    if (!safeName || safeName.length > 200) {
      return NextResponse.json({ error: 'Nome de arquivo inválido' }, { status: 400 });
    }

    if (!ALLOWED_EXTENSIONS.test(safeName)) {
      return NextResponse.json({ error: 'Formato não suportado. Use MP3, WAV, OGG, M4A, WEBM, AAC, FLAC ou OPUS.' }, { status: 400 });
    }

    // Max 20MB
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'Arquivo muito grande (máx 20MB)' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = path.join(MUSIC_DIR, safeName);

    // Prevent path traversal
    if (!filePath.startsWith(MUSIC_DIR)) {
      return NextResponse.json({ error: 'Caminho inválido' }, { status: 400 });
    }

    await fs.writeFile(filePath, buffer);

    return NextResponse.json({
      success: true,
      name: safeName,
      url: `/api/music/${encodeURIComponent(safeName)}`,
    });
  } catch (error: unknown) {
    console.error('Music upload error:', error);
    const message = error instanceof Error ? error.message : 'Falha desconhecida';
    return NextResponse.json({ error: `Erro ao salvar música: ${message}` }, { status: 500 });
  }
}

// DELETE: remove a music file
export async function DELETE(request: NextRequest) {
  await ensureDir();
  const { name } = await request.json();
  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'Nome inválido' }, { status: 400 });
  }
  const safeName = path.basename(name);
  const filePath = path.join(MUSIC_DIR, safeName);

  if (!filePath.startsWith(MUSIC_DIR)) {
    return NextResponse.json({ error: 'Caminho inválido' }, { status: 400 });
  }

  try {
    await fs.unlink(filePath);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
  }
}
