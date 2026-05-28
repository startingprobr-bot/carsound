/**
 * Audio Mixer: combines TTS audio, background music, and sound effects
 * into a single audio buffer at specified timestamps.
 */

import { loadEffectBuffer } from './sound-effects';
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
  /** Actual audio duration in seconds */
  duration?: number;
  /** Trim start offset in seconds within the effect */
  trimStart?: number;
  /** Trim end in seconds within the effect */
  trimEnd?: number;
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
  bgMusicFadeIn: number = 0,
  bgMusicFadeOut: number = 0,
  additionalBgTracks: Array<{
    url: string;
    startTime: number;
    endTime: number | null;
    trimStart: number;
    volume: number;
    fadeIn: number;
    fadeOut: number;
  }> = [],
): Promise<AudioBuffer> {
  // Calculate TTS duration accounting for speed and trim
  const ttsFullDuration = ttsPcm.length / ttsSampleRate / ttsSpeed;
  const effectiveTrimEnd = ttsTrimEnd ?? ttsFullDuration;
  const ttsDuration = effectiveTrimEnd - ttsTrimStart;

  // Find the longest timeline item to determine total duration
  let maxDuration = ttsStartTime + ttsDuration;
  for (const item of timelineItems) {
    const effTrimStart = item.trimStart ?? 0;
    const effTrimEnd = item.trimEnd ?? (item.duration ?? 3);
    const itemEnd = item.startTime + (effTrimEnd - effTrimStart);
    if (itemEnd > maxDuration) maxDuration = itemEnd;
  }
  if (bgMusicUrl) {
    const musicEnd = bgMusicEndTime ?? (bgMusicStartTime + maxDuration);
    if (musicEnd > maxDuration) maxDuration = musicEnd;
  }
  for (const track of additionalBgTracks) {
    const trackEnd = track.endTime ?? (track.startTime + 30);
    if (trackEnd > maxDuration) maxDuration = trackEnd;
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
      const clipEnd = bgMusicEndTime ?? (totalDuration - 0.05);
      const clipDuration = Math.max(0.05, clipEnd - bgMusicStartTime);
      const fadeInDur = Math.min(Math.max(0, bgMusicFadeIn), clipDuration);
      const fadeOutDur = Math.min(Math.max(0, bgMusicFadeOut), Math.max(0, clipDuration - fadeInDur));
      if (fadeInDur > 0) {
        gainNode.gain.setValueAtTime(0, bgMusicStartTime);
        gainNode.gain.linearRampToValueAtTime(bgMusicVolume, bgMusicStartTime + fadeInDur);
      } else {
        gainNode.gain.setValueAtTime(bgMusicVolume, bgMusicStartTime);
      }
      if (fadeOutDur > 0 && clipEnd > bgMusicStartTime) {
        const fadeOutStart = Math.max(bgMusicStartTime + fadeInDur, clipEnd - fadeOutDur);
        gainNode.gain.setValueAtTime(bgMusicVolume, fadeOutStart);
        gainNode.gain.linearRampToValueAtTime(0.0001, clipEnd);
      }
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

  // 2.1. Add extra background music tracks
  for (const track of additionalBgTracks) {
    try {
      const response = await fetch(track.url);
      const arrayBuffer = await response.arrayBuffer();
      const musicBuffer = await offlineCtx.decodeAudioData(arrayBuffer);
      const musicSource = offlineCtx.createBufferSource();
      musicSource.buffer = musicBuffer;
      musicSource.loop = true;

      const gainNode = offlineCtx.createGain();
      const clipEnd = track.endTime ?? (totalDuration - 0.05);
      const clipDuration = Math.max(0.05, clipEnd - track.startTime);
      const fadeInDur = Math.min(Math.max(0, track.fadeIn), clipDuration);
      const fadeOutDur = Math.min(Math.max(0, track.fadeOut), Math.max(0, clipDuration - fadeInDur));
      if (fadeInDur > 0) {
        gainNode.gain.setValueAtTime(0, track.startTime);
        gainNode.gain.linearRampToValueAtTime(track.volume, track.startTime + fadeInDur);
      } else {
        gainNode.gain.setValueAtTime(track.volume, track.startTime);
      }
      if (fadeOutDur > 0 && clipEnd > track.startTime) {
        const fadeOutStart = Math.max(track.startTime + fadeInDur, clipEnd - fadeOutDur);
        gainNode.gain.setValueAtTime(track.volume, fadeOutStart);
        gainNode.gain.linearRampToValueAtTime(0.0001, clipEnd);
      }
      musicSource.connect(gainNode);
      gainNode.connect(offlineCtx.destination);

      musicSource.start(track.startTime, track.trimStart);
      if (track.endTime !== null && track.endTime > track.startTime) {
        musicSource.stop(track.endTime);
      }
    } catch (e) {
      console.warn('Failed to add extra background music:', e);
    }
  }

  // 3. Add timeline effects
  for (const item of timelineItems) {
    if (item.type === 'effect') {
      try {
        // Load effect from MP3 file (uses online ctx for decoding, then copies to offline)
        const effectBuffer = await loadEffectBuffer(ctx, item.sourceId);
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
          const effOffset = item.trimStart ?? 0;
          const effPlayDuration = item.trimEnd != null ? item.trimEnd - effOffset : undefined;
          if (effPlayDuration != null) {
            source.start(item.startTime, effOffset, effPlayDuration);
          } else {
            source.start(item.startTime, effOffset);
          }
        }
      } catch (e) {
        console.warn(`Failed to load effect ${item.sourceId}:`, e);
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

/**
 * Convert mixed AudioBuffer to MP3 Blob (WhatsApp compatible)
 */
export async function audioBufferToMp3(buffer: AudioBuffer): Promise<Blob> {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;

  // Convert float32 to int16
  const pcm = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }

  try {
    // @ts-ignore
    const lamejsModule = await import('lamejs/lame.all.js');
    const lamejsFn = lamejsModule.default || lamejsModule;
    if (typeof lamejsFn === 'function') lamejsFn();
    const Mp3Encoder = lamejsFn.Mp3Encoder;
    if (!Mp3Encoder) throw new Error('Mp3Encoder not found');

    const mp3encoder = new Mp3Encoder(1, sr, 128);
    const mp3Data: Uint8Array[] = [];
    const blockSize = 1152;

    for (let i = 0; i < pcm.length; i += blockSize) {
      const chunk = pcm.subarray(i, i + blockSize);
      const buf = mp3encoder.encodeBuffer(chunk);
      if (buf.length > 0) mp3Data.push(buf);
    }
    const flush = mp3encoder.flush();
    if (flush.length > 0) mp3Data.push(flush);

    return new Blob(mp3Data as BlobPart[], { type: 'audio/mp3' });
  } catch (e) {
    console.warn('MP3 encoding failed, falling back to WAV:', e);
    return audioBufferToWav(buffer);
  }
}
