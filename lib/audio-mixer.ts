/**
 * Audio Mixer: combines TTS audio, background music, and sound effects
 * into a single audio buffer at specified timestamps.
 */

import { generateEffectBuffer } from './sound-effects';
import { pcmToWav } from './audio-converter';

export interface TimelineItem {
  id: string;
  type: 'effect' | 'music';
  /** For effects: the effect ID. For music: the URL */
  sourceId: string;
  /** Name for display */
  name: string;
  /** Start time in seconds */
  startTime: number;
  /** Volume 0-1 */
  volume: number;
}

/**
 * Mix TTS PCM audio with timeline items into a single AudioBuffer.
 */
export async function mixAudio(
  ctx: AudioContext,
  ttsPcm: Int16Array,
  ttsSampleRate: number,
  ttsSpeed: number,
  timelineItems: TimelineItem[],
  bgMusicUrl: string | null,
  bgMusicVolume: number,
  ttsStartTime: number = 0,
  bgMusicStartTime: number = 0,
  bgMusicEndTime: number | null = null,
  bgMusicTrimStart: number = 0,
  ttsTrimStart: number = 0,
  ttsTrimEnd: number | null = null,
): Promise<AudioBuffer> {
  // Calculate TTS duration accounting for speed and trim
  const ttsFullDuration = ttsPcm.length / ttsSampleRate / ttsSpeed;
  const effectiveTrimEnd = ttsTrimEnd ?? ttsFullDuration;
  const ttsDuration = effectiveTrimEnd - ttsTrimStart;

  // Find the longest timeline item to determine total duration
  let maxDuration = ttsStartTime + ttsDuration;
  for (const item of timelineItems) {
    const itemEnd = item.startTime + 3;
    if (itemEnd > maxDuration) maxDuration = itemEnd;
  }
  if (bgMusicUrl) {
    const musicEnd = bgMusicEndTime ?? (bgMusicStartTime + maxDuration);
    if (musicEnd > maxDuration) maxDuration = musicEnd;
  }

  // Add padding
  const totalDuration = maxDuration + 0.5;
  const outputSampleRate = ctx.sampleRate;
  const outputLength = Math.ceil(totalDuration * outputSampleRate);

  // Create offline context for rendering
  const offlineCtx = new OfflineAudioContext(1, outputLength, outputSampleRate);

  // 1. Add TTS track (at ttsStartTime)
  const ttsBuffer = offlineCtx.createBuffer(1, ttsPcm.length, ttsSampleRate);
  const ttsChannel = ttsBuffer.getChannelData(0);
  for (let i = 0; i < ttsPcm.length; i++) {
    ttsChannel[i] = ttsPcm[i] / 32768.0;
  }
  const ttsSource = offlineCtx.createBufferSource();
  ttsSource.buffer = ttsBuffer;
  ttsSource.playbackRate.value = ttsSpeed;
  ttsSource.connect(offlineCtx.destination);
  // Start at ttsStartTime on timeline, offset into buffer (converted from perceived to buffer time)
  const ttsBufferOffset = ttsTrimStart * ttsSpeed;
  const ttsBufferDuration = ttsDuration * ttsSpeed;
  ttsSource.start(ttsStartTime, ttsBufferOffset, ttsBufferDuration);

  // 2. Add background music (with start/end trimming and gain support)
  if (bgMusicUrl) {
    try {
      const response = await fetch(bgMusicUrl);
      const arrayBuffer = await response.arrayBuffer();
      const musicBuffer = await offlineCtx.decodeAudioData(arrayBuffer);
      const musicSource = offlineCtx.createBufferSource();
      musicSource.buffer = musicBuffer;
      musicSource.loop = true;

      const gainNode = offlineCtx.createGain();
      gainNode.gain.value = bgMusicVolume; // Can be > 1.0 for boost
      musicSource.connect(gainNode);
      gainNode.connect(offlineCtx.destination);
      // Start at bgMusicStartTime on timeline, offset bgMusicTrimStart into the file
      musicSource.start(bgMusicStartTime, bgMusicTrimStart);
      // Stop music at endTime if specified
      if (bgMusicEndTime !== null && bgMusicEndTime > bgMusicStartTime) {
        musicSource.stop(bgMusicEndTime);
      }
    } catch (e) {
      console.warn('Failed to add background music:', e);
    }
  }

  // 3. Add timeline effects
  for (const item of timelineItems) {
    if (item.type === 'effect') {
      // Generate effect using a temporary online context then copy
      const effectBuffer = generateEffectBuffer(ctx, item.sourceId);
      if (effectBuffer) {
        // Re-create buffer in offline context
        const offBuffer = offlineCtx.createBuffer(
          1,
          effectBuffer.length,
          effectBuffer.sampleRate
        );
        offBuffer.getChannelData(0).set(effectBuffer.getChannelData(0));

        const source = offlineCtx.createBufferSource();
        source.buffer = offBuffer;

        const gain = offlineCtx.createGain();
        gain.gain.value = item.volume;
        source.connect(gain);
        gain.connect(offlineCtx.destination);
        source.start(item.startTime);
      }
    }
  }

  // Render
  return await offlineCtx.startRendering();
}

/**
 * Convert mixed AudioBuffer to WAV Blob
 */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sr * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = data.length * (bitsPerSample / 8);
  const headerSize = 44;
  const wavBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(wavBuffer);

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

  const int16 = new Int16Array(wavBuffer, headerSize);
  for (let i = 0; i < data.length; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }

  return new Blob([wavBuffer], { type: 'audio/wav' });
}
