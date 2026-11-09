import { describe, expect, it } from 'vitest';
import { encodeMp3, encodeWav, extensionForMime, planExport, toInt16 } from '../utils/AudioExport';

const RATE = 48000;
/** One second of a stereo test tone: 440 Hz on the left, 660 Hz on the right */
function tone(seconds = 1): Float32Array[] {
  const n = Math.round(seconds * RATE);
  const l = new Float32Array(n), r = new Float32Array(n);
  for (let i = 0; i < n; i++) { l[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / RATE); r[i] = 0.5 * Math.sin(2 * Math.PI * 660 * i / RATE); }
  return [l, r];
}

describe('extensionForMime', () => {
  it('knows the formats browsers record and Lyria sends', () => {
    expect(extensionForMime('audio/webm;codecs=opus')).toBe('webm');
    expect(extensionForMime('audio/mp4')).toBe('m4a'); // Safari's recorder
    expect(extensionForMime('audio/mpeg')).toBe('mp3');
    expect(extensionForMime('AUDIO/WAV')).toBe('wav');
    expect(extensionForMime('')).toBeNull();
    expect(extensionForMime('application/octet-stream')).toBeNull();
  });
});

describe('planExport', () => {
  it('saves the original when it already is in the chosen format', () => {
    expect(planExport('webm', 'audio/webm;codecs=opus')).toEqual({ kind: 'original', ext: 'webm' });
    expect(planExport('mp3', 'audio/mpeg')).toEqual({ kind: 'original', ext: 'mp3' });
  });

  it('encodes WAV and MP3 from anything else', () => {
    expect(planExport('wav', 'audio/webm')).toEqual({ kind: 'encode', format: 'wav', ext: 'wav' });
    expect(planExport('mp3', 'audio/webm')).toEqual({ kind: 'encode', format: 'mp3', ext: 'mp3' });
    expect(planExport('wav', 'audio/mpeg')).toEqual({ kind: 'encode', format: 'wav', ext: 'wav' });
    expect(planExport('mp3', 'audio/mp4')).toEqual({ kind: 'encode', format: 'mp3', ext: 'mp3' });
  });

  it('never names a file .webm that is not WebM', () => {
    const song = planExport('webm', 'audio/mpeg');
    expect(song).toMatchObject({ kind: 'original', ext: 'mp3' });
    expect(song.note).toMatch(/only live recordings can be WebM/);
    expect(planExport('webm', 'audio/mp4')).toMatchObject({ kind: 'original', ext: 'm4a' });
    expect(planExport('webm', '')).toMatchObject({ kind: 'encode', format: 'wav', ext: 'wav' });
  });
});

describe('toInt16', () => {
  it('maps -1..1 to the 16-bit range and clamps beyond it', () => {
    expect(Array.from(toInt16(new Float32Array([0, 1, -1, 0.5, 2, -2])))).toEqual([0, 32767, -32768, 16384, 32767, -32768]);
  });
});

describe('encodeWav', () => {
  const [l, r] = tone(0.5);
  const wav = encodeWav([l, r], RATE);
  const v = new DataView(wav);
  const str = (at: number, len: number) => String.fromCharCode(...new Uint8Array(wav, at, len));

  it('writes a 16-bit stereo PCM header', () => {
    expect(str(0, 4)).toBe('RIFF');
    expect(str(8, 4)).toBe('WAVE');
    expect(str(12, 4)).toBe('fmt ');
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(2); // channels
    expect(v.getUint32(24, true)).toBe(RATE);
    expect(v.getUint32(28, true)).toBe(RATE * 4); // bytes per second
    expect(v.getUint16(32, true)).toBe(4); // bytes per frame
    expect(v.getUint16(34, true)).toBe(16); // bits
    expect(str(36, 4)).toBe('data');
  });

  it('has the right sizes', () => {
    expect(v.getUint32(40, true)).toBe(l.length * 4);
    expect(v.getUint32(4, true)).toBe(wav.byteLength - 8);
    expect(wav.byteLength).toBe(44 + l.length * 4);
  });

  it('interleaves left and right samples', () => {
    const at = 1000;
    expect(v.getInt16(44 + at * 4, true)).toBe(toInt16(l.subarray(at, at + 1))[0]);
    expect(v.getInt16(44 + at * 4 + 2, true)).toBe(toInt16(r.subarray(at, at + 1))[0]);
  });

  it('writes mono too', () => {
    const m = new DataView(encodeWav([l], RATE));
    expect(m.getUint16(22, true)).toBe(1);
    expect(m.getUint32(40, true)).toBe(l.length * 2);
  });
});

describe('encodeMp3', () => {
  /** Walks the MPEG-1 Layer III frames of an MP3 file: [frames, first frame's bitrate kbps, sample rate] */
  function frames(bytes: Uint8Array) {
    const KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
    const RATES = [44100, 48000, 32000];
    let i = 0, count = 0, kbps = 0, rate = 0;
    while (i + 4 <= bytes.length) {
      if (bytes[i] !== 0xff || (bytes[i + 1] & 0xe0) !== 0xe0) { i++; continue; }
      const br = KBPS[bytes[i + 2] >> 4], sr = RATES[(bytes[i + 2] >> 2) & 3], pad = (bytes[i + 2] >> 1) & 1;
      if (!br || !sr) { i++; continue; }
      if (!count) { kbps = br; rate = sr; }
      count++;
      i += Math.floor(144 * br * 1000 / sr) + pad;
    }
    return { count, kbps, rate };
  }
  const join = (parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };

  it('produces MPEG frames at 192 kbps, 48 kHz, as long as the take', async () => {
    const mp3 = join(await encodeMp3(tone(2), RATE));
    const f = frames(mp3);
    expect(f.kbps).toBe(192);
    expect(f.rate).toBe(RATE);
    const seconds = f.count * 1152 / RATE;
    expect(seconds).toBeGreaterThan(1.95);
    expect(seconds).toBeLessThan(2.15);
    // Constant bitrate: about 192 kbit per second of audio
    expect(mp3.length).toBeGreaterThan(2 * 192000 / 8 * 0.95);
    expect(mp3.length).toBeLessThan(2 * 192000 / 8 * 1.1);
  });

  it('takes another bitrate and mono', async () => {
    const f = frames(join(await encodeMp3([tone(1)[0]], RATE, { kbps: 128 })));
    expect(f.kbps).toBe(128);
    expect(f.count).toBeGreaterThan(38);
  });

  it('yields to the page while encoding a long take', async () => {
    let ticks = 0;
    const timer = setInterval(() => ticks++, 0);
    await encodeMp3(tone(3), RATE, { yieldEvery: 1152 * 4 });
    clearInterval(timer);
    expect(ticks).toBeGreaterThan(0);
  });
});

describe('encodeMp3 progress', () => {
  it('reports progress from 0 to 1, in order', async () => {
    const seen: number[] = [];
    await encodeMp3(tone(1), RATE, { yieldEvery: 0, onProgress: p => seen.push(p) });
    expect(seen[0]).toBe(0);
    expect(seen.at(-1)).toBe(1);
    expect(seen.length).toBeGreaterThan(10);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  });
});
