export function timeStretchPcmPreservePitch(pcm: Int16Array, speed: number): Int16Array {
  if (!Number.isFinite(speed) || speed <= 0) return pcm;
  if (Math.abs(speed - 1) < 0.001 || pcm.length < 2048) return pcm;

  const input = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) input[i] = pcm[i] / 32768;

  const targetLength = Math.max(1, Math.floor(input.length / speed));
  const grainSize = 1024;
  const stepOut = 256; // 75% overlap
  const stepIn = stepOut * speed;

  const output = new Float32Array(targetLength + grainSize);
  const weight = new Float32Array(targetLength + grainSize);

  const window = new Float32Array(grainSize);
  for (let i = 0; i < grainSize; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (grainSize - 1));
  }

  let inPos = 0;
  let outPos = 0;

  while (outPos < targetLength && inPos < input.length) {
    const inIndex = Math.floor(inPos);
    for (let j = 0; j < grainSize; j++) {
      const si = inIndex + j;
      const oi = outPos + j;
      if (si >= input.length || oi >= output.length) break;
      const w = window[j];
      output[oi] += input[si] * w;
      weight[oi] += w;
    }
    inPos += stepIn;
    outPos += stepOut;
  }

  const result = new Int16Array(targetLength);
  for (let i = 0; i < targetLength; i++) {
    const v = weight[i] > 1e-6 ? output[i] / weight[i] : 0;
    const s = Math.max(-1, Math.min(1, v));
    result[i] = s < 0 ? s * 32768 : s * 32767;
  }

  return result;
}
