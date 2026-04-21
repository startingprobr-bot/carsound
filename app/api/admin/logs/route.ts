import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { verifyBasicAuthHeader } from '@/lib/admin-auth';

const ADMIN_LOGS_FILE = path.join(process.cwd(), 'dados', 'admin_logs.json');

type AdminLogEntry = {
  timestamp: string;
  text: string;
  voice: string;
  style: string;
  ip: string;
  city?: string;
  region?: string;
  country?: string;
  neighborhood?: string;
  locationQuery?: string;
  mapLink?: string;
};

export async function GET(request: NextRequest) {
  if (!(await verifyBasicAuthHeader(request.headers.get('authorization')))) {
    return new NextResponse('Nao autorizado', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="admin"' },
    });
  }

  try {
    const raw = await fs.readFile(ADMIN_LOGS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    const logs: AdminLogEntry[] = Array.isArray(parsed) ? parsed : [];
    return NextResponse.json({ logs });
  } catch {
    return NextResponse.json({ logs: [] });
  }
}
