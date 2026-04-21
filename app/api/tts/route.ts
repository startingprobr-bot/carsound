import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Modality } from "@google/genai";
import fs from 'fs/promises';
import path from 'path';

const validVoices = [
  'Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr',
  'Aoede', 'Leda', 'Orus', 'Algieba', 'Callirrhoe',
  'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Despina',
  'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar',
  'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird',
  'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
];

const COMMUNITY_KEYS_FILE = path.join(process.cwd(), 'dados', 'community_keys.json');
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

async function getCommunityKeys(): Promise<string[]> {
  try {
    const data = await fs.readFile(COMMUNITY_KEYS_FILE, 'utf-8');
    const keys: { key: string }[] = JSON.parse(data);
    return keys.map(k => k.key).filter(Boolean);
  } catch {
    return [];
  }
}

function getEnvKeys(): string[] {
  const multi = process.env.GEMINI_API_KEYS;
  if (multi) {
    return multi.split(',').map(k => k.trim()).filter(Boolean);
  }
  const single = process.env.GEMINI_API_KEY;
  if (single && single !== 'COLE_SUA_CHAVE_AQUI') {
    return [single];
  }
  return [];
}

async function getAllKeys(): Promise<string[]> {
  const envKeys = getEnvKeys();
  const communityKeys = await getCommunityKeys();
  // Merge and deduplicate, env keys first (higher priority)
  const all = [...envKeys];
  for (const k of communityKeys) {
    if (!all.includes(k)) all.push(k);
  }
  return all;
}

function extractIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return (
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-vercel-forwarded-for') ||
    'unknown'
  );
}

function isPublicIp(ip: string): boolean {
  if (!ip || ip === 'unknown') return false;
  if (ip === '::1' || ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.')) return false;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return false;
  return true;
}

async function fetchIpGeo(ip: string): Promise<{ city?: string; region?: string; country?: string; neighborhood?: string; lat?: number; lon?: number } | null> {
  if (!isPublicIp(ip)) return null;
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data: any = await res.json();
    if (!data?.success) return null;
    return {
      city: data.city || undefined,
      region: data.region || undefined,
      country: data.country || undefined,
      neighborhood: data.connection?.isp || undefined,
      lat: typeof data.latitude === 'number' ? data.latitude : undefined,
      lon: typeof data.longitude === 'number' ? data.longitude : undefined,
    };
  } catch {
    return null;
  }
}

async function detectLocationFromText(text: string, city?: string, region?: string, country?: string): Promise<{ query: string; neighborhood?: string; mapLink: string } | null> {
  if (!city) return null;
  try {
    const compactText = text.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!compactText) return null;
    const query = `${compactText}, ${city}${region ? `, ${region}` : ''}${country ? `, ${country}` : ''}`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'carro-som-admin/1.0' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const list: any[] = await res.json();
    if (!Array.isArray(list) || list.length === 0) return null;
    const item: any = list[0];
    const lat = item?.lat;
    const lon = item?.lon;
    if (!lat || !lon) return null;
    const addr = item?.address || {};
    const neighborhood = addr.suburb || addr.neighbourhood || addr.quarter || addr.city_district || undefined;
    return {
      query,
      neighborhood,
      mapLink: `https://www.google.com/maps?q=${lat},${lon}`,
    };
  } catch {
    return null;
  }
}

async function appendAdminLog(entry: AdminLogEntry): Promise<void> {
  try {
    let current: AdminLogEntry[] = [];
    try {
      const raw = await fs.readFile(ADMIN_LOGS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) current = parsed;
    } catch {
      current = [];
    }
    const updated = [entry, ...current].slice(0, 2000);
    await fs.writeFile(ADMIN_LOGS_FILE, JSON.stringify(updated, null, 2));
  } catch {
    // Logging failure must not break TTS generation.
  }
}

function isQuotaError(error: any): boolean {
  const msg = (error.message || '').toLowerCase();
  return msg.includes('429') || msg.includes('resource_exhausted') || msg.includes('quota');
}

const STYLE_PROMPTS: Record<string, string> = {
  'entusiasmado': 'Diga com muito entusiasmo e energia para carro de som:',
  'criativo': 'Seja muito criativo e animado, use entonações variadas, mudanças de ritmo e expressões super empolgantes para carro de som:',
  'urgente': 'Diga com muita urgência e empolgação, como se fosse uma oferta imperdível que vai acabar agora, para carro de som:',
  'amigavel': 'Diga de forma amigável, simpática e convidativa para carro de som:',
  'serio': 'Diga de forma séria e profissional para carro de som:',
  'neutro': 'Diga de forma clara e natural:',
};

async function generateWithKey(apiKey: string, text: string, voice: string, style: string) {
  const ai = new GoogleGenAI({ apiKey });
  const prompt = STYLE_PROMPTS[style] || STYLE_PROMPTS['entusiasmado'];
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `${prompt} ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice as any },
        },
      },
    },
  });
  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
}

export async function POST(request: NextRequest) {
  const keys = await getAllKeys();
  if (keys.length === 0) {
    return NextResponse.json(
      { error: 'Nenhuma chave de API disponível. Contribua com sua chave Gemini clicando no ❤️ no topo da página!' },
      { status: 500 }
    );
  }

  try {
    const { text, voice, style } = await request.json();

    if (!text || typeof text !== 'string' || text.length > 5000) {
      return NextResponse.json(
        { error: 'Texto inválido ou muito longo (máx. 5000 caracteres).' },
        { status: 400 }
      );
    }

    const selectedVoice = validVoices.includes(voice) ? voice : 'Kore';

    const ip = extractIp(request);
    const geo = await fetchIpGeo(ip);
    const locationFromText = await detectLocationFromText(text, geo?.city, geo?.region, geo?.country);
    await appendAdminLog({
      timestamp: new Date().toISOString(),
      text,
      voice: selectedVoice,
      style: style || 'entusiasmado',
      ip,
      city: geo?.city,
      region: geo?.region,
      country: geo?.country,
      neighborhood: locationFromText?.neighborhood,
      locationQuery: locationFromText?.query,
      mapLink: locationFromText?.mapLink,
    });

    // Tenta cada chave; se uma atingir o limite, passa para a próxima
    let lastError: any = null;
    for (let i = 0; i < keys.length; i++) {
      try {
        const base64Audio = await generateWithKey(keys[i], text, selectedVoice, style || 'entusiasmado');
        if (!base64Audio) {
          return NextResponse.json({ error: 'Nenhum áudio gerado pela API.' }, { status: 502 });
        }
        return NextResponse.json({ audio: base64Audio });
      } catch (err: any) {
        lastError = err;
        if (isQuotaError(err) && i < keys.length - 1) {
          console.warn(`Chave ${i + 1}/${keys.length} atingiu o limite, tentando próxima...`);
          continue;
        }
        throw err; // Não é quota ou é a última chave — propaga o erro
      }
    }

    throw lastError;
  } catch (error: any) {
    console.error('TTS API error:', error);
    const msg = error.message || '';

    if (isQuotaError(error)) {
      return NextResponse.json(
        { error: `Todas as ${keys.length} chave(s) atingiram o limite diário (10 req/dia grátis). Adicione mais chaves no .env.local ou aguarde até amanhã.` },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: msg || 'Erro ao gerar áudio.' },
      { status: 500 }
    );
  }
}
