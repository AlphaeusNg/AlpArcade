/**
 * Pulse Grid — jubeat-style 4×4 with classic Shutter marker.
 * Charts approximate official EXTREME note density / song structure:
 *   I'm so Happy · Albida · Flower · Evans
 * Judges on each panel · misses do not end the run.
 */
(function (global) {
  "use strict";

  const CELLS = 16;
  const WIN = { excellent: 45, great: 90, good: 140 };

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
        s.onerror = () => reject(new Error("YouTube API failed"));
        document.head.appendChild(s);
      }
      if (global.YT && global.YT.Player) resolve();
    });
    return ytApiPromise;
  }

  function note(t, panels) {
    return { t, panels: Array.isArray(panels) ? panels : [panels] };
  }

  /**
   * Chart helpers — panel map:
   *  0  1  2  3
   *  4  5  6  7
   *  8  9 10 11
   * 12 13 14 15
   */
  function buildChart(song) {
    const bpm = song.bpm;
    const beat = 60000 / bpm;
    const durationSec = song.durationSec || 100;
    const totalBeats = Math.ceil((durationSec * bpm) / 60);
    const notes = [];
    const push = (beatIndex, panels) => {
      if (beatIndex < 0 || beatIndex > totalBeats + 4) return;
      notes.push(note(Math.round(beatIndex * beat), panels));
    };

    // Shared streams used by real EXT charts
    const clock = [0, 1, 2, 3, 7, 11, 15, 14, 13, 12, 8, 4];
    const clockR = [...clock].reverse();
    const diag = [0, 5, 10, 15];
    const diagR = [3, 6, 9, 12];
    const cross = [1, 2, 4, 7, 8, 11, 13, 14];
    const center = [5, 6, 9, 10];
    const corners = [0, 3, 12, 15];
    const shuffle = [0, 5, 2, 7, 8, 13, 10, 15, 3, 6, 1, 4, 11, 14, 9, 12];
    const snake = [0, 1, 2, 3, 7, 6, 5, 4, 8, 9, 10, 11, 15, 14, 13, 12];
    const spiral = [5, 6, 10, 9, 1, 2, 7, 11, 14, 13, 8, 4, 0, 3, 15, 12];

    if (song.id === "imsosohappy") {
      // EXT ~806 notes · 1:40 · 183 BPM — dense 16ths, happy chords, center×corners
      // Intro (measures 0–7): sparse quarters → 8ths
      for (let b = 0; b < 16; b++) {
        push(b, b % 4 === 0 ? corners : [b % 16]);
      }
      for (let b = 16; b < 32; b++) {
        push(b, [clock[b % clock.length]]);
        if (b % 2 === 0) push(b + 0.5, [clockR[b % clockR.length]]);
      }
      // Body A — 16th streams + corner chords (classic Happy EXT)
      for (let m = 8; m < 28; m++) {
        const base = m * 4;
        const path = m % 2 === 0 ? clock : clockR;
        for (let i = 0; i < 16; i++) push(base + i * 0.25, [path[i % path.length]]);
        push(base, corners);
        push(base + 2, center);
        if (m % 2 === 0) {
          push(base + 1, [1, 2, 13, 14]);
          push(base + 3, [4, 7, 8, 11]);
        }
        if (m % 3 === 0) {
          for (let i = 0; i < 8; i++) push(base + i * 0.5 + 0.125, [snake[(i + m) % 16]]);
        }
      }
      // Chorus — multi-panel chords on downbeats + 16ths
      for (let m = 28; m < 42; m++) {
        const base = m * 4;
        push(base, corners);
        push(base + 1, center);
        push(base + 2, corners);
        push(base + 3, center);
        for (let i = 0; i < 16; i++) {
          push(base + i * 0.25, [spiral[(i + m * 3) % spiral.length]]);
        }
        if (m % 2 === 1) {
          push(base + 0.5, diag);
          push(base + 1.5, diagR);
          push(base + 2.5, diag);
          push(base + 3.5, diagR);
        }
      }
      // Finale — denser doubles
      for (let m = 42; m < 50; m++) {
        const base = m * 4;
        for (let i = 0; i < 16; i++) {
          push(base + i * 0.25, [shuffle[i]]);
          push(base + i * 0.25 + 0.125, [(shuffle[i] + 8) % 16]);
        }
        push(base, corners);
        push(base + 2, center);
      }
      // Outro hit
      push(totalBeats - 2, corners);
      push(totalBeats - 1, center);
      push(totalBeats, [0, 1, 2, 3, 4, 7, 8, 11, 12, 13, 14, 15]);
    } else if (song.id === "albida") {
      // EXT · BPM 185 · baroque columns + diagonal crosses (~2 min)
      for (let b = 0; b < 12; b++) push(b, [diag[b % 4]]);
      for (let m = 3; m < Math.floor(totalBeats / 4) - 2; m++) {
        const base = m * 4;
        // Column rolls (Albida signature verticals)
        for (let i = 0; i < 8; i++) {
          const col = (m + i) % 4;
          const pair = [col, col + 4, col + 8, col + 12].filter(
            (_, k) => k === i % 4 || k === (i + 2) % 4
          );
          push(base + i * 0.5, pair);
        }
        push(base, diag);
        push(base + 1, diagR);
        push(base + 2, corners);
        push(base + 3, center);
        // Renaissance ornaments
        for (let s = 0; s < 4; s++) {
          push(base + 0.25 + s, [(m * 3 + s * 5) % 16]);
          push(base + 0.75 + s, [(m * 7 + s * 3) % 16]);
        }
        if (m > 10) {
          for (let i = 0; i < 16; i++) push(base + i * 0.25, [(m * 5 + i * 3) % 16]);
        }
        if (m % 4 === 0) {
          push(base + 1.5, [0, 5, 10, 15, 3, 6, 9, 12]);
        }
      }
      push(totalBeats - 1, corners);
      push(totalBeats, center);
    } else if (song.id === "flower") {
      // EXT · BPM 173 · circular / petal streams (trance)
      const ring = [1, 2, 7, 11, 14, 13, 8, 4];
      const petals = [0, 3, 12, 15, 5, 6, 9, 10];
      for (let b = 0; b < 12; b++) {
        push(b, b % 2 === 0 ? center : [ring[b % ring.length]]);
      }
      for (let m = 3; m < Math.floor(totalBeats / 4) - 2; m++) {
        const base = m * 4;
        ring.forEach((p, i) => push(base + i * 0.5, [p]));
        push(base, center);
        push(base + 2, corners);
        for (let i = 0; i < 8; i++) {
          const a = (m + i) % 16;
          push(base + i * 0.5 + 0.25, [a, (a + 5) % 16]);
        }
        if (m % 2 === 1) {
          petals.forEach((p, i) => push(base + i * 0.5, [p]));
          push(base + 1, [1, 4, 7, 13]);
          push(base + 3, [2, 8, 11, 14]);
        }
        if (m > 12) {
          ring.forEach((p, i) => push(base + i * 0.25, [(p + 2) % 16]));
          for (let i = 0; i < 8; i++) push(base + i * 0.5 + 0.125, [spiral[i % spiral.length]]);
        }
        if (m % 4 === 0) push(base + 1.5, [0, 3, 5, 6, 9, 10, 12, 15]);
      }
      push(totalBeats - 2, ring);
      push(totalBeats - 1, center);
      push(totalBeats, corners);
    } else {
      // Evans EXT · BPM 180 · shuffle 16ths, classic hard denseness
      for (let b = 0; b < 8; b++) push(b, [shuffle[b]]);
      for (let m = 2; m < Math.floor(totalBeats / 4) - 2; m++) {
        const base = m * 4;
        // Main shuffle stream
        shuffle.forEach((p, i) => push(base + i * 0.25, [p]));
        // Off-beat counters (Evans density)
        if (m > 4) {
          for (let i = 0; i < 8; i++) {
            push(base + i * 0.5 + 0.125, [(shuffle[i] + 3) % 16]);
          }
        }
        if (m > 12) {
          for (let i = 0; i < 16; i++) {
            push(base + i * 0.25 + 0.125, [(shuffle[i] + 7) % 16]);
          }
        }
        // Anchor chords
        push(base, [0, 3]);
        push(base + 1, [12, 15]);
        push(base + 2, [0, 15]);
        push(base + 3, [3, 12]);
        if (m % 4 === 0) push(base + 1.5, center);
        if (m % 2 === 0) {
          push(base + 0.5, [5, 10]);
          push(base + 2.5, [6, 9]);
        }
      }
      push(totalBeats - 2, [0, 3, 12, 15]);
      push(totalBeats - 1, center);
      push(totalBeats, shuffle);
    }

    notes.sort((a, b) => a.t - b.t || a.panels[0] - b.panels[0]);
    return notes;
  }

  const SONGS = [
    {
      id: "imsosohappy",
      title: "I'm so Happy",
      artist: "Ryu☆",
      level: 10,
      bpm: 183,
      durationSec: 100, // official ~1:40
      color: "#f472b6",
      youtubeId: "9TFe1oHsb-s",
      notesHint: "EXT ~806",
    },
    {
      id: "albida",
      title: "Albida",
      artist: "DJ YOSHITAKA",
      level: 10,
      bpm: 185,
      durationSec: 118,
      color: "#38bdf8",
      youtubeId: "H-tHnjxkkNg",
      notesHint: "EXT",
    },
    {
      id: "flower",
      title: "Flower",
      artist: "DJ YOSHITAKA",
      level: 9,
      bpm: 173,
      durationSec: 125,
      color: "#c084fc",
      youtubeId: "3K6OnRqo4og",
      notesHint: "EXT",
    },
    {
      id: "evans",
      title: "Evans",
      artist: "DJ YOSHITAKA",
      level: 10,
      bpm: 180,
      durationSec: 122,
      color: "#fbbf24",
      youtubeId: "6FRGiRCbfr8",
      notesHint: "EXT ~718",
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
          <div><span class="hud-label">Miss</span><strong id="jb-miss">0</strong></div>
        </div>
        <div class="jb-meta mono" id="jb-meta"></div>
        <div class="jb-stage">
          <div class="jb-grid" id="jb-grid" role="grid" aria-label="jubeat 4 by 4"></div>
          <div class="jb-sr-judge" id="jb-sr-judge" aria-live="polite"></div>
          <div class="jb-progress"><div class="jb-progress-fill" id="jb-progress"></div></div>
        </div>
        <div class="jb-music" id="jb-music">
          <div id="jb-yt" class="jb-yt" aria-label="Song BGM"></div>
          <p class="jb-music-note mono" id="jb-music-note">Each chart plays its track · unmute if needed</p>
        </div>
        <p class="game-hint" id="jb-hint">Shutter marker · hit when blades close + TOUCH · miss never fails the chart</p>
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

    const cells = [];
    const cellVids = [];
    const cellJudgeTimers = Array(CELLS).fill(null);

    for (let i = 0; i < CELLS; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "jb-cell";
      btn.dataset.i = String(i);
      btn.setAttribute("aria-label", `Panel ${i + 1}`);
      // Classic shutter: 4 edge doors + 6 iris blades + TOUCH
      btn.innerHTML = `
        <video class="jb-cell-vid" muted playsinline preload="none" aria-hidden="true"></video>
        <span class="jb-shutter" aria-hidden="true">
          <span class="jb-door jb-door-n"></span>
          <span class="jb-door jb-door-s"></span>
          <span class="jb-door jb-door-e"></span>
          <span class="jb-door jb-door-w"></span>
          <span class="jb-iris">
            <span class="jb-blade" style="--i:0"></span>
            <span class="jb-blade" style="--i:1"></span>
            <span class="jb-blade" style="--i:2"></span>
            <span class="jb-blade" style="--i:3"></span>
            <span class="jb-blade" style="--i:4"></span>
            <span class="jb-blade" style="--i:5"></span>
          </span>
          <span class="jb-touch"><span class="jb-touch-a">TOUCH</span><span class="jb-touch-b">TOUCH</span></span>
        </span>
        <span class="jb-cell-judge" hidden aria-hidden="true"></span>`;
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        onPanel(i);
      });
      grid.appendChild(btn);
      cells.push(btn);
      cellVids.push(btn.querySelector(".jb-cell-vid"));
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
    let active = new Map();
    let approachMs = 520;
    let audioCtx = null;
    let ytPlayer = null;
    let ytVideoId = "";
    let useVideoClock = false;
    let destroyed = false;
    let clockStarted = false;

    function song() {
      return SONGS[songIndex];
    }

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function paintSongs() {
      songsEl.innerHTML = SONGS.map(
        (s, i) => `
        <button type="button" class="jb-song-chip${i === songIndex ? " is-active" : ""}" data-s="${i}" ${running ? "disabled" : ""} style="--sc:${s.color}">
          <strong>${escapeHtml(s.title)}</strong>
          <small>EXT ${s.level} · ${s.bpm} BPM · ${s.notesHint || ""}</small>
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

    function paintMeta() {
      const s = song();
      metaEl.innerHTML = `<span style="color:${s.color}">${escapeHtml(s.title)}</span>
        <span class="jb-diff">EXTREME ${s.level}</span>
        <span>${escapeHtml(s.artist)}</span>
        <span>${s.bpm} BPM</span>
        <span class="jb-bgm">♪ BGM · Shutter</span>`;
      grid.style.setProperty("--jb-accent", s.color);
    }

    function setCellJudge(panel, text, cls) {
      const el = cells[panel];
      if (!el) return;
      const j = el.querySelector(".jb-cell-judge");
      const vid = cellVids[panel];
      const key =
        cls === "excellent" || cls === "great" || cls === "good" || cls === "miss" ? cls : "miss";

      JUDGE_CLASSES.forEach((c) => el.classList.remove(c));
      el.classList.add(`is-judge-${key}`);
      el.classList.remove("is-approach", "is-armed");

      if (j) {
        j.hidden = false;
        j.textContent = text;
        j.className = "jb-cell-judge " + (cls || "");
      }
      if (vid && PANEL_VID[key]) {
        try {
          vid.pause();
          if (vid.getAttribute("src") !== PANEL_VID[key]) vid.src = PANEL_VID[key];
          vid.currentTime = 0;
          vid.classList.add("is-playing");
          const p = vid.play();
          if (p?.catch) p.catch(() => {});
        } catch {
          /* still image */
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

    function clearPanels() {
      cells.forEach((c, i) => {
        c.classList.remove("is-armed", "is-hit", "is-miss", "is-approach", ...JUDGE_CLASSES);
        c.style.removeProperty("--jb-p");
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
        ytPlayer?.pauseVideo?.();
      } catch {
        /* ignore */
      }
    }

    function ensureYtPlayer(videoId) {
      return loadYouTubeApi()
        .then(
          () =>
            new Promise((resolve) => {
              if (destroyed) return resolve(null);
              if (ytPlayer && ytVideoId === videoId) return resolve(ytPlayer);
              if (ytPlayer && typeof ytPlayer.loadVideoById === "function") {
                ytVideoId = videoId;
                try {
                  ytPlayer.cueVideoById({ videoId, startSeconds: 0 });
                } catch {
                  ytPlayer.loadVideoById(videoId);
                }
                return resolve(ytPlayer);
              }
              if (ytHost) ytHost.innerHTML = "";
              ytVideoId = videoId;
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
                  onError: () => resolve(ytPlayer),
                },
              });
            })
        )
        .catch(() => null);
    }

    function cuePreview(s) {
      if (!s?.youtubeId) return;
      ensureYtPlayer(s.youtubeId).then((p) => {
        try {
          p?.cueVideoById?.({ videoId: s.youtubeId, startSeconds: 0 });
        } catch {
          /* ignore */
        }
      });
      if (musicNoteEl) musicNoteEl.textContent = `♪ ${s.title} · ${s.artist}`;
    }

    function playBgm(s) {
      if (!s?.youtubeId) return Promise.resolve(false);
      return ensureYtPlayer(s.youtubeId).then((p) => {
        if (!p || destroyed) return false;
        try {
          p.loadVideoById?.({ videoId: s.youtubeId, startSeconds: 0 });
          p.unMute?.();
          p.setVolume?.(100);
          p.playVideo?.();
          if (musicNoteEl) musicNoteEl.textContent = `Now playing · ${s.title}`;
          return true;
        } catch {
          return false;
        }
      });
    }

    function blip(freq, dur = 0.05, gain = 0.03) {
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
      if (useVideoClock && ytPlayer?.getCurrentTime) {
        try {
          if (ytPlayer.getPlayerState?.() === 1) {
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
      cells[panel].classList.add("is-approach", "is-armed");
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
      missEl.textContent = String(counts.miss);
      combo = 0;
      comboEl.textContent = "0";
      setCellJudge(n.panel, "MISS", "miss");
      despawn(n.key, n.panel, true);
      global.ArcadeSFX?.foul?.() || global.ArcadeSFX?.tick?.();
      blip(120, 0.05, 0.025);
      // Misses never fail the chart
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

    function finish() {
      if (submitted) return;
      submitted = true;
      running = false;
      cancelAnimationFrame(raf);
      stopBgm();
      active.clear();
      clearPanels();
      startBtn.disabled = false;
      startBtn.textContent = "Play again";
      paintSongs();
      const s = song();
      const total = counts.excellent + counts.great + counts.good + counts.miss;
      const excRate = total ? Math.round((counts.excellent / total) * 100) : 0;
      hintEl.textContent = `${s.title} cleared · ${score} pts · EXC ${counts.excellent} · MISS ${counts.miss} · ${excRate}% EXC · max combo ${bestCombo}`;
      if (musicNoteEl) musicNoteEl.textContent = `♪ ${s.title} finished`;
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
          cleared: true,
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
        const left = n.t - t;
        // p = 0 at spawn, 1 at hit time (shutter fully closed)
        const p = 1 - Math.max(0, Math.min(1, left / approachMs));
        cells[n.panel].style.setProperty("--jb-p", String(p));
      }

      if (progEl) progEl.style.width = `${Math.min(100, (t / duration) * 100)}%`;

      if (chartIndex >= chart.length && active.size === 0 && t > duration) {
        finish();
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

    function warmPanelMedia() {
      Object.values(PANEL_ART).forEach((src) => {
        const img = new Image();
        img.src = src;
      });
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
      score = 0;
      combo = 0;
      bestCombo = 0;
      counts = { excellent: 0, great: 0, good: 0, miss: 0 };
      approachMs = Math.max(480, Math.round((60000 / s.bpm) * 1.75));
      scoreEl.textContent = "0";
      comboEl.textContent = "0";
      excEl.textContent = "0";
      missEl.textContent = "0";
      if (progEl) progEl.style.width = "0%";
      startBtn.disabled = true;
      startBtn.textContent = "Playing…";
      paintSongs();
      warmPanelMedia();
      const mins = Math.round((s.durationSec || 100) / 6) / 10;
      hintEl.textContent = `${s.title} · EXT ${s.level} · ~${mins} min · Shutter · ${chart.length} notes · miss OK`;
      global.ArcadeSFX?.go?.() || global.ArcadeSFX?.click?.();
      blip(523, 0.08, 0.04);
      setTimeout(() => blip(659, 0.08, 0.04), 200);
      setTimeout(() => blip(784, 0.1, 0.04), 400);

      const startAt = performance.now() + 650;
      playBgm(s).then(() => {
        if (!running || destroyed) return;
        setTimeout(() => beginChartClock(), Math.max(0, startAt - performance.now()));
      });
      setTimeout(() => beginChartClock(), 2200);
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
          ytPlayer?.destroy?.();
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
