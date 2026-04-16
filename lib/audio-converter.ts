/**
 * Utility to convert raw PCM data to audio formats
 */

export function base64ToPcm(base64: string): Int16Array {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  // Gemini returns 16-bit PCM
  return new Int16Array(bytes.buffer);
}

/** Convert PCM Int16 mono data to a WAV Blob */
export function pcmToWav(pcmData: Int16Array, sampleRate: number = 24000): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length * (bitsPerSample / 8);
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM
  view.setUint16(20, 1, true);  // Audio format: PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // PCM samples
  const output = new Int16Array(buffer, headerSize);
  output.set(pcmData);

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/** Convert PCM to MP3 using lamejs bundled version */
export async function pcmToMp3(pcmData: Int16Array, sampleRate: number = 24000): Promise<Blob> {
  try {
    // Use the bundled version that works correctly
    // @ts-ignore
    const lamejsModule = await import('lamejs/lame.all.js');
    const lamejsFn = lamejsModule.default || lamejsModule;
    if (typeof lamejsFn === 'function') {
      lamejsFn(); // Initialize - attaches Mp3Encoder to itself
    }
    const Mp3Encoder = lamejsFn.Mp3Encoder;
    if (!Mp3Encoder) throw new Error('Mp3Encoder not found');

    const channels = 1;
    const kbps = 128;
    const mp3encoder = new Mp3Encoder(channels, sampleRate, kbps);
    const mp3Data: Uint8Array[] = [];
    const sampleBlockSize = 1152;

    for (let i = 0; i < pcmData.length; i += sampleBlockSize) {
      const sampleChunk = pcmData.subarray(i, i + sampleBlockSize);
      const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
    }

    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }

    return new Blob(mp3Data as BlobPart[], { type: 'audio/mp3' });
  } catch (e) {
    console.warn('MP3 encoding failed, falling back to WAV:', e);
    return pcmToWav(pcmData, sampleRate);
  }
}
