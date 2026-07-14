(function (global) {
  "use strict";

  const MODES = [
    { id: "chill", label: "Chill", delayMin: 1400, delayMax: 3200, decoys: 0 },
    { id: "focus", label: "Focus", delayMin: 900, delayMax: 2600, decoys: 0 },
    { id: "chaos", label: "Chaos", delayMin: 600, delayMax: 2200, decoys: 2 },
  ];

  function mount(root, { onScore }) {
    let mode = 0;
    let round = 0;
    let bestInSession = null;
    let chain = 0; // successful hits in a row → auto escalate mode pressure
    let phase = "idle";
    let timer = null;
    let decoyTimers = [];
    let startAt = 0;
    let tries = 0;

    root.innerHTML = `
      <div class="reaction-wrap">
        <div class="diff-bar" id="rx-modes"></div>
        <div class="game-hud">
          <div><span class="hud-label">Last</span><strong id="rx-last">—</strong></div>
          <div><span class="hud-label">Best</span><strong id="rx-best">—</strong></div>
          <div><span class="hud-label">Chain</span><strong id="rx-chain">0</strong></div>
        </div>
        <button type="button" class="rx-pad wait" id="rx-pad">
          <span id="rx-msg">Tap to arm</span>
        </button>
        <p class="game-hint" id="rx-hint">Wait for green. Early click = foul. Chaos adds fake flashes.</p>
      </div>
    `;

    const pad = root.querySelector("#rx-pad");
    const msg = root.querySelector("#rx-msg");
    const lastEl = root.querySelector("#rx-last");
    const bestEl = root.querySelector("#rx-best");
    const chainEl = root.querySelector("#rx-chain");
    const modesEl = root.querySelector("#rx-modes");
    const hintEl = root.querySelector("#rx-hint");

    const saved = window.ArcadeScores?.getState()?.highScores?.reaction?.best;
    bestEl.textContent = saved != null ? `${saved} ms` : "—";

    function paintModes() {
      modesEl.innerHTML = MODES.map(
        (m, i) =>
          `<button type="button" class="diff-chip${i === mode ? " active" : ""}" data-m="${i}">${m.label}</button>`
      ).join("");
      modesEl.querySelectorAll("[data-m]").forEach((btn) => {
        btn.addEventListener("click", () => {
          mode = Number(btn.dataset.m);
          ArcadeSFX?.click();
          paintModes();
          hintEl.textContent =
            mode === 2 ? "Chaos: ignore orange flashes — only green counts." : "Wait for green.";
        });
      });
    }

    function clearTimers() {
      if (timer) clearTimeout(timer);
      timer = null;
      decoyTimers.forEach(clearTimeout);
      decoyTimers = [];
    }

    function setPhase(p, text, cls) {
      phase = p;
      msg.textContent = text;
      pad.className = "rx-pad " + cls;
    }

    function scheduleDecoys(cfg) {
      for (let i = 0; i < cfg.decoys; i++) {
        const t = setTimeout(() => {
          if (phase !== "wait") return;
          setPhase("wait", "Not yet…", "decoy");
          ArcadeSFX?.tick();
          setTimeout(() => {
            if (phase === "wait") setPhase("wait", "Wait for green…", "wait");
          }, 180);
        }, cfg.delayMin * 0.3 + Math.random() * (cfg.delayMax * 0.5));
        decoyTimers.push(t);
      }
    }

    function beginWait() {
      clearTimers();
      const cfg = MODES[mode];
      // chain pressure: slightly tighter delays
      const tight = Math.min(400, chain * 40);
      const delay = Math.max(
        400,
        cfg.delayMin - tight + Math.random() * (cfg.delayMax - cfg.delayMin)
      );
      setPhase("wait", "Wait for green…", "wait");
      ArcadeSFX?.countdown();
      scheduleDecoys(cfg);
      timer = setTimeout(() => {
        startAt = performance.now();
        setPhase("go", "NOW!", "go");
        ArcadeSFX?.go();
      }, delay);
    }

    function rating(ms) {
      if (ms < 170) return "alien";
      if (ms < 220) return "blazing";
      if (ms < 280) return "solid";
      return "human";
    }

    pad.addEventListener("click", () => {
      ArcadeSFX?.unlock();
      if (phase === "idle" || phase === "result") {
        beginWait();
        return;
      }
      if (phase === "wait") {
        clearTimers();
        chain = 0;
        chainEl.textContent = "0";
        setPhase("result", "Too soon! Tap to retry", "foul");
        ArcadeSFX?.foul();
        return;
      }
      if (phase === "go") {
        clearTimers();
        const ms = Math.round(performance.now() - startAt);
        tries += 1;
        round += 1;
        chain += 1;
        chainEl.textContent = String(chain);
        lastEl.textContent = `${ms} ms`;
        if (bestInSession == null || ms < bestInSession) bestInSession = ms;
        setPhase("result", `${ms} ms — ${rating(ms)}. Tap again!`, "result");
        ArcadeSFX?.match();
        // auto bump mode after long chain
        if (chain > 0 && chain % 4 === 0 && mode < MODES.length - 1) {
          mode += 1;
          paintModes();
          ArcadeSFX?.levelUp();
          hintEl.textContent = `Chain ${chain}! Mode → ${MODES[mode].label}`;
        }
        onScore?.({ score: ms, meta: { mode: MODES[mode].id, chain } });
        const b = window.ArcadeScores?.getState()?.highScores?.reaction?.best;
        bestEl.textContent = b != null ? `${b} ms` : "—";
      }
    });

    paintModes();

    return {
      destroy() {
        clearTimers();
        root.innerHTML = "";
      },
    };
  }

  global.GameReaction = { mount };
})(window);
