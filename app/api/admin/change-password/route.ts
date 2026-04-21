import { NextRequest, NextResponse } from 'next/server';
import { changeAdminPassword, verifyBasicAuthHeader } from '@/lib/admin-auth';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!(await verifyBasicAuthHeader(authHeader))) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const currentPassword = String(body?.currentPassword || '');
    const newPassword = String(body?.newPassword || '');

    const result = await changeAdminPassword(currentPassword, newPassword);
    if (!result.ok) {
      return NextResponse.json({ error: result.error || 'Erro ao trocar senha' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Erro ao processar requisicao' }, { status: 500 });
  }
}
