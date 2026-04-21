'use client';

import { useMemo, useState } from 'react';

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
  mapLink?: string;
};

function toBasicAuth(username: string, password: string) {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

export default function AdminPage() {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [authHeader, setAuthHeader] = useState<string | null>(null);
  const [logs, setLogs] = useState<AdminLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const totalWithMap = useMemo(() => logs.filter((l) => !!l.mapLink).length, [logs]);

  const doLogin = async () => {
    setError('');
    setIsLoading(true);
    try {
      const header = toBasicAuth(username.trim(), password);
      const res = await fetch('/api/admin/logs', {
        headers: { Authorization: header },
        cache: 'no-store',
      });
      if (!res.ok) {
        setError('Login invalido');
        setAuthHeader(null);
        return;
      }
      const data = await res.json();
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setAuthHeader(header);
    } catch {
      setError('Erro ao conectar');
      setAuthHeader(null);
    } finally {
      setIsLoading(false);
    }
  };

  const refresh = async () => {
    if (!authHeader) return;
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/logs', {
        headers: { Authorization: authHeader },
        cache: 'no-store',
      });
      if (!res.ok) {
        setError('Sessao expirada');
        setAuthHeader(null);
        return;
      }
      const data = await res.json();
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch {
      setError('Falha ao atualizar');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#080b12] text-white px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-black tracking-tight">Painel Admin</h1>
        <p className="text-white/60 mt-1">Textos gerados, IP de acesso, cidade e link do mapa quando identificado.</p>

        {!authHeader ? (
          <div className="mt-6 max-w-md bg-white/[0.04] border border-white/10 rounded-2xl p-5 space-y-3">
            <label className="block text-xs uppercase tracking-widest text-white/50">Login</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-green-500/50"
            />

            <label className="block text-xs uppercase tracking-widest text-white/50">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doLogin()}
              className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-green-500/50"
            />

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              onClick={doLogin}
              disabled={isLoading || !username.trim() || !password}
              className="w-full py-2.5 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-40 font-bold"
            >
              {isLoading ? 'Entrando...' : 'Entrar'}
            </button>
          </div>
        ) : (
          <div className="mt-6">
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={refresh}
                disabled={isLoading}
                className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-40 text-sm font-bold"
              >
                {isLoading ? 'Atualizando...' : 'Atualizar'}
              </button>
              <button
                onClick={() => {
                  setAuthHeader(null);
                  setLogs([]);
                  setPassword('');
                }}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-bold"
              >
                Sair
              </button>
              <span className="text-sm text-white/60">Total: {logs.length}</span>
              <span className="text-sm text-white/60">Com pin: {totalWithMap}</span>
            </div>

            {error && <p className="text-red-400 text-sm mb-2">{error}</p>}

            <div className="overflow-auto border border-white/10 rounded-xl">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-white/[0.04] text-white/70">
                  <tr>
                    <th className="text-left p-3">Data/Hora</th>
                    <th className="text-left p-3">Texto</th>
                    <th className="text-left p-3">IP</th>
                    <th className="text-left p-3">Cidade</th>
                    <th className="text-left p-3">Bairro</th>
                    <th className="text-left p-3">Mapa</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, idx) => (
                    <tr key={`${log.timestamp}-${idx}`} className="border-t border-white/10">
                      <td className="p-3 text-white/70 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString('pt-BR')}
                      </td>
                      <td className="p-3 text-white/85 max-w-[420px]">
                        <div className="line-clamp-3">{log.text}</div>
                        <div className="text-xs text-white/40 mt-1">{log.voice} · {log.style}</div>
                      </td>
                      <td className="p-3 text-white/70 font-mono">{log.ip || '-'}</td>
                      <td className="p-3 text-white/70">
                        {[log.city, log.region].filter(Boolean).join(' - ') || '-'}
                      </td>
                      <td className="p-3 text-white/70">{log.neighborhood || '-'}</td>
                      <td className="p-3">
                        {log.mapLink ? (
                          <a
                            href={log.mapLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-green-400 hover:text-green-300 underline"
                          >
                            abrir pin
                          </a>
                        ) : (
                          <span className="text-white/30">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-white/40">
                        Nenhum registro encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
