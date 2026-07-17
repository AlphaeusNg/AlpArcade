/**
 * Pulse Grid — jubeat-style 4×4 charts with real song BGM (YouTube).
 * Songs: I'm so Happy · Albida · Flower · Evans (EXTREME only).
 * Judges: EXCELLENT · GREAT · GOOD · MISS on each panel.
 * Too many misses (MAX_MISSES) fails the chart.
 */
(function (global) {
  "use strict";

  const COLS = 4;
  const CELLS = 16;
  /** Miss this many and the chart dies (classic jubeat pressure). */
  const MAX_MISSES = 8;

  // Timing windows vs note time (ms) — jubeat-like ladder
  const WIN = {
    excellent: 45,
    great: 90,
    good: 140,
  };

  /** Brown jubeat panel faces + short flash clips (relative to site root). */
  const PANEL_ART = {
    idle: "assets/jubeat/panel-idle.jpg",
    excellent: "assets/jubeat/panel-excellent.jpg",
    great: "assets/jubeat/panel-great.jpg",
    good: "assets/jubeat/panel-good.jpg",
    miss: "assets/jubeat/panel-miss.jpg",
  };
  const PANEL_VID = {
    excellent: "assets/jubeat/panel-excellent.mp4",
    great: "assets/jubeat/panel-great.mp4",
    good: "assets/jubeat/panel-good.mp4",
    miss: "assets/jubeat/panel-miss.mp4",
  };
  const JUDGE_CLASSES = ["is-judge-excellent", "is-judge-great", "is-judge-good", "is-judge-miss"];

  let ytApiPromise = null;

  function loadYouTubeApi() {
    if (global.YT && global.YT.Player) return Promise.resolve();
    if (ytApiPromise) return ytApiPromise;
    ytApiPromise = new Promise((resolve, reject) => {
      const prev = global.onYouTubeIframeAPIReady;
      global.onYouTubeIframeAPIReady = () => {
        try {
          prev?.();
        } catch {
          /* ignore */
        }
        resolve();
      };
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const s = document.createElement("script");
        s.src = "https://www.youtube.com/iframe_api";
        s.async = true;
        s.onerror = () => reject(new Error("YouTube API failed to load"));
        document.head.appendChild(s);
      }
      // Already present (race)
      if (global.YT && global.YT.Player) resolve();
    });
    return ytApiPromise;
  }

  /**
   * Chart helpers: build EXTREME streams on a 4×4 pad.
   * Panel map:  0  1  2  3
   *             4  5  6  7
   *             8  9 10 11
   *            12 13 14 15
   */
  function note(t, panels) {
    return { t, panels: Array.isArray(panels) ? panels : [panels] };
  }

  function buildChart(song) {
    const bpm = song.bpm;
    const beat = 60000 / bpm;
    // Target full chart length (~2.5–3.5 min) — never short “8 miss” runs
    const durationSec = song.durationSec || 180;
    const totalBeats = Math.ceil((durationSec * bpm) / 60);
    // One “measure” = 4 beats
    const totalMeasures = Math.max(32, Math.ceil(totalBeats / 4));
    const bodyStart = 4;
    const bodyEnd = totalMeasures - 4; // leave room for outro

    const notes = [];
    const push = (beatIndex, panels) => {
      if (beatIndex < 0 || beatIndex > totalBeats + 16) return;
      notes.push(note(Math.round(beatIndex * beat), panels));
    };

    // Intro — 4 measures
    for (let b = 0; b < bodyStart * 4; b++) {
      push(b, b % 4 === 0 ? [5, 6, 9, 10] : [b % 16]);
    }

    if (song.id === "imsosohappy") {
      // Dense happy-hardcore style: 16ths + corner chords + center cross
      for (let m = bodyStart; m < bodyEnd; m++) {
        const base = m * 4;
        const streams = [
          [0, 1, 2, 3, 7, 11, 15, 14, 13, 12, 8, 4],
          [0, 5, 10, 15, 14, 9, 4, 1, 6, 11, 7, 2],
          [3, 2, 1, 0, 4, 8, 12, 13, 14, 15, 11, 7],
          [12, 8, 4, 0, 1, 2, 3, 7, 11, 15, 10, 5],
        ];
        const stream = streams[m % streams.length];
        stream.forEach((p, i) => push(base + i * 0.25, p));
        push(base, [0, 3, 12, 15]);
        push(base + 2, [5, 6, 9, 10]);
        if (m % 2 === 0) push(base + 1.5, [1, 2, 13, 14]);
        if (m % 3 === 0) {
          push(base + 0.5, [4, 7]);
          push(base + 2.5, [8, 11]);
        }
        // Late chart denser doubles
        if (m > bodyStart + 20) {
          for (let i = 0; i < 8; i++) {
            push(base + i * 0.5 + 0.125, [(stream[i % stream.length] + 2) % 16]);
          }
        }
      }
    } else if (song.id === "albida") {
      for (let m = bodyStart; m < bodyEnd; m++) {
        const base = m * 4;
        for (let i = 0; i < 8; i++) {
          const col = (m + i) % 4;
          push(
            base + i * 0.5,
            [col, col + 4, col + 8, col + 12].filter((_, k) => k === i % 4 || k === (i + 1) % 4)
          );
        }
        push(base, [0, 5, 10, 15]);
        push(base + 1, [3, 6, 9, 12]);
        push(base + 2, [0, 3, 12, 15]);
        push(base + 3, [5, 6, 9, 10]);
        for (let s = 0; s < 4; s++) {
          push(base + 0.25 + s, [(m * 3 + s * 5) % 16]);
          push(base + 0.75 + s, [(m * 7 + s * 3) % 16]);
        }
        if (m > bodyStart + 16) {
          for (let i = 0; i < 16; i++) push(base + i * 0.25, [(m * 5 + i * 3) % 16]);
        }
      }
    } else if (song.id === "flower") {
      for (let m = bodyStart; m < bodyEnd; m++) {
        const base = m * 4;
        const ring = [1, 2, 7, 11, 14, 13, 8, 4];
        ring.forEach((p, i) => push(base + i * 0.5, p));
        push(base, [5, 6, 9, 10]);
        push(base + 2, [0, 3, 12, 15]);
        for (let i = 0; i < 8; i++) {
          const a = (m + i) % 16;
          const b = (a + 5) % 16;
          push(base + i * 0.5 + 0.25, [a, b]);
        }
        if (m % 2 === 1) {
          push(base + 1, [1, 4, 7, 13]);
          push(base + 3, [2, 8, 11, 14]);
        }
        if (m > bodyStart + 18) {
          ring.forEach((p, i) => push(base + i * 0.25, [(p + 2) % 16]));
        }
      }
    } else {
      // Evans — classic dense shuffle / hard 16ths
      for (let m = bodyStart; m < bodyEnd; m++) {
        const base = m * 4;
        const shuffle = [0, 5, 2, 7, 8, 13, 10, 15, 3, 6, 1, 4, 11, 14, 9, 12];
        shuffle.forEach((p, i) => push(base + i * 0.25, p));
        if (m > bodyStart + 8) {
          for (let i = 0; i < 8; i++) {
            push(base + i * 0.5 + 0.125, [(shuffle[i] + 3) % 16]);
          }
        }
        if (m > bodyStart + 24) {
          for (let i = 0; i < 16; i++) {
            push(base + i * 0.25 + 0.125, [(shuffle[i] + 7) % 16]);
          }
        }
        push(base, [0, 3]);
        push(base + 1, [12, 15]);
        push(base + 2, [0, 15]);
        push(base + 3, [3, 12]);
        if (m % 4 === 0) push(base + 1.5, [5, 6, 9, 10]);
      }
    }

    // Outro — last ~4 measures
    const endBeat = bodyEnd * 4;
    for (let b = 0; b < 12; b++) {
      push(endBeat + b * 0.5, b % 2 === 0 ? [5, 6, 9, 10] : [0, 3, 12, 15]);
    }
    push(endBeat + 6, [0, 1, 2, 3, 4, 7, 8, 11, 12, 13, 14, 15]);
    push(endBeat + 8, [5, 6, 9, 10]);

    notes.sort((a, b) => a.t - b.t || a.panels[0] - b.panels[0]);
    return notes;
  }

  /**
   * youtubeId — public OST / game audio uploads used as BGM (not redistributed).
   * audioOffsetMs — subtract from video time if the track has leading silence.
   */
  const SONGS = [
    {
      id: "imsosohappy",
      title: "I'm so Happy",
      artist: "Ryu☆",
      difficulty: "EXTREME",
      level: 10,
      bpm: 183,
      durationSec: 195,
      color: "#f472b6",
      youtubeId: "9TFe1oHsb-s",
      audioOffsetMs: 0,
    },
    {
      id: "albida",
      title: "Albida",
      artist: "DJ YOSHITAKA",
      difficulty: "EXTREME",
      level: 10,
      bpm: 155,
      durationSec: 200,
      color: "#38bdf8",
      youtubeId: "H-tHnjxkkNg",
      audioOffsetMs: 0,
    },
    {
      id: "flower",
      title: "Flower",
      artist: "DJ YOSHITAKA",
      difficulty: "EXTREME",
      level: 9,
      bpm: 173,
      durationSec: 185,
      color: "#c084fc",
      youtubeId: "3K6OnRqo4og",
      audioOffsetMs: 0,
    },
    {
      id: "evans",
      title: "Evans",
      artist: "DJ YOSHITAKA",
      difficulty: "EXTREME",
      level: 10,
      bpm: 180,
      durationSec: 210,
      color: "#fbbf24",
      youtubeId: "6FRGiRCbfr8",
      audioOffsetMs: 0,
    },
  ].map((s) => ({ ...s, chart: null }));

  function chartFor(song) {
    if (!song.chart) song.chart = buildChart(song);
    return song.chart;
  }

  function mount(root, { onScore }) {
    let songIndex = 0;

    root.innerHTML = `
      <div class="jubeat-wrap">
        <div class="jb-song-bar" id="jb-songs" role="tablist" aria-label="EXTREME charts"></div>
        <div class="game-hud">
          <div><span class="hud-label">Score</span><strong id="jb-score">0</strong></div>
          <div><span class="hud-label">Combo</span><strong id="jb-combo">0</strong></div>
          <div><span class="hud-label">EXC</span><strong id="jb-exc">0</strong></div>
          <div><span class="hud-label">Miss</span><strong id="jb-miss">0/${MAX_MISSES}</strong></div>
        </div>
        <div class="jb-meta mono" id="jb-meta"></div>
        <div class="jb-stage">
          <div class="jb-grid" id="jb-grid" role="grid" aria-label="jubeat 4 by 4"></div>
          <div class="jb-sr-judge" id="jb-sr-judge" aria-live="polite"></div>
          <div class="jb-progress"><div class="jb-progress-fill" id="jb-progress"></div></div>
        </div>
        <div class="jb-music" id="jb-music">
          <div id="jb-yt" class="jb-yt" aria-label="Song BGM"></div>
          <p class="jb-music-note mono" id="jb-music-note">Each chart plays its track via YouTube · unmute if needed</p>
        </div>
        <p class="game-hint" id="jb-hint">EXTREME · real BGM · judges on each panel · ${MAX_MISSES} misses = fail</p>
        <div class="game-actions">
          <button type="button" class="btn primary" id="jb-start">Start chart</button>
        </div>
      </div>
    `;

    const grid = root.querySelector("#jb-grid");
    const songsEl = root.querySelector("#jb-songs");
    const scoreEl = root.querySelector("#jb-score");
    const comboEl = root.querySelector("#jb-combo");
    const excEl = root.querySelector("#jb-exc");
    const missEl = root.querySelector("#jb-miss");
    const metaEl = root.querySelector("#jb-meta");
    const hintEl = root.querySelector("#jb-hint");
    const srJudgeEl = root.querySelector("#jb-sr-judge");
    const progEl = root.querySelector("#jb-progress");
    const startBtn = root.querySelector("#jb-start");
    const musicNoteEl = root.querySelector("#jb-music-note");
    const ytHost = root.querySelector("#jb-yt");

    /** @type {HTMLButtonElement[]} */
    const cells = [];
    /** @type {HTMLVideoElement[]} */
    const cellVids = [];
    /** @type {ReturnType<typeof setTimeout>[]} */
    const cellJudgeTimers = Array(CELLS).fill(null);
    for (let i = 0; i < CELLS; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "jb-cell";
      btn.dataset.i = String(i);
      btn.setAttribute("aria-label", `Panel ${i + 1}`);
      btn.innerHTML = `
        <video class="jb-cell-vid" muted playsinline preload="none" aria-hidden="true"></video>
        <span class="jb-ring" aria-hidden="true"></span>
        <span class="jb-core" aria-hidden="true"></span>
        <span class="jb-cell-judge" hidden aria-hidden="true"></span>`;
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        onPanel(i);
      });
      grid.appendChild(btn);
      cells.push(btn);
      cellVids.push(btn.querySelector(".jb-cell-vid"));
    }

    // Warm first frame of flash clips after a gesture (Start)
    function warmPanelMedia() {
      Object.values(PANEL_ART).forEach((src) => {
        const img = new Image();
        img.src = src;
      });
    }

    let running = false;
    let score = 0;
    let combo = 0;
    let bestCombo = 0;
    let counts = { excellent: 0, great: 0, good: 0, miss: 0 };
    let chart = [];
    let chartIndex = 0;
    let t0 = 0;
    let raf = 0;
    let submitted = false;
    let failedRun = false;
    /** active: key "t-panel" -> { t, panel, key } */
    let active = new Map();
    let approachMs = 520;
    let audioCtx = null;
    /** @type {YT.Player | null} */
    let ytPlayer = null;
    let ytVideoId = "";
    let useVideoClock = false;
    let destroyed = false;
    let clockStarted = false;

    function song() {
      return SONGS[songIndex];
    }

    function paintSongs() {
      songsEl.innerHTML = SONGS.map(
        (s, i) => `
        <button type="button" class="jb-song-chip${i === songIndex ? " is-active" : ""}" data-s="${i}" ${running ? "disabled" : ""} style="--sc:${s.color}">
          <strong>${escapeHtml(s.title)}</strong>
          <small>EXTREME ${s.level} · ${s.bpm} BPM · ♪</small>
        </button>`
      ).join("");
      songsEl.querySelectorAll("[data-s]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (running) return;
          songIndex = Number(btn.dataset.s);
          paintSongs();
          paintMeta();
          cuePreview(song());
          global.ArcadeSFX?.click?.();
        });
      });
    }

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function paintMeta() {
      const s = song();
      metaEl.innerHTML = `<span style="color:${s.color}">${escapeHtml(s.title)}</span>
        <span class="jb-diff">EXTREME ${s.level}</span>
        <span>${escapeHtml(s.artist)}</span>
        <span>${s.bpm} BPM</span>
        <span class="jb-bgm">♪ BGM</span>`;
      grid.style.setProperty("--jb-accent", s.color);
    }

    /** Flash panel art + optional short video + judge label on that square. */
    function setCellJudge(panel, text, cls) {
      const el = cells[panel];
      if (!el) return;
      const j = el.querySelector(".jb-cell-judge");
      const vid = cellVids[panel];
      const key = cls === "excellent" || cls === "great" || cls === "good" || cls === "miss" ? cls : "miss";

      JUDGE_CLASSES.forEach((c) => el.classList.remove(c));
      el.classList.add(`is-judge-${key}`);

      if (j) {
        j.hidden = false;
        j.textContent = text;
        j.className = "jb-cell-judge " + (cls || "");
      }

      // Short flash video when available (falls back to still face)
      if (vid && PANEL_VID[key]) {
        try {
          vid.pause();
          if (vid.getAttribute("src") !== PANEL_VID[key]) {
            vid.src = PANEL_VID[key];
          }
          vid.currentTime = 0;
          vid.classList.add("is-playing");
          const p = vid.play();
          if (p && typeof p.catch === "function") p.catch(() => {});
        } catch {
          /* still image still shows */
        }
      }

      if (cellJudgeTimers[panel]) clearTimeout(cellJudgeTimers[panel]);
      cellJudgeTimers[panel] = setTimeout(() => {
        JUDGE_CLASSES.forEach((c) => el.classList.remove(c));
        if (j) {
          j.hidden = true;
          j.textContent = "";
          j.className = "jb-cell-judge";
        }
        if (vid) {
          try {
            vid.pause();
            vid.classList.remove("is-playing");
          } catch {
            /* ignore */
          }
        }
      }, 520);
      if (srJudgeEl) srJudgeEl.textContent = text;
    }

    function paintMissHud() {
      missEl.textContent = `${counts.miss}/${MAX_MISSES}`;
      missEl.classList.toggle("is-danger", counts.miss >= MAX_MISSES - 2);
    }

    function clearPanels() {
      cells.forEach((c, i) => {
        c.classList.remove("is-armed", "is-hit", "is-miss", "is-approach", ...JUDGE_CLASSES);
        const j = c.querySelector(".jb-cell-judge");
        if (j) {
          j.hidden = true;
          j.textContent = "";
          j.className = "jb-cell-judge";
        }
        const vid = cellVids[i];
        if (vid) {
          try {
            vid.pause();
            vid.classList.remove("is-playing");
          } catch {
            /* ignore */
          }
        }
      });
      cellJudgeTimers.forEach((t, i) => {
        if (t) clearTimeout(t);
        cellJudgeTimers[i] = null;
      });
      active.clear();
    }

    function stopBgm() {
      useVideoClock = false;
      try {
        if (ytPlayer && typeof ytPlayer.pauseVideo === "function") {
          ytPlayer.pauseVideo();
        }
      } catch {
        /* ignore */
      }
    }

    function ensureYtPlayer(videoId) {
      return loadYouTubeApi()
        .then(
          () =>
            new Promise((resolve, reject) => {
              if (destroyed) {
                reject(new Error("destroyed"));
                return;
              }
              if (ytPlayer && ytVideoId === videoId) {
                resolve(ytPlayer);
                return;
              }
              if (ytPlayer && typeof ytPlayer.loadVideoById === "function") {
                ytVideoId = videoId;
                try {
                  ytPlayer.cueVideoById({ videoId, startSeconds: 0 });
                } catch {
                  ytPlayer.loadVideoById(videoId);
                }
                resolve(ytPlayer);
                return;
              }
              // Fresh player
              if (ytHost) ytHost.innerHTML = "";
              ytVideoId = videoId;
              // eslint-disable-next-line no-undef
              ytPlayer = new global.YT.Player(ytHost, {
                height: "152",
                width: "100%",
                videoId,
                host: "https://www.youtube-nocookie.com",
                playerVars: {
                  autoplay: 0,
                  controls: 1,
                  modestbranding: 1,
                  rel: 0,
                  playsinline: 1,
                  fs: 0,
                  origin: location.origin,
                },
                events: {
                  onReady: (e) => resolve(e.target),
                  onError: () => {
                    if (musicNoteEl) {
                      musicNoteEl.textContent =
                        "BGM unavailable (blocked or region) · chart still playable";
                    }
                    resolve(ytPlayer);
                  },
                },
              });
            })
        )
        .catch((err) => {
          if (musicNoteEl) {
            musicNoteEl.textContent = "BGM failed to load · chart still playable without audio";
          }
          console.warn("[jubeat] YouTube", err);
          return null;
        });
    }

    /** Quiet cue when selecting a song (does not autoplay until Start). */
    function cuePreview(s) {
      if (!s?.youtubeId) return;
      ensureYtPlayer(s.youtubeId).then((p) => {
        try {
          p?.cueVideoById?.({ videoId: s.youtubeId, startSeconds: 0 });
        } catch {
          /* ignore */
        }
      });
      if (musicNoteEl) {
        musicNoteEl.textContent = `♪ ${s.title} · ${s.artist} · Start chart to play BGM`;
      }
    }

    function playBgm(s) {
      if (!s?.youtubeId) return Promise.resolve(false);
      return ensureYtPlayer(s.youtubeId).then((p) => {
        if (!p || destroyed) return false;
        try {
          if (typeof p.loadVideoById === "function") {
            p.loadVideoById({ videoId: s.youtubeId, startSeconds: 0 });
          }
          p.unMute?.();
          p.setVolume?.(100);
          p.playVideo?.();
          if (musicNoteEl) {
            musicNoteEl.textContent = `Now playing · ${s.title} · ${s.artist}`;
          }
          return true;
        } catch (err) {
          console.warn("[jubeat] play", err);
          return false;
        }
      });
    }

    function blip(freq, dur = 0.06, gain = 0.035) {
      try {
        if (!audioCtx) {
          const C = window.AudioContext || window.webkitAudioContext;
          if (!C) return;
          audioCtx = new C();
        }
        if (audioCtx.state === "suspended") audioCtx.resume();
        const t = audioCtx.currentTime;
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = "square";
        o.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start(t);
        o.stop(t + dur + 0.02);
      } catch {
        /* ignore */
      }
    }

    function nowMs() {
      const s = song();
      const offset = s.audioOffsetMs || 0;
      // Prefer YouTube clock when playing for better song sync
      if (useVideoClock && ytPlayer && typeof ytPlayer.getCurrentTime === "function") {
        try {
          const state = ytPlayer.getPlayerState?.();
          // 1 = PLAYING
          if (state === 1) {
            return Math.max(0, ytPlayer.getCurrentTime() * 1000 - offset);
          }
        } catch {
          /* fall through */
        }
      }
      return performance.now() - t0;
    }

    function spawnNote(panel, hitTime) {
      const key = `${hitTime}-${panel}`;
      if (active.has(key)) return;
      active.set(key, { t: hitTime, panel, key });
      const el = cells[panel];
      el.classList.add("is-approach", "is-armed");
    }

    function despawn(key, panel, missed) {
      active.delete(key);
      const still = [...active.values()].some((n) => n.panel === panel);
      const el = cells[panel];
      if (!still) {
        el.classList.remove("is-approach", "is-armed");
        if (missed) {
          el.classList.add("is-miss");
          setTimeout(() => el.classList.remove("is-miss"), 160);
        }
      }
    }

    function registerMiss(n) {
      if (!running || submitted) return;
      counts.miss += 1;
      paintMissHud();
      combo = 0;
      comboEl.textContent = "0";
      setCellJudge(n.panel, "MISS", "miss");
      despawn(n.key, n.panel, true);
      global.ArcadeSFX?.foul?.() || global.ArcadeSFX?.tick?.();
      blip(120, 0.05, 0.025);
      if (counts.miss >= MAX_MISSES) {
        failChart();
      }
    }

    function failChart() {
      if (submitted) return;
      failedRun = true;
      // Stop first so leftover notes don't chain more misses
      running = false;
      cancelAnimationFrame(raf);
      active.clear();
      finish({ failed: true });
    }

    function onPanel(i) {
      global.ArcadeSFX?.unlock?.();
      if (!running) {
        start();
        return;
      }
      const t = nowMs();
      let best = null;
      let bestErr = Infinity;
      for (const n of active.values()) {
        if (n.panel !== i) continue;
        const err = Math.abs(t - n.t);
        if (err < bestErr) {
          bestErr = err;
          best = n;
        }
      }
      if (!best || bestErr > WIN.good) {
        // Empty tap — flash only, does not count as chart miss
        cells[i].classList.add("is-miss");
        setTimeout(() => cells[i].classList.remove("is-miss"), 120);
        global.ArcadeSFX?.tick?.();
        return;
      }

      let label = "GOOD";
      let cls = "good";
      let pts = 100;
      if (bestErr <= WIN.excellent) {
        label = "EXCELLENT";
        cls = "excellent";
        pts = 1000 + Math.min(200, combo * 3);
        counts.excellent += 1;
        blip(880 + (i % 4) * 40, 0.04, 0.03);
        global.ArcadeSFX?.match?.() || global.ArcadeSFX?.go?.();
      } else if (bestErr <= WIN.great) {
        label = "GREAT";
        cls = "great";
        pts = 700 + Math.min(120, combo * 2);
        counts.great += 1;
        blip(660, 0.04, 0.028);
        global.ArcadeSFX?.click?.();
      } else {
        label = "GOOD";
        cls = "good";
        pts = 300;
        counts.good += 1;
        blip(440, 0.04, 0.025);
        global.ArcadeSFX?.tick?.();
      }

      combo += 1;
      if (combo > bestCombo) bestCombo = combo;
      score += pts;
      scoreEl.textContent = String(score);
      comboEl.textContent = String(combo);
      excEl.textContent = String(counts.excellent);
      setCellJudge(i, label, cls);
      despawn(best.key, best.panel, false);
      cells[i].classList.add("is-hit");
      setTimeout(() => cells[i].classList.remove("is-hit"), 140);
    }

    function finish({ failed = false } = {}) {
      if (submitted) return;
      submitted = true;
      running = false;
      failedRun = failed;
      cancelAnimationFrame(raf);
      stopBgm();
      // Natural clear: drop leftover notes without counting (or fail-chaining)
      active.clear();
      clearPanels();
      startBtn.disabled = false;
      startBtn.textContent = "Play again";
      paintSongs();
      const s = song();
      const total = counts.excellent + counts.great + counts.good + counts.miss;
      const excRate = total ? Math.round((counts.excellent / total) * 100) : 0;
      if (failed) {
        hintEl.textContent = `FAILED · ${counts.miss}/${MAX_MISSES} misses · ${score} pts · EXC ${counts.excellent} · max combo ${bestCombo}`;
        if (musicNoteEl) {
          musicNoteEl.textContent = `♪ ${s.title} failed · try again`;
        }
        if (srJudgeEl) srJudgeEl.textContent = "FAILED";
        global.ArcadeSFX?.foul?.();
      } else {
        hintEl.textContent = `${s.title} cleared · ${score} pts · EXC ${counts.excellent} · MISS ${counts.miss} · ${excRate}% EXC · max combo ${bestCombo}`;
        if (musicNoteEl) {
          musicNoteEl.textContent = `♪ ${s.title} finished · Start again or pick another chart`;
        }
      }
      onScore?.({
        score,
        meta: {
          song: s.id,
          difficulty: "EXTREME",
          excellent: counts.excellent,
          great: counts.great,
          good: counts.good,
          miss: counts.miss,
          bestCombo,
          failed,
          cleared: !failed,
        },
      });
    }

    function frame() {
      if (!running || submitted) return;
      const t = nowMs();
      const s = song();
      const chart = chartFor(s);
      const duration = chart.length ? chart[chart.length - 1].t + 800 : 1000;

      while (chartIndex < chart.length && chart[chartIndex].t <= t + approachMs) {
        const n = chart[chartIndex++];
        n.panels.forEach((p) => spawnNote(p, n.t));
      }

      for (const n of [...active.values()]) {
        if (!running || submitted) break;
        if (t - n.t > WIN.good) registerMiss(n);
      }

      for (const n of active.values()) {
        const el = cells[n.panel];
        const left = n.t - t;
        const p = 1 - Math.max(0, Math.min(1, left / approachMs));
        el.style.setProperty("--jb-p", String(p));
      }

      if (progEl) progEl.style.width = `${Math.min(100, (t / duration) * 100)}%`;

      if (chartIndex >= chart.length && active.size === 0 && t > duration) {
        finish({ failed: false });
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    function beginChartClock() {
      if (clockStarted || !running || destroyed) return;
      clockStarted = true;
      t0 = performance.now();
      useVideoClock = !!(ytPlayer && song().youtubeId);
      raf = requestAnimationFrame(frame);
    }

    function start() {
      cancelAnimationFrame(raf);
      clearPanels();
      stopBgm();
      const s = song();
      chart = chartFor(s);
      chartIndex = 0;
      running = true;
      clockStarted = false;
      submitted = false;
      failedRun = false;
      score = 0;
      combo = 0;
      bestCombo = 0;
      counts = { excellent: 0, great: 0, good: 0, miss: 0 };
      approachMs = Math.max(420, Math.round(60000 / s.bpm) * 1.6);
      scoreEl.textContent = "0";
      comboEl.textContent = "0";
      excEl.textContent = "0";
      paintMissHud();
      if (progEl) progEl.style.width = "0%";
      startBtn.disabled = true;
      startBtn.textContent = "Playing…";
      paintSongs();
      warmPanelMedia();
      const mins = Math.round((s.durationSec || 180) / 6) / 10;
      hintEl.textContent = `${s.title} · EXTREME ${s.level} · ~${mins} min · ♪ BGM · ${MAX_MISSES} misses = fail`;
      global.ArcadeSFX?.go?.() || global.ArcadeSFX?.click?.();
      // Short count-in while BGM loads / starts
      blip(523, 0.08, 0.04);
      setTimeout(() => blip(659, 0.08, 0.04), 200);
      setTimeout(() => blip(784, 0.1, 0.04), 400);

      const startAt = performance.now() + 650;
      playBgm(s).then(() => {
        if (!running || destroyed) return;
        const wait = Math.max(0, startAt - performance.now());
        setTimeout(() => {
          if (!running || destroyed) return;
          beginChartClock();
        }, wait);
      });
      // Fallback clock if BGM is slow/blocked
      setTimeout(() => {
        beginChartClock();
      }, 2200);
    }

    startBtn.addEventListener("click", start);

    function onKey(e) {
      if (!running && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        start();
        return;
      }
      if (!running) return;
      const map = {
        "1": 0,
        "2": 1,
        "3": 2,
        "4": 3,
        q: 4,
        w: 5,
        e: 6,
        r: 7,
        a: 8,
        s: 9,
        d: 10,
        f: 11,
        z: 12,
        x: 13,
        c: 14,
        v: 15,
      };
      const k = e.key.toLowerCase();
      if (map[k] != null) {
        e.preventDefault();
        onPanel(map[k]);
      }
    }
    window.addEventListener("keydown", onKey);

    paintSongs();
    paintMeta();
    // Warm YouTube API + cue first song
    cuePreview(song());

    return {
      destroy() {
        destroyed = true;
        running = false;
        cancelAnimationFrame(raf);
        clearPanels();
        stopBgm();
        window.removeEventListener("keydown", onKey);
        try {
          if (ytPlayer && typeof ytPlayer.destroy === "function") ytPlayer.destroy();
        } catch {
          /* ignore */
        }
        ytPlayer = null;
        try {
          audioCtx?.close?.();
        } catch {
          /* ignore */
        }
        root.innerHTML = "";
      },
    };
  }

  global.GameJubeat = { mount };
})(window);
