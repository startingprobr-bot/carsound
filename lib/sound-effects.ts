/**
 * Biblioteca de efeitos sonoros gerados sinteticamente via Web Audio API.
 * Nenhuma dependência externa — tudo é gerado em tempo real.
 */

export interface SoundEffect {
  id: string;
  name: string;
  emoji: string;
  category: string;
  generate: (ctx: AudioContext) => AudioBuffer;
}

// --- Helpers ---

/** Soft clamp to avoid harsh clipping */
function softClip(x: number): number {
  return Math.tanh(x);
}

/** Simple low-pass filter applied to buffer data in-place */
function applyLowPass(data: Float32Array, cutoff: number, sr: number) {
  const rc = 1.0 / (2 * Math.PI * cutoff);
  const dt = 1.0 / sr;
  const alpha = dt / (rc + dt);
  let prev = data[0];
  for (let i = 1; i < data.length; i++) {
    prev = prev + alpha * (data[i] - prev);
    data[i] = prev;
  }
}

/** Apply high-pass filter in-place */
function applyHighPass(data: Float32Array, cutoff: number, sr: number) {
  const rc = 1.0 / (2 * Math.PI * cutoff);
  const dt = 1.0 / sr;
  const alpha = rc / (rc + dt);
  let prevIn = data[0];
  let prevOut = data[0];
  for (let i = 1; i < data.length; i++) {
    const curr = data[i];
    prevOut = alpha * (prevOut + curr - prevIn);
    prevIn = curr;
    data[i] = prevOut;
  }
}

// --- Effect Generators ---

function generateKeyboardTyping(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const duration = 2.0;
  const length = Math.ceil(sr * duration);
  const buffer = ctx.createBuffer(1, length, sr);
  const data = buffer.getChannelData(0);

  // Multiple key types: keycap hit, spring release, bottom-out
  const clickTimes: number[] = [];
  for (let t = 0; t < duration - 0.15; t += 0.06 + Math.random() * 0.08) {
    clickTimes.push(t);
  }

  for (const t of clickTimes) {
    const startSample = Math.floor(t * sr);
    const isSpace = Math.random() < 0.12; // occasional spacebar
    const clickLen = Math.floor((isSpace ? 0.025 : 0.012) * sr);
    const pitch = isSpace ? 800 + Math.random() * 400 : 2500 + Math.random() * 3000;
    const vol = isSpace ? 0.5 : 0.25 + Math.random() * 0.15;

    for (let i = 0; i < clickLen && startSample + i < length; i++) {
      const env = Math.exp(-i / (clickLen * 0.12));
      // Click body
      data[startSample + i] += env * vol * Math.sin(2 * Math.PI * pitch * i / sr);
      // Noise transient
      data[startSample + i] += env * vol * 0.4 * (Math.random() * 2 - 1);
      // Secondary resonance (key spring)
      if (i > Math.floor(0.003 * sr)) {
        const env2 = Math.exp(-(i - 0.003 * sr) / (clickLen * 0.3));
        data[startSample + i] += env2 * vol * 0.15 * Math.sin(2 * Math.PI * (pitch * 0.6) * i / sr);
      }
    }
  }
  applyHighPass(data, 800, sr);
  return buffer;
}

function generateTireScreech(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const duration = 2.0;
  const length = Math.ceil(sr * duration);
  const buffer = ctx.createBuffer(1, length, sr);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    const t = i / sr;
    // Attack/sustain/release envelope
    const attack = Math.min(t * 12, 1);
    const release = t > 1.4 ? Math.max(0, 1 - (t - 1.4) / 0.6) : 1;
    const env = attack * release;

    // Main screech: filtered noise + resonant frequencies
    const noise = (Math.random() * 2 - 1);
    // Frequency modulation for realistic rubber sound
    const modFreq = 6 + 4 * Math.sin(t * 3);
    const freq1 = 900 + 500 * Math.sin(t * modFreq);
    const freq2 = 1800 + 300 * Math.sin(t * modFreq * 1.3);
    const tone1 = Math.sin(2 * Math.PI * freq1 * t) * 0.35;
    const tone2 = Math.sin(2 * Math.PI * freq2 * t) * 0.2;
    // Band-limited noise
    const bandNoise = noise * Math.sin(2 * Math.PI * 1200 * t) * 0.3;
    data[i] = softClip(env * (tone1 + tone2 + bandNoise + noise * 0.15) * 0.7);
  }
  applyHighPass(data, 400, sr);
  return buffer;
}

function generateBell(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const duration = 3.0;
  const length = Math.ceil(sr * duration);
  const buffer = ctx.createBuffer(1, length, sr);
  const data = buffer.getChannelData(0);

  // Realistic bell with inharmonic partials (bell spectrum)
  const partials = [
    { freq: 523.25, amp: 1.0, decay: 2.0 },   // fundamental
    { freq: 523.25 * 2.0, amp: 0.6, decay: 1.5 },
    { freq: 523.25 * 2.76, amp: 0.45, decay: 1.2 }, // minor third harmonic
    { freq: 523.25 * 3.0, amp: 0.35, decay: 1.0 },
    { freq: 523.25 * 4.07, amp: 0.25, decay: 0.8 }, // bell characteristic
    { freq: 523.25 * 5.2, amp: 0.15, decay: 0.6 },
    { freq: 523.25 * 6.3, amp: 0.1, decay: 0.4 },
  ];

  for (let i = 0; i < length; i++) {
    const t = i / sr;
    // Initial strike transient (metallic noise)
    const strike = t < 0.008 ? (Math.random() * 2 - 1) * Math.exp(-t / 0.002) * 0.5 : 0;
    let sample = strike;
    for (const p of partials) {
      const env = Math.exp(-t / p.decay);
      sample += env * p.amp * Math.sin(2 * Math.PI * p.freq * t);
    }
    data[i] = softClip(sample * 0.18);
  }
  return buffer;
}

function generateIphoneMessage(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const duration = 1.2;
  const length = Math.ceil(sr * duration);
  const buffer = ctx.createBuffer(1, length, sr);
  const data = buffer.getChannelData(0);

  // Classic tri-tone (Bb5, G5, Eb6) with sine + slight harmonic
  const notes = [
    { freq: 932.33, start: 0.0, dur: 0.15 },   // Bb5
    { freq: 783.99, start: 0.18, dur: 0.15 },   // G5
    { freq: 1244.51, start: 0.36, dur: 0.22 },  // Eb6
  ];

  for (const note of notes) {
    const startSample = Math.floor(note.start * sr);
    const noteLen = Math.floor(note.dur * sr);
    for (let i = 0; i < noteLen && startSample + i < length; i++) {
      const t = i / sr;
      // Smooth bell-like envelope
      const env = Math.sin(Math.PI * t / note.dur) * Math.exp(-t * 2);
      const fundamental = Math.sin(2 * Math.PI * note.freq * t);
      const harmonic2 = Math.sin(2 * Math.PI * note.freq * 2 * t) * 0.15;
      const harmonic3 = Math.sin(2 * Math.PI * note.freq * 3 * t) * 0.05;
      data[startSample + i] += env * (fundamental + harmonic2 + harmonic3) * 0.4;
    }
  }
  return buffer;
}

function generateClapping(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const duration = 3.0;
  const length = Math.ceil(sr * duration);
  const buffer = ctx.createBuffer(1, length, sr);
  const data = buffer.getChannelData(0);

  // Realistic crowd clapping: multiple "hands" with slightly different timing
  const baseTimes = [0.0, 0.32, 0.64, 0.96, 1.2, 1.44, 1.68, 1.92, 2.08, 2.24, 2.4, 2.56, 2.72];

  for (const baseT of baseTimes) {
    // Simulate 3-5 overlapping claps per beat (crowd effect)
    const numHands = 3 + Math.floor(Math.random() * 3);
    for (let h = 0; h < numHands; h++) {
      const t = baseT + (Math.random() - 0.5) * 0.05; // timing variation
      if (t < 0 || t >= duration) continue;
      const startSample = Math.floor(t * sr);
      const clapLen = Math.floor((0.02 + Math.random() * 0.02) * sr);
      const vol = 0.15 + Math.random() * 0.15;

      for (let i = 0; i < clapLen && startSample + i < length; i++) {
        const progress = i / clapLen;
        // Double-peaked envelope (skin contact + cupping resonance)
        const env1 = Math.exp(-progress * 12);
        const env2 = progress > 0.2 ? Math.exp(-(progress - 0.2) * 8) * 0.4 : 0;
        const env = env1 + env2;
        // Filtered noise (real clap is band-passed around 1-4kHz)
        const noise = (Math.random() * 2 - 1);
        const bandCenter = 1800 + Math.random() * 1500;
        const resonance = Math.sin(2 * Math.PI * bandCenter * i / sr);
        data[startSample + i] += env * vol * noise * (0.5 + 0.5 * Math.abs(resonance));
      }
    }
  }
  applyHighPass(data, 600, sr);
  applyLowPass(data, 6000, sr);
  return buffer;
}

function generateWhistle(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const duration = 1.8;
  const length = Math.ceil(sr * duration);
  const buffer = ctx.createBuffer(1, length, sr);
  const data = buffer.getChannelData(0);

  // "Fiuuuíííí" - ascending referee/street whistle
  let phase = 0;
  for (let i = 0; i < length; i++) {
    const t = i / sr;
    const progress = t / duration;

    // Two-stage: short low start then rising
    let freq: number;
    if (progress < 0.1) {
      freq = 800 + 1200 * (progress / 0.1);
    } else {
      freq = 2000 + 1500 * Math.pow((progress - 0.1) / 0.9, 0.7);
    }

    // Natural vibrato
    const vibrato = 15 * Math.sin(2 * Math.PI * 6 * t);
    freq += vibrato;

    // Envelope with breath attack
    const attack = Math.min(t / 0.05, 1);
    const sustain = progress > 0.85 ? Math.max(0, 1 - (progress - 0.85) / 0.15) : 1;
    const env = attack * sustain;

    // Phase accumulation for clean pitch
    phase += 2 * Math.PI * freq / sr;
    const main = Math.sin(phase);
    const breath = (Math.random() * 2 - 1) * 0.08;

    data[i] = env * (main * 0.35 + breath);
  }
  return buffer;
}

function generateHorn(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const duration = 1.8;
  const length = Math.ceil(sr * duration);
  const buffer = ctx.createBuffer(1, length, sr);
  const data = buffer.getChannelData(0);

  // Car horn: two notes played together (major third)
  const freq1 = 380; // F4
  const freq2 = 480; // B4 (approximately)
  for (let i = 0; i < length; i++) {
    const t = i / sr;
    // Quick attack, sustained, quick release
    const attack = Math.min(t / 0.02, 1);
    const release = t > 1.4 ? Math.max(0, 1 - (t - 1.4) / 0.4) : 1;
    const env = attack * release;

    // Rich harmonic content through waveshaping
    let sample = 0;
    // Fundamental + harmonics for each tone
    for (let h = 1; h <= 5; h++) {
      sample += Math.sin(2 * Math.PI * freq1 * h * t) / (h * 1.2);
      sample += Math.sin(2 * Math.PI * freq2 * h * t) / (h * 1.2);
    }
    // Saturation for that electric horn sound
    data[i] = softClip(env * sample * 0.6) * 0.4;
  }
  return buffer;
}

function generateDrumRoll(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const duration = 2.5;
  const length = Math.ceil(sr * duration);
  const buffer = ctx.createBuffer(1, length, sr);
  const data = buffer.getChannelData(0);

  // Snare drum roll: accelerating hits with floor interval
  let t = 0;
  let interval = 0.14;
  const minInterval = 0.025; // FLOOR to prevent infinite loop

  while (t < duration) {
    const startSample = Math.floor(t * sr);
    const hitLen = Math.floor(0.06 * sr);
    const isAccent = t > duration * 0.8; // Final accent hits

    for (let i = 0; i < hitLen && startSample + i < length; i++) {
      const progress = i / hitLen;
      // Drum body (low thump)
      const bodyFreq = 180 + (isAccent ? 20 : 0);
      const bodyEnv = Math.exp(-progress * 15);
      const body = bodyEnv * Math.sin(2 * Math.PI * bodyFreq * i / sr) * 0.35;

      // Snare wires (filtered noise)
      const snareEnv = Math.exp(-progress * 8);
      const snareNoise = (Math.random() * 2 - 1) * snareEnv * 0.25;

      // Stick impact
      const impactEnv = Math.exp(-progress * 30);
      const impact = impactEnv * (Math.random() * 2 - 1) * 0.3;

      const vol = isAccent ? 1.2 : 0.8 + (t / duration) * 0.4; // crescendo
      data[startSample + i] += (body + snareNoise + impact) * vol;
    }

    t += interval;
    interval = Math.max(interval * 0.88, minInterval);
  }

  // Final cymbal crash at the end
  const crashStart = Math.floor((duration - 0.5) * sr);
  for (let i = 0; i < Math.floor(0.5 * sr) && crashStart + i < length; i++) {
    const progress = i / (0.5 * sr);
    const env = Math.exp(-progress * 4);
    const noise = (Math.random() * 2 - 1);
    const shimmer = Math.sin(2 * Math.PI * 4000 * progress) * 0.3;
    data[crashStart + i] += env * (noise * 0.2 + shimmer * noise * 0.15);
  }

  return buffer;
}

function generateCashRegister(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const duration = 1.2;
  const length = Math.ceil(sr * duration);
  const buffer = ctx.createBuffer(1, length, sr);
  const data = buffer.getChannelData(0);

  // "Ka-ching!" = mechanical slide + bell ring

  // 1. Mechanical drawer slide (metallic noise burst)
  for (let i = 0; i < Math.floor(0.04 * sr); i++) {
    const t = i / sr;
    const env = Math.exp(-t / 0.01) * 0.4;
    const metallic = (Math.random() * 2 - 1) * Math.sin(2 * Math.PI * 3000 * t);
    data[i] = env * metallic;
  }

  // 2. Bell ding (two overlapping high tones)
  const bellStart = Math.floor(0.06 * sr);
  for (let i = 0; i < length - bellStart; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 4);
    const bell1 = Math.sin(2 * Math.PI * 2093 * t); // C7
    const bell2 = Math.sin(2 * Math.PI * 2637 * t); // E7
    const bell3 = Math.sin(2 * Math.PI * 3136 * t); // G7
    // Natural beating from close frequencies
    data[bellStart + i] = env * (bell1 * 0.3 + bell2 * 0.25 + bell3 * 0.15);
    // Strike transient
    if (t < 0.005) {
      data[bellStart + i] += Math.exp(-t / 0.001) * (Math.random() * 2 - 1) * 0.3;
    }
  }
  return buffer;
}

function generateAirhorn(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const duration = 2.5;
  const length = Math.ceil(sr * duration);
  const buffer = ctx.createBuffer(1, length, sr);
  const data = buffer.getChannelData(0);

  // Stadium/MLG airhorn - thick, brassy, distorted
  const baseFreq = 494; // B4 (classic airhorn note)
  for (let i = 0; i < length; i++) {
    const t = i / sr;
    // Three blasts pattern
    let env = 0;
    if (t < 0.4) env = Math.min(t / 0.01, 1); // blast 1
    else if (t < 0.5) env = Math.max(0, 1 - (t - 0.4) / 0.1);
    else if (t < 0.6) env = 0;
    else if (t < 1.0) env = Math.min((t - 0.6) / 0.01, 1); // blast 2
    else if (t < 1.1) env = Math.max(0, 1 - (t - 1.0) / 0.1);
    else if (t < 1.2) env = 0;
    else if (t < 2.2) env = Math.min((t - 1.2) / 0.01, 1); // long blast 3
    else env = Math.max(0, 1 - (t - 2.2) / 0.3);

    // Stacked harmonics for that thick horn sound
    let sample = 0;
    for (let h = 1; h <= 8; h++) {
      const harmAmp = 1 / Math.pow(h, 0.8);
      sample += Math.sin(2 * Math.PI * baseFreq * h * t + h * 0.3) * harmAmp;
    }
    // Heavy saturation
    data[i] = softClip(sample * env * 1.5) * 0.35;
  }
  return buffer;
}

function generateExplosion(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const duration = 2.5;
  const length = Math.ceil(sr * duration);
  const buffer = ctx.createBuffer(1, length, sr);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    const t = i / sr;
    // Multi-phase: initial crack, expanding blast, low rumble tail
    // Phase 1: Initial transient crack (<5ms)
    const crack = t < 0.005 ? (Math.random() * 2 - 1) * Math.exp(-t / 0.001) * 1.5 : 0;
    // Phase 2: Blast wave (expanding noise)
    const blastEnv = Math.exp(-t * 5) * Math.min(t * 200, 1);
    const blast = (Math.random() * 2 - 1) * blastEnv;
    // Phase 3: Sub-bass rumble
    const rumbleEnv = Math.exp(-t * 1.5) * Math.min(t * 20, 1);
    const rumbleFreq = 35 + 15 * Math.sin(t * 3);
    const rumble = Math.sin(2 * Math.PI * rumbleFreq * t + 2 * Math.sin(t * 7)) * rumbleEnv;
    // Phase 4: Debris scatter (late sparse clicks)
    let debris = 0;
    if (t > 0.3 && Math.random() < 0.003) {
      debris = (Math.random() * 2 - 1) * 0.15 * Math.exp(-(t - 0.3) * 2);
    }

    data[i] = softClip((crack + blast * 0.6 + rumble * 0.7 + debris) * 0.6);
  }
  applyLowPass(data, 8000, sr);
  return buffer;
}

function generateWoosh(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const duration = 0.9;
  const length = Math.ceil(sr * duration);
  const buffer = ctx.createBuffer(1, length, sr);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    const t = i / sr;
    const progress = t / duration;
    // Asymmetric envelope (quick rise, slower fall) - Doppler-like
    const env = progress < 0.35
      ? Math.pow(progress / 0.35, 2)
      : Math.pow(1 - (progress - 0.35) / 0.65, 1.5);
    // Frequency sweep (low to high to low - Doppler effect)
    const freq = 200 + 3000 * Math.sin(Math.PI * progress);
    // Filtered noise
    const noise = (Math.random() * 2 - 1);
    const shaped = noise * Math.sin(2 * Math.PI * freq * t / 3);
    data[i] = env * shaped * 0.4;
  }
  applyLowPass(data, 5000, sr);
  return buffer;
}

// --- Registry ---
export const SOUND_EFFECTS: SoundEffect[] = [
  { id: 'keyboard', name: 'Teclado Digitando', emoji: '⌨️', category: 'Clássicos', generate: generateKeyboardTyping },
  { id: 'tire_screech', name: 'Cantada de Pneu', emoji: '🏎️', category: 'Veículos', generate: generateTireScreech },
  { id: 'bell', name: 'Sino', emoji: '🔔', category: 'Clássicos', generate: generateBell },
  { id: 'iphone_msg', name: 'Mensagem iPhone', emoji: '📱', category: 'Notificação', generate: generateIphoneMessage },
  { id: 'clapping', name: 'Palmas', emoji: '👏', category: 'Público', generate: generateClapping },
  { id: 'whistle', name: 'Assobio Fiuuíí', emoji: '🎵', category: 'Público', generate: generateWhistle },
  { id: 'horn', name: 'Buzina', emoji: '📯', category: 'Veículos', generate: generateHorn },
  { id: 'drum_roll', name: 'Rufar de Tambor', emoji: '🥁', category: 'Musical', generate: generateDrumRoll },
  { id: 'cash_register', name: 'Caixa Registradora', emoji: '💰', category: 'Clássicos', generate: generateCashRegister },
  { id: 'airhorn', name: 'Corneta', emoji: '📢', category: 'Clássicos', generate: generateAirhorn },
  { id: 'explosion', name: 'Explosão', emoji: '💥', category: 'Impacto', generate: generateExplosion },
  { id: 'woosh', name: 'Woosh', emoji: '💨', category: 'Impacto', generate: generateWoosh },
];

/** Generate an AudioBuffer for a given effect ID */
export function generateEffectBuffer(ctx: AudioContext, effectId: string): AudioBuffer | null {
  const effect = SOUND_EFFECTS.find(e => e.id === effectId);
  if (!effect) return null;
  return effect.generate(ctx);
}

/** Generate a WAV Blob for a given effect */
export function effectToWav(ctx: AudioContext, effectId: string): Blob | null {
  const buffer = generateEffectBuffer(ctx, effectId);
  if (!buffer) return null;

  const pcmData = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sr * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length * (bitsPerSample / 8);
  const headerSize = 44;
  const wavBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(wavBuffer);

  // RIFF header
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  // Convert Float32 to Int16
  const int16 = new Int16Array(wavBuffer, headerSize);
  for (let i = 0; i < pcmData.length; i++) {
    const s = Math.max(-1, Math.min(1, pcmData[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }

  return new Blob([wavBuffer], { type: 'audio/wav' });
}

/** Play an effect through an AudioContext (returns the source node) */
export function playEffect(ctx: AudioContext, effectId: string, time: number = 0): AudioBufferSourceNode | null {
  const buffer = generateEffectBuffer(ctx, effectId);
  if (!buffer) return null;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(ctx.currentTime + time);
  return source;
}
