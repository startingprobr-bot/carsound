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
