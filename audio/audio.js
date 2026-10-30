// Генеративная музыка и звуки на Web Audio: ни одного аудиофайла.
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const KEY = 'smilex-quest-muted';

// нуар-джаз: Dm7 – G7 – Cmaj7 – A7 (бас-корень и аккорд)
const JAZZ = [
  { r: 38, c: [57, 60, 62, 65] }, { r: 43, c: [59, 62, 65, 69] },
  { r: 36, c: [59, 62, 64, 67] }, { r: 45, c: [61, 64, 67, 70] },
];
const DORIAN = [62, 64, 65, 67, 69, 71, 72, 74, 76];
const FINALE = [{ r: 36, c: [60, 64, 67, 72] }, { r: 43, c: [59, 62, 67, 71] }, { r: 45, c: [57, 60, 64, 69] }, { r: 41, c: [57, 60, 65, 69] }];

export function createAudio() {
  let ac = null, master = null, noiseBuf = null, mood = 'off', timer = null, step = 0, next = 0, muted = false;
  const buses = {};
  try { muted = localStorage.getItem(KEY) === '1'; } catch { /* без сохранения */ }

  function init() {
    if (ac || !(window.AudioContext || window.webkitAudioContext)) return;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = muted ? 0 : 0.8;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
      master.connect(lp).connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch { ac = null; }
  }
  const bus = (m) => buses[m] || (buses[m] = (() => { const g = ac.createGain(); g.gain.value = 0; g.connect(master); return g; })());

  function tone(out, t, midi, dur, { type = 'sine', vol = 0.15, atk = 0.01, lp = 3000, detune = 0 } = {}) {
    const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    o.type = type; o.frequency.value = hz(midi); o.detune.value = detune;
    f.type = 'lowpass'; f.frequency.value = lp;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + atk); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(out, t, dur, { vol = 0.1, hp = 4000, lp = 12000 } = {}) {
    const s = ac.createBufferSource(), g = ac.createGain(), a = ac.createBiquadFilter(), b = ac.createBiquadFilter();
    s.buffer = noiseBuf; a.type = 'highpass'; a.frequency.value = hp; b.type = 'lowpass'; b.frequency.value = lp;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(a).connect(b).connect(g).connect(out); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  const MOODS = {
    investigate: { eighth: 60 / 76 / 2, swing: 0.17, play(out, i, t) {
      const bar = JAZZ[Math.floor(i / 8) % 4], nextBar = JAZZ[(Math.floor(i / 8) + 1) % 4], s = i % 8;
      if (s % 2 === 0) { const walk = [bar.r, bar.r + 7, bar.r + 12, nextBar.r + 1][s / 2]; tone(out, t, walk, 0.5, { type: 'triangle', vol: 0.3, lp: 700, atk: 0.02 }); }
      if (s === 1 || s === 5) bar.c.forEach((m, k) => tone(out, t + k * 0.012, m, 0.9, { type: 'sine', vol: 0.05, lp: 2200 }));
      if (s === 2 || s === 6) noise(out, t, 0.12, { vol: 0.05, hp: 1800, lp: 8000 }); else noise(out, t, 0.05, { vol: 0.025 });
      if (Math.random() < 0.28 && s % 2 === 0) tone(out, t, rnd(DORIAN) + 12, 1.1, { type: 'sine', vol: 0.06, lp: 4000, atk: 0.005 });
    } },
    interrogation: { eighth: 60 / 58 / 2, swing: 0, play(out, i, t) {
      const s = i % 8;
      if (i % 64 === 0) { tone(out, t, 26, 8, { type: 'sawtooth', vol: 0.07, lp: 160, atk: 1.5 }); tone(out, t, 33, 8, { type: 'sawtooth', vol: 0.04, lp: 200, atk: 2, detune: 8 }); }
      if (s === 0 || s === 1) tone(out, t, 31, 0.35, { type: 'sine', vol: s ? 0.16 : 0.3, lp: 150, atk: 0.005 });
      if (Math.random() < 0.12) tone(out, t, rnd([74, 77, 81, 82]), 2.2, { type: 'sine', vol: 0.035, lp: 3500, atk: 0.01 });
    } },
    finale: { eighth: 60 / 92 / 2, swing: 0, play(out, i, t) {
      const bar = FINALE[Math.floor(i / 8) % 4], s = i % 8;
      if (s === 0) { tone(out, t, bar.r, 1.8, { type: 'triangle', vol: 0.3, lp: 600 }); bar.c.forEach((m) => tone(out, t, m - 12, 2.4, { type: 'sine', vol: 0.045, lp: 1800, atk: 0.2 })); }
      tone(out, t, bar.c[[0, 1, 2, 3, 2, 1, 3, 2][s]] + 12, 0.6, { type: 'sine', vol: 0.07, lp: 3500, atk: 0.005 });
      if (s === 0 || s === 4) noise(out, t, 0.1, { vol: 0.05, hp: 90, lp: 400 });
    } },
  };

  function pump() {
    const m = MOODS[mood];
    if (!ac || !m) return;
    const out = bus(mood);
    while (next < ac.currentTime + 0.4) {
      const t = next + (step % 2 ? m.swing * m.eighth : 0);
      try { m.play(out, step, Math.max(t, ac.currentTime)); } catch { /* пропускаем ноту */ }
      next += m.eighth; step++;
    }
  }

  return {
    get muted() { return muted; },
    unlock() { init(); if (ac && ac.state === 'suspended') ac.resume(); if (mood !== 'off') this.setMood(mood, true); },
    setMood(m, force = false) {
      if (m === mood && !force && timer) return;
      mood = m;
      if (!ac) return;
      for (const [k, g] of Object.entries(buses)) g.gain.setTargetAtTime(k === m ? 1 : 0, ac.currentTime, 0.6);
      clearInterval(timer); timer = null;
      if (!MOODS[m]) return;
      bus(m).gain.setTargetAtTime(1, ac.currentTime, 0.6);
      step = 0; next = ac.currentTime + 0.1;
      timer = setInterval(pump, 120); pump();
    },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch { /* без сохранения */ }
      if (master && ac) master.gain.setTargetAtTime(muted ? 0 : 0.8, ac.currentTime, 0.1);
      return muted;
    },
    sfx(name) {
      if (!ac || muted) return;
      const t = ac.currentTime, out = master;
      if (name === 'paper') noise(out, t, 0.18, { vol: 0.22, hp: 1500, lp: 7000 });
      else if (name === 'stamp') { tone(out, t, 33, 0.35, { type: 'sine', vol: 0.6, lp: 250, atk: 0.003 }); noise(out, t, 0.12, { vol: 0.25, hp: 300, lp: 3000 }); }
      else if (name === 'tick') tone(out, t, 88, 0.05, { type: 'square', vol: 0.05, lp: 2500, atk: 0.001 });
    },
  };
}
