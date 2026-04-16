import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const MUSIC_DIR = path.join(process.cwd(), 'dados', 'musicas');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const safeName = path.basename(decodeURIComponent(filename));
  const filePath = path.join(MUSIC_DIR, safeName);

  if (!filePath.startsWith(MUSIC_DIR)) {
    return NextResponse.json({ error: 'Não permitido' }, { status: 403 });
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(safeName).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',
      '.webm': 'audio/webm',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    return new NextResponse(data, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': data.length.toString(),
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
  }
}
