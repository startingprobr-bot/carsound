import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const EFFECTS_DIR = path.join(process.cwd(), 'dados', 'effects');
const ALLOWED_EXTENSIONS = /\.(mp3|wav|ogg|m4a|webm|aac|flac|opus)$/i;

async function ensureDir() {
  try {
    await fs.mkdir(EFFECTS_DIR, { recursive: true });
  } catch {}
}

// GET: list all saved custom effects
export async function GET() {
  await ensureDir();
  try {
    const files = await fs.readdir(EFFECTS_DIR);
    const effects = files
      .filter((f) => ALLOWED_EXTENSIONS.test(f))
      .map((f) => ({
        id: `custom:${f}`,
        name: f.replace(/\.[^/.]+$/, ''),
        filename: f,
        url: `/api/effects/${encodeURIComponent(f)}`,
      }));
    return NextResponse.json(effects);
  } catch {
    return NextResponse.json([]);
  }
}

// POST: upload a custom effect
export async function POST(request: NextRequest) {
  await ensureDir();
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._\-\s]/g, '').replace(/\s+/g, '_');
    if (!safeName || safeName.length > 200) {
      return NextResponse.json({ error: 'Nome de arquivo invalido' }, { status: 400 });
    }

    if (!ALLOWED_EXTENSIONS.test(safeName)) {
      return NextResponse.json({ error: 'Formato nao suportado. Use MP3, WAV, OGG, M4A, WEBM, AAC, FLAC ou OPUS.' }, { status: 400 });
    }

    // Max 20MB
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'Arquivo muito grande (max 20MB)' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = path.join(EFFECTS_DIR, safeName);

    if (!filePath.startsWith(EFFECTS_DIR)) {
      return NextResponse.json({ error: 'Caminho invalido' }, { status: 400 });
    }

    await fs.writeFile(filePath, buffer);

    return NextResponse.json({
      success: true,
      id: `custom:${safeName}`,
      name: safeName.replace(/\.[^/.]+$/, ''),
      filename: safeName,
      url: `/api/effects/${encodeURIComponent(safeName)}`,
    });
  } catch (error) {
    console.error('Effects upload error:', error);
    return NextResponse.json({ error: 'Erro ao salvar efeito' }, { status: 500 });
  }
}

// DELETE: remove an effect file
export async function DELETE(request: NextRequest) {
  await ensureDir();
  const { name } = await request.json();
  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'Nome invalido' }, { status: 400 });
  }
  const safeName = path.basename(name);
  const filePath = path.join(EFFECTS_DIR, safeName);

  if (!filePath.startsWith(EFFECTS_DIR)) {
    return NextResponse.json({ error: 'Caminho invalido' }, { status: 400 });
  }

  try {
    await fs.unlink(filePath);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Arquivo nao encontrado' }, { status: 404 });
  }
}
