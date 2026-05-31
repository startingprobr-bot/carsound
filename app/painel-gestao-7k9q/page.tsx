'use client';

import { useEffect, useMemo, useState } from 'react';

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

type Period = 'today' | '7d' | '30d' | 'all';

function toBasicAuth(username: string, password: string) {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

function fmtInt(n: number) {
  return new Intl.NumberFormat('pt-BR').format(n);
}

// Gemini 2.5 Flash TTS — limite indicativo do plano gratuito (req/dia por chave).
const FREE_TIER_REQ_PER_KEY = 10;

export default function AdminPage() {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [authHeader, setAuthHeader] = useState<string | null>(null);
  const [logs, setLogs] = useState<AdminLogEntry[]>([]);
  const [communityKeyCount, setCommunityKeyCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<Period>('7d');
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState<string>('all');

  const fetchAll = async (header: string) => {
    setIsLoading(true);
    setError('');
    try {
      const [logsRes, keysRes] = await Promise.all([
        fetch('/api/admin/logs', { headers: { Authorization: header }, cache: 'no-store' }),
        fetch('/api/keys', { cache: 'no-store' }),
      ]);
      if (!logsRes.ok) {
        setError('Login invalido ou sessao expirada');
        setAuthHeader(null);
        return false;
      }
      const data = await logsRes.json();
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      try {
        const k = await keysRes.json();
        setCommunityKeyCount(typeof k?.count === 'number' ? k.count : 0);
      } catch {
        setCommunityKeyCount(0);
      }
      return true;
    } catch {
      setError('Erro ao conectar');
      setAuthHeader(null);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const doLogin = async () => {
    const header = toBasicAuth(username.trim(), password);
    const ok = await fetchAll(header);
    if (ok) setAuthHeader(header);
  };

  const refresh = async () => {
    if (!authHeader) return;
    await fetchAll(authHeader);
  };

  useEffect(() => {
    if (!authHeader) return;
    const id = setInterval(() => fetchAll(authHeader), 60_000);
    return () => clearInterval(id);
  }, [authHeader]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const cutoff =
      period === 'today' ? now - 24 * 60 * 60 * 1000 :
      period === '7d' ? now - 7 * 24 * 60 * 60 * 1000 :
      period === '30d' ? now - 30 * 24 * 60 * 60 * 1000 :
      0;
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      const ts = new Date(l.timestamp).getTime();
      if (cutoff && ts < cutoff) return false;
      if (cityFilter !== 'all' && (l.city || 'Desconhecida') !== cityFilter) return false;
      if (q) {
        const hay = `${l.text} ${l.ip} ${l.city || ''} ${l.region || ''} ${l.country || ''} ${l.voice} ${l.style}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logs, period, search, cityFilter]);

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTs = today.getTime();

    const totalChars = filtered.reduce((s, l) => s + (l.text?.length || 0), 0);
    const todayLogs = filtered.filter((l) => new Date(l.timestamp).getTime() >= todayTs);
    const todayChars = todayLogs.reduce((s, l) => s + (l.text?.length || 0), 0);

    const uniqueIps = new Set(filtered.map((l) => l.ip).filter(Boolean)).size;
    const withPin = filtered.filter((l) => !!l.mapLink).length;
    const withCity = filtered.filter((l) => !!l.city).length;

    const byCity = new Map<string, number>();
    const byCountry = new Map<string, number>();
    const byVoice = new Map<string, number>();
    const byStyle = new Map<string, number>();
    const byHour = new Array<number>(24).fill(0);
    const byDay = new Map<string, number>();

    for (const l of filtered) {
      const city = l.city || 'Desconhecida';
      const country = l.country || 'Desconhecido';
      byCity.set(city, (byCity.get(city) || 0) + 1);
      byCountry.set(country, (byCountry.get(country) || 0) + 1);
      byVoice.set(l.voice, (byVoice.get(l.voice) || 0) + 1);
      byStyle.set(l.style, (byStyle.get(l.style) || 0) + 1);
      const d = new Date(l.timestamp);
      byHour[d.getHours()]++;
      const dayKey = d.toISOString().slice(0, 10);
      byDay.set(dayKey, (byDay.get(dayKey) || 0) + 1);
    }

    const sortMap = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]);

    return {
      total: filtered.length,
      todayCount: todayLogs.length,
      totalChars,
      todayChars,
      uniqueIps,
      withPin,
      withCity,
      byCity: sortMap(byCity),
      byCountry: sortMap(byCountry),
      byVoice: sortMap(byVoice),
      byStyle: sortMap(byStyle),
      byHour,
      byDay: [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    };
  }, [filtered]);

  const allCities = useMemo(
    () => [...new Set(logs.map((l) => l.city || 'Desconhecida'))].sort(),
    [logs]
  );

  const dailyCapacity = Math.max(communityKeyCount, 1) * FREE_TIER_REQ_PER_KEY;
  const todayUsagePct = Math.min(100, (stats.todayCount / dailyCapacity) * 100);

  if (!authHeader) {
    return (
      <main className="min-h-screen bg-[#06080f] text-white px-4 py-12 flex items-center justify-center">
        <div className="w-full max-w-md bg-white/[0.04] border border-white/10 rounded-2xl p-6 space-y-3">
          <h1 className="text-2xl font-black tracking-tight">Painel Admin</h1>
          <p className="text-white/50 text-sm">Acesso restrito.</p>

          <label className="block text-xs uppercase tracking-widest text-white/50 mt-4">Login</label>
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
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#06080f] text-white px-4 py-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Dashboard Admin</h1>
            <p className="text-white/50 text-sm">Visão geral das gerações, usuários e capacidade.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg overflow-hidden border border-white/10">
              {(['today', '7d', '30d', 'all'] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-xs font-bold ${period === p ? 'bg-green-600 text-white' : 'bg-white/[0.03] text-white/60 hover:bg-white/[0.08]'}`}
                >
                  {p === 'today' ? 'Hoje' : p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : 'Tudo'}
                </button>
              ))}
            </div>
            <button
              onClick={refresh}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-40 text-xs font-bold"
            >
              {isLoading ? '...' : 'Atualizar'}
            </button>
            <button
              onClick={() => { setAuthHeader(null); setLogs([]); setPassword(''); }}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold"
            >
              Sair
            </button>
          </div>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg p-3 text-sm">{error}</div>}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Gerações (período)" value={fmtInt(stats.total)} accent="green" />
          <KpiCard label="Hoje" value={fmtInt(stats.todayCount)} accent="emerald" />
          <KpiCard label="Caracteres totais" value={fmtInt(stats.totalChars)} hint={`~${fmtInt(Math.round(stats.totalChars / 4))} tokens`} accent="blue" />
          <KpiCard label="IPs únicos" value={fmtInt(stats.uniqueIps)} accent="purple" />
          <KpiCard label="Com cidade" value={fmtInt(stats.withCity)} hint={`${stats.total ? Math.round((stats.withCity / stats.total) * 100) : 0}% do total`} accent="cyan" />
          <KpiCard label="Chaves comunitárias" value={fmtInt(communityKeyCount)} hint={`~${fmtInt(dailyCapacity)} req/dia`} accent="yellow" />
        </div>

        <Section title="Capacidade do dia">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[240px]">
              <div className="flex justify-between text-xs text-white/60 mb-1">
                <span>{fmtInt(stats.todayCount)} de ~{fmtInt(dailyCapacity)} requisições</span>
                <span className={todayUsagePct > 80 ? 'text-red-400' : todayUsagePct > 50 ? 'text-yellow-400' : 'text-green-400'}>
                  {todayUsagePct.toFixed(1)}%
                </span>
              </div>
              <div className="h-2.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className={`h-full ${todayUsagePct > 80 ? 'bg-red-500' : todayUsagePct > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${todayUsagePct}%` }}
                />
              </div>
              <p className="text-[10px] text-white/40 mt-1">
                Estimativa baseada em {fmtInt(FREE_TIER_REQ_PER_KEY)} req/dia por chave gratuita.
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-white/50 uppercase tracking-widest">Caracteres hoje</div>
              <div className="text-2xl font-black text-blue-300">{fmtInt(stats.todayChars)}</div>
            </div>
          </div>
        </Section>

        <Section title="Gerações por dia">
          <DailyBars data={stats.byDay} />
        </Section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Section title="Top cidades">
            <RankList items={stats.byCity.slice(0, 10)} total={stats.total} color="bg-cyan-500" />
          </Section>
          <Section title="Top vozes">
            <RankList items={stats.byVoice.slice(0, 10)} total={stats.total} color="bg-purple-500" />
          </Section>
          <Section title="Top estilos">
            <RankList items={stats.byStyle.slice(0, 10)} total={stats.total} color="bg-green-500" />
          </Section>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Section title="Top países">
            <RankList items={stats.byCountry.slice(0, 8)} total={stats.total} color="bg-yellow-500" />
          </Section>
          <Section title="Atividade por hora do dia">
            <HourlyBars data={stats.byHour} />
          </Section>
        </div>

        <Section title={`Registros (${fmtInt(filtered.length)})`}>
          <div className="flex flex-wrap gap-2 mb-3">
            <input
              type="text"
              placeholder="Buscar texto, IP, cidade, voz..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-[220px] rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-green-500/50"
            />
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-green-500/50"
            >
              <option value="all">Todas as cidades</option>
              {allCities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="overflow-auto border border-white/10 rounded-xl">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-white/[0.04] text-white/70">
                <tr>
                  <th className="text-left p-3">Data/Hora</th>
                  <th className="text-left p-3">Texto</th>
                  <th className="text-left p-3">Voz</th>
                  <th className="text-left p-3">Estilo</th>
                  <th className="text-left p-3">IP</th>
                  <th className="text-left p-3">Cidade</th>
                  <th className="text-left p-3">País</th>
                  <th className="text-left p-3">Mapa</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log, idx) => (
                  <tr key={`${log.timestamp}-${idx}`} className="border-t border-white/10 hover:bg-white/[0.02]">
                    <td className="p-3 text-white/70 whitespace-nowrap text-xs">
                      {new Date(log.timestamp).toLocaleString('pt-BR')}
                    </td>
                    <td className="p-3 text-white/85 max-w-[420px]">
                      <div className="line-clamp-2">{log.text}</div>
                      <div className="text-[10px] text-white/40 mt-1">{log.text.length} chars</div>
                    </td>
                    <td className="p-3 text-purple-300 text-xs">{log.voice}</td>
                    <td className="p-3 text-green-300 text-xs">{log.style}</td>
                    <td className="p-3 text-white/70 font-mono text-xs">{log.ip || '-'}</td>
                    <td className="p-3 text-white/70 text-xs">
                      {[log.city, log.region].filter(Boolean).join(' - ') || '-'}
                      {log.neighborhood && <div className="text-[10px] text-white/40">{log.neighborhood}</div>}
                    </td>
                    <td className="p-3 text-white/70 text-xs">{log.country || '-'}</td>
                    <td className="p-3">
                      {log.mapLink ? (
                        <a href={log.mapLink} target="_blank" rel="noopener noreferrer"
                          className="text-green-400 hover:text-green-300 underline text-xs">
                          abrir
                        </a>
                      ) : (
                        <span className="text-white/30 text-xs">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-white/40">
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 sm:p-5">
      <h2 className="text-xs uppercase tracking-widest text-white/50 font-bold mb-3">{title}</h2>
      {children}
    </section>
  );
}

const ACCENTS: Record<string, string> = {
  green: 'from-green-500/20 to-green-500/0 text-green-300',
  emerald: 'from-emerald-500/20 to-emerald-500/0 text-emerald-300',
  blue: 'from-blue-500/20 to-blue-500/0 text-blue-300',
  purple: 'from-purple-500/20 to-purple-500/0 text-purple-300',
  cyan: 'from-cyan-500/20 to-cyan-500/0 text-cyan-300',
  yellow: 'from-yellow-500/20 to-yellow-500/0 text-yellow-300',
};

function KpiCard({ label, value, hint, accent = 'green' }: { label: string; value: string; hint?: string; accent?: string }) {
  return (
    <div className={`relative overflow-hidden bg-gradient-to-b ${ACCENTS[accent] || ACCENTS.green} bg-white/[0.03] border border-white/10 rounded-xl p-3`}>
      <div className="text-[10px] uppercase tracking-widest text-white/50 font-bold">{label}</div>
      <div className="text-2xl font-black mt-1">{value}</div>
      {hint && <div className="text-[10px] text-white/40 mt-0.5">{hint}</div>}
    </div>
  );
}

function RankList({ items, total, color }: { items: [string, number][]; total: number; color: string }) {
  if (items.length === 0) return <div className="text-white/40 text-sm py-3">Sem dados</div>;
  const max = items[0][1] || 1;
  return (
    <div className="space-y-2">
      {items.map(([name, count]) => {
        const pct = total ? (count / total) * 100 : 0;
        const barPct = (count / max) * 100;
        return (
          <div key={name} className="text-xs">
            <div className="flex justify-between mb-1">
              <span className="text-white/80 truncate max-w-[70%]" title={name}>{name}</span>
              <span className="text-white/50 font-mono">{fmtInt(count)} · {pct.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
              <div className={`h-full ${color}`} style={{ width: `${barPct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DailyBars({ data }: { data: [string, number][] }) {
  if (data.length === 0) return <div className="text-white/40 text-sm py-3">Sem dados</div>;
  const max = Math.max(...data.map((d) => d[1]), 1);
  return (
    <div className="flex items-end gap-1 h-32 overflow-x-auto">
      {data.map(([day, count]) => {
        const h = (count / max) * 100;
        const d = new Date(day);
        return (
          <div key={day} className="flex flex-col items-center min-w-[28px] flex-1" title={`${day}: ${count}`}>
            <div className="flex-1 w-full flex items-end">
              <div
                className="w-full bg-gradient-to-t from-green-500 to-emerald-400 rounded-t"
                style={{ height: `${h}%` }}
              />
            </div>
            <div className="text-[9px] text-white/40 mt-1">{d.getDate()}/{d.getMonth() + 1}</div>
            <div className="text-[10px] text-white/70 font-bold">{count}</div>
          </div>
        );
      })}
    </div>
  );
}

function HourlyBars({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-1 h-28">
      {data.map((count, h) => {
        const height = (count / max) * 100;
        return (
          <div key={h} className="flex-1 flex flex-col items-center" title={`${h}h: ${count}`}>
            <div className="flex-1 w-full flex items-end">
              <div
                className="w-full bg-gradient-to-t from-cyan-500 to-blue-400 rounded-t"
                style={{ height: `${height}%` }}
              />
            </div>
            <div className="text-[9px] text-white/40 mt-1">{h}</div>
          </div>
        );
      })}
    </div>
  );
}
