/**
 * Biblioteca de efeitos sonoros baseada em arquivos MP3.
 * Os arquivos ficam em /public/effects/
 */

export interface SoundEffect {
  id: string;
  name: string;
  emoji: string;
  category: string;
  url: string;
}

// Cache de AudioBuffers ja decodificados
const bufferCache = new Map<string, AudioBuffer>();

export const SOUND_EFFECTS: SoundEffect[] = [
  { id: 'plantao-da-globo', name: 'Plantão da Globo', emoji: '🎵', category: 'Publico', url: '/effects/plantao-da-globo.mp3' },
  { id: 'aplausos', name: 'Aplausos', emoji: '👏', category: 'Publico', url: '/effects/aplausos.mp3' },
  { id: 'aplausos-2', name: 'Aplausos 2', emoji: '👏', category: 'Publico', url: '/effects/aplausos-2.mp3' },
  { id: 'cantada-pneu', name: 'Cantada de Pneu', emoji: '🏎️', category: 'Veiculos', url: '/effects/cantaa-de-pneu.mp3' },
  { id: 'coracao', name: 'Coracao', emoji: '❤️', category: 'Classicos', url: '/effects/coracao.mp3' },
  { id: 'digitando', name: 'Digitando', emoji: '⌨️', category: 'Classicos', url: '/effects/digitando.mp3' },
  { id: 'dinheiro', name: 'Dinheiro', emoji: '💰', category: 'Classicos', url: '/effects/dinheiro.mp3' },
  { id: 'dinheiro-2', name: 'Dinheiro 2', emoji: '💰', category: 'Classicos', url: '/effects/dinheiro-2.mp3' },
  { id: 'efeito-magico', name: 'Efeito Magico', emoji: '✨', category: 'Impacto', url: '/effects/efeito-magico.mp3' },
  { id: 'fiuiiii', name: 'Fiuiiii', emoji: '🎵', category: 'Publico', url: '/effects/fiuiiii.mp3' },
  { id: 'gliter', name: 'Glitter', emoji: '✨', category: 'Impacto', url: '/effects/gliter.mp3' },
  { id: 'oh-my-gosh', name: 'Oh my Gosh', emoji: '😮', category: 'Publico', url: '/effects/oh-my-gosh.mp3' },
  { id: 'pinnnn', name: 'Pinnnn', emoji: '🔔', category: 'Notificacao', url: '/effects/pinnnn.mp3' },
  { id: 'pop', name: 'Pop', emoji: '💥', category: 'Impacto', url: '/effects/pop.mp3' },
  { id: 'sensura', name: 'Censura', emoji: '🤬', category: 'Classicos', url: '/effects/sensura.mp3' },
  { id: 'tic-tac', name: 'Tic Tac', emoji: '⏰', category: 'Classicos', url: '/effects/tic-tac.mp3' },
  { id: 'vazio', name: 'Vazio', emoji: '🕳️', category: 'Impacto', url: '/effects/vazio.mp3' },
  { id: 'vuuup', name: 'Vuuup', emoji: '💨', category: 'Impacto', url: '/effects/vuuup.mp3' },
];

export async function loadEffectBuffer(ctx: AudioContext, effectId: string): Promise<AudioBuffer | null> {
  const effect = SOUND_EFFECTS.find(e => e.id === effectId);
  if (!effect) return null;

  const cached = bufferCache.get(effectId);
  if (cached) return cached;

  try {
    const response = await fetch(effect.url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    bufferCache.set(effectId, audioBuffer);
    return audioBuffer;
  } catch (e) {
    console.warn(`Failed to load effect ${effectId}:`, e);
    return null;
  }
}

export async function playEffect(ctx: AudioContext, effectId: string): Promise<AudioBufferSourceNode | null> {
  const buffer = await loadEffectBuffer(ctx, effectId);
  if (!buffer) return null;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
  return source;
}
