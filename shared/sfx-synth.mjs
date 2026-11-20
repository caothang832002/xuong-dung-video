// Tự tổng hợp bộ tiếng động (không dùng tệp bên ngoài, không vướng bản quyền).
// Chạy được cả trên máy chủ lẫn trong trình duyệt.
const SR = 44100;

const wav = (samples) => {
  const out = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(out.buffer);
  const str = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, SR, true);
  v.setUint32(28, SR * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const g = peak > 0 ? 0.85 / peak : 1;
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i] * g)) * 32767), true);
  return out;
};

const make = (dur, fn) => {
  const n = Math.round(dur * SR);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / SR, i, n);
  // mờ 4 ms hai đầu để không lách tách
  const e = Math.round(0.004 * SR);
  for (let i = 0; i < e && i < n; i++) {
    out[i] *= i / e;
    out[n - 1 - i] *= i / e;
  }
  return out;
};

// Số ngẫu nhiên có hạt giống để tệp sinh ra lần nào cũng giống nhau.
const rng = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296 - 0.5;
};

const tone = (f, t) => Math.sin(2 * Math.PI * f * t);

const noiseSweep = (dur, f0, f1, seed) => {
  const r = rng(seed);
  let lp = 0;
  let bp = 0;
  return make(dur, (t) => {
    const p = t / dur;
    const fc = f0 * Math.pow(f1 / f0, p);
    const k = Math.min(0.99, (2 * Math.PI * fc) / SR);
    const x = r() * 2;
    lp += k * (x - lp);
    bp += k * 0.25 * (lp - bp);
    return (lp - bp) * Math.sin(Math.PI * p) ** 1.5;
  });
};

const mix = (dur, parts) => {
  const out = new Float64Array(Math.round(dur * SR));
  for (const [at, s, gain = 1] of parts) {
    const o = Math.round(at * SR);
    for (let i = 0; i < s.length && o + i < out.length; i++) out[o + i] += s[i] * gain;
  }
  return out;
};

const bell = (f, dur, decay = 6) => make(dur, (t) => (tone(f, t) + 0.4 * tone(f * 2.01, t) + 0.2 * tone(f * 3.02, t)) * Math.exp(-t * decay));

const SOUNDS = {
  pop: () => make(0.16, (t) => tone(520 * Math.exp(-t * 14) + 120, t) * Math.exp(-t * 26)),
  ting: () => bell(1568, 0.9, 5),
  click: () => {
    const r = rng(7);
    return make(0.05, (t) => (r() * 0.7 + tone(2400, t) * 0.6) * Math.exp(-t * 160));
  },
  whoosh: () => noiseSweep(0.55, 400, 5200, 11),
  vut_len: () => make(0.4, (t) => tone(300 + 2600 * (t / 0.4) ** 2, t) * Math.sin((Math.PI * t) / 0.4) * 0.8),
  dung: () => mix(0.7, [[0, bell(784, 0.3, 9)], [0.13, bell(1175, 0.55, 6)]]),
  sai: () => make(0.45, (t) => (Math.sign(tone(150, t)) * 0.5 + Math.sign(tone(155, t)) * 0.5) * Math.exp(-t * 4) * (t < 0.2 || t > 0.25 ? 1 : 0.1)),
  tada: () => mix(1.4, [[0, bell(523, 0.5, 7)], [0.1, bell(659, 0.5, 7)], [0.2, bell(784, 0.5, 7)], [0.32, bell(1047, 1.05, 3.2), 1.2], [0.32, bell(784, 1.05, 3.2), 0.6]]),
  lap_lanh: () => mix(1.2, [2093, 2637, 3136, 2349, 3520, 2794, 4186].map((f, i) => [i * 0.09, bell(f, 0.55, 8), 0.8])),
  go_phim: () => {
    const r = rng(23);
    const one = (seed) => {
      const q = rng(seed);
      return make(0.04, (t) => (q() + tone(1800 + seed * 40, t) * 0.4) * Math.exp(-t * 190));
    };
    const parts = [];
    let at = 0;
    for (let i = 0; i < 9; i++) {
      parts.push([at, one(i + 3), 0.7 + r() * 0.4]);
      at += 0.07 + (r() + 0.5) * 0.06;
    }
    return mix(at + 0.06, parts);
  },
  tang_dan: () => {
    const n = noiseSweep(1.6, 200, 7000, 31);
    const s = make(1.6, (t) => tone(110 + 500 * (t / 1.6) ** 2, t) * (t / 1.6) ** 2 * 0.5);
    const env = make(1.6, (t) => (t / 1.6) ** 1.8);
    const out = new Float64Array(n.length);
    for (let i = 0; i < out.length; i++) out[i] = (n[i] * 1.6 + s[i]) * env[i];
    return out;
  },
  bum: () => {
    const r = rng(41);
    let lp = 0;
    return make(1.1, (t) => {
      lp += 0.04 * (r() * 2 - lp);
      return tone(95 * Math.exp(-t * 5) + 38, t) * Math.exp(-t * 3.2) + lp * Math.exp(-t * 9) * 0.9;
    });
  },
};

export const SFX_NAMES = Object.keys(SOUNDS);

/** Trả về tệp WAV (Uint8Array) và thời lượng của một tiếng động. */
export const synthSfx = (name) => {
  const bytes = wav(SOUNDS[name]());
  return { bytes, dur: (bytes.length - 44) / 2 / SR };
};
