/**
 * Lightweight Web Audio SFX — no external files.
 */
(function (global) {
  "use strict";

  const MUTE_KEY = "alphaeus-arcade-mute";
  let ctx = null;
  let muted = localStorage.getItem(MUTE_KEY) === "1";

  function ac() {
    if (muted) return null;
    if (typeof window === "undefined") return null;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      // still allow sounds unless muted; reduced motion users can mute
    }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    if (!ctx) ctx = new C();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  function tone({ freq = 440, type = "sine", dur = 0.12, gain = 0.08, slide = 0, delay = 0 }) {
    const c = ac();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noise({ dur = 0.15, gain = 0.05, filterFreq = 1200 }) {
    const c = ac();
    if (!c) return;
    const len = Math.ceil(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = filterFreq;
    const g = c.createGain();
    const t0 = c.currentTime;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(c.destination);
    src.start(t0);
    src.stop(t0 + dur);
  }

  const SFX = {
    isMuted() {
      return muted;
    },
    setMuted(v) {
      muted = !!v;
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
      return muted;
    },
    toggleMute() {
      return SFX.setMuted(!muted);
    },
    unlock() {
      ac();
    },
    click() {
      tone({ freq: 520, type: "triangle", dur: 0.05, gain: 0.05 });
    },
    place() {
      tone({ freq: 380, type: "square", dur: 0.07, gain: 0.04 });
    },
    move() {
      tone({ freq: 220, type: "triangle", dur: 0.04, gain: 0.03 });
    },
    shoot() {
      tone({ freq: 880, type: "square", dur: 0.06, gain: 0.04, slide: -500 });
    },
    hit() {
      tone({ freq: 180, type: "sawtooth", dur: 0.08, gain: 0.05, slide: -80 });
      noise({ dur: 0.08, gain: 0.03, filterFreq: 900 });
    },
    explode() {
      noise({ dur: 0.22, gain: 0.07, filterFreq: 400 });
      tone({ freq: 120, type: "sawtooth", dur: 0.2, gain: 0.06, slide: -90 });
    },
    eat() {
      tone({ freq: 520, type: "sine", dur: 0.07, gain: 0.06 });
      tone({ freq: 780, type: "sine", dur: 0.08, gain: 0.05, delay: 0.05 });
    },
    levelUp() {
      [523, 659, 784, 1046].forEach((f, i) =>
        tone({ freq: f, type: "triangle", dur: 0.12, gain: 0.055, delay: i * 0.07 })
      );
    },
    win() {
      [523, 659, 784].forEach((f, i) =>
        tone({ freq: f, type: "sine", dur: 0.14, gain: 0.07, delay: i * 0.09 })
      );
    },
    lose() {
      tone({ freq: 300, type: "sawtooth", dur: 0.18, gain: 0.05, slide: -180 });
      tone({ freq: 180, type: "triangle", dur: 0.25, gain: 0.05, delay: 0.1, slide: -60 });
    },
    draw() {
      tone({ freq: 400, type: "triangle", dur: 0.1, gain: 0.05 });
      tone({ freq: 400, type: "triangle", dur: 0.1, gain: 0.04, delay: 0.12 });
    },
    go() {
      tone({ freq: 880, type: "square", dur: 0.1, gain: 0.07 });
      tone({ freq: 1175, type: "square", dur: 0.12, gain: 0.06, delay: 0.05 });
    },
    foul() {
      tone({ freq: 140, type: "sawtooth", dur: 0.2, gain: 0.06 });
    },
    flip() {
      tone({ freq: 640, type: "triangle", dur: 0.05, gain: 0.04 });
    },
    match() {
      tone({ freq: 700, type: "sine", dur: 0.08, gain: 0.055 });
      tone({ freq: 933, type: "sine", dur: 0.1, gain: 0.05, delay: 0.06 });
    },
    tick() {
      tone({ freq: 900, type: "square", dur: 0.03, gain: 0.03 });
    },
    countdown() {
      tone({ freq: 440, type: "sine", dur: 0.08, gain: 0.05 });
    },
  };

  global.ArcadeSFX = SFX;
})(window);
