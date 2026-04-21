import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const ADMIN_AUTH_FILE = path.join(process.cwd(), 'dados', 'admin_auth.json');

const DEFAULT_ADMIN_USER = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin123';

type StoredAuth = {
  username: string;
  passwordHash: string;
  updatedAt: string;
};

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

async function readStoredAuth(): Promise<StoredAuth | null> {
  try {
    const raw = await fs.readFile(ADMIN_AUTH_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.username || !parsed.passwordHash) return null;
    return parsed as StoredAuth;
  } catch {
    return null;
  }
}

async function writeStoredAuth(data: StoredAuth): Promise<void> {
  await fs.writeFile(ADMIN_AUTH_FILE, JSON.stringify(data, null, 2));
}

export async function getAdminUser(): Promise<string> {
  const envUser = process.env.ADMIN_USER;
  if (envUser && envUser.trim()) return envUser.trim();
  const stored = await readStoredAuth();
  if (stored?.username) return stored.username;
  return DEFAULT_ADMIN_USER;
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const envPass = process.env.ADMIN_PASSWORD;
  if (envPass && envPass.trim()) {
    return password === envPass;
  }

  const stored = await readStoredAuth();
  const hashToCompare = stored?.passwordHash || sha256(DEFAULT_ADMIN_PASSWORD);
  return sha256(password) === hashToCompare;
}

export async function verifyBasicAuthHeader(authHeader: string | null): Promise<boolean> {
  if (!authHeader || !authHeader.startsWith('Basic ')) return false;
  try {
    const encoded = authHeader.slice(6).trim();
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return false;
    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);

    const expectedUser = await getAdminUser();
    if (username !== expectedUser) return false;
    return verifyAdminPassword(password);
  } catch {
    return false;
  }
}

export async function changeAdminPassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
  if (!newPassword || newPassword.length < 6) {
    return { ok: false, error: 'Nova senha deve ter pelo menos 6 caracteres.' };
  }

  const currentValid = await verifyAdminPassword(currentPassword);
  if (!currentValid) {
    return { ok: false, error: 'Senha atual incorreta.' };
  }

  const username = await getAdminUser();

  try {
    await writeStoredAuth({
      username,
      passwordHash: sha256(newPassword),
      updatedAt: new Date().toISOString(),
    });
    return { ok: true };
  } catch {
    return { ok: false, error: 'Nao foi possivel salvar a senha no servidor.' };
  }
}
