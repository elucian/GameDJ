/**
 * Export: the downloaded file really is in the chosen format.
 *  - WAV: encoded here from the decoded take (16-bit PCM).
 *  - MP3: the original file when it already is MP3 (a Lyria 3.5 song: no quality lost), otherwise encoded at 192 kbps
 *    with LAME (@breezystack/lamejs, LGPL-3.0, loaded only when needed as its own file).
 *  - WEBM: only the browser's live recording can be WebM (browsers encode WebM in real time only); a song is saved
 *    in its own format.
 */

export type ExportFormat = 'mp3' | 'wav' | 'webm';

/** How a take is saved: as the file the app already has, or encoded from the decoded audio */
export type ExportPlan = { kind: 'original'; ext: string; note?: string } | { kind: 'encode'; format: 'wav' | 'mp3'; ext: string; note?: string };

/** The file extension for an audio MIME type ('audio/webm;codecs=opus' -> 'webm'); null when unknown */
export function extensionForMime(mime: string): string | null {
  const t = mime.toLowerCase().split(';')[0].trim();
  const map: Record<string, string> = {
    'audio/webm': 'webm', 'video/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'video/mp4': 'm4a',
    'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
    'audio/wave': 'wav', 'audio/vnd.wave': 'wav', 'audio/flac': 'flac',
  };
  return map[t] ?? null;
}

/** What to do for the chosen format, given the MIME type of the file the take already has */
export function planExport(format: ExportFormat, sourceMime: string): ExportPlan {
  const ext = extensionForMime(sourceMime);
  if (ext === format) return { kind: 'original', ext };
  if (format === 'wav' || format === 'mp3') return { kind: 'encode', format, ext: format };
  // WEBM asked for something that is not WebM: keep the original under its real extension, or a WAV when its
  // format is unknown (never a file named .webm that is not WebM)
  const why = 'only live recordings can be WebM';
  return ext ? { kind: 'original', ext, note: `saved as ${ext.toUpperCase()}: ${why}` } : { kind: 'encode', format: 'wav', ext: 'wav', note: `saved as WAV: ${why}` };
}

/** Float samples (-1..1) to 16-bit integers, clamped */
export function toInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}

/** A 16-bit PCM WAV file (RIFF) of one or two channels of the same length */
export function encodeWav(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const n = channels.length;
  const frames = channels[0]?.length ?? 0;
  const dataBytes = frames * n * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const str = (at: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + dataBytes, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, n, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * n * 2, true); v.setUint16(32, n * 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, dataBytes, true);
  const pcm = channels.map(toInt16);
  let at = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < n; c++) { v.setInt16(at, pcm[c][i], true); at += 2; }
  }
  return buf;
}

/** MP3 frame size in samples (LAME encodes in blocks of this many frames) */
const MP3_BLOCK = 1152;

export interface Mp3Options {
  kbps?: number;
  /** Yield to the page every this many frames (0: never, as in a worker) */
  yieldEvery?: number;
  /** Called with 0..1 as the encoding goes on (about every 2%) */
  onProgress?: (done: number) => void;
}

/** An MP3 file (constant bitrate, default 192 kbps) of one or two channels, as the encoded parts in order. */
export async function encodeMp3(channels: Float32Array[], sampleRate: number, opts: Mp3Options = {}): Promise<Uint8Array<ArrayBuffer>[]> {
  const { kbps = 192, yieldEvery = MP3_BLOCK * 40, onProgress } = opts;
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const n = Math.min(2, channels.length);
  const enc = new Mp3Encoder(n, sampleRate, kbps);
  const pcm = channels.slice(0, n).map(toInt16);
  const frames = pcm[0]?.length ?? 0;
  const parts: Uint8Array<ArrayBuffer>[] = [];
  const keep = (b: Uint8Array) => { if (b.length) parts.push(new Uint8Array(b)); };
  const step = Math.max(MP3_BLOCK, Math.ceil(frames / 50 / MP3_BLOCK) * MP3_BLOCK);
  for (let i = 0; i < frames; i += MP3_BLOCK) {
    const l = pcm[0].subarray(i, i + MP3_BLOCK);
    keep(n === 2 ? enc.encodeBuffer(l, pcm[1].subarray(i, i + MP3_BLOCK)) : enc.encodeBuffer(l));
    if (onProgress && i % step === 0) onProgress(i / frames);
    if (yieldEvery > 0 && i > 0 && i % yieldEvery === 0) await new Promise(r => setTimeout(r, 0));
  }
  keep(enc.flush());
  onProgress?.(1);
  return parts;
}

/** Messages between the page and the MP3 worker (utils/mp3.worker.ts) */
export type Mp3WorkerRequest = { channels: Float32Array[]; sampleRate: number; kbps: number };
export type Mp3WorkerReply = { progress: number } | { parts: Uint8Array<ArrayBuffer>[] } | { error: string };

/**
 * MP3 encoding in a background thread (LAME in JavaScript takes about 10 s per minute of stereo audio), so the page
 * and the live audio never wait for it. Falls back to encoding in the page where workers are not available.
 */
export function encodeMp3InWorker(channels: Float32Array[], sampleRate: number, onProgress?: (done: number) => void, kbps = 192): Promise<Uint8Array<ArrayBuffer>[]> {
  if (typeof Worker === 'undefined') return encodeMp3(channels, sampleRate, { kbps, onProgress });
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./mp3.worker.ts', import.meta.url), { type: 'module' });
    const done = () => worker.terminate();
    worker.onmessage = (e: MessageEvent<Mp3WorkerReply>) => {
      const m = e.data;
      if ('progress' in m) onProgress?.(m.progress);
      else if ('parts' in m) { done(); resolve(m.parts); }
      else { done(); reject(new Error(m.error)); }
    };
    worker.onerror = (e) => { done(); reject(new Error(e.message || 'MP3 encoder failed')); };
    // Copies: the take's own sample memory stays with the page (it is still played back)
    const copies = channels.slice(0, 2).map(c => c.slice());
    const req: Mp3WorkerRequest = { channels: copies, sampleRate, kbps };
    worker.postMessage(req, copies.map(c => c.buffer));
  });
}

/** The channels of a decoded take (stereo kept, more channels cut to two) */
export function channelsOf(buffer: AudioBuffer): Float32Array[] {
  return Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, c) => buffer.getChannelData(c));
}
