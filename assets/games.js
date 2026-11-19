/* Welloby arcade: Spawn Guessr (find a spot from the live 3D map) and Elytra Dive (a glide under the sealed Nether roof).
   Best scores are kept in localStorage on this device only. */
(() => {
  "use strict";
  const W = window.WELLOBY || {};
  const cab = document.querySelector("[data-cab]");
  if (!cab) return;
  const $ = (s, el = cab) => el.querySelector(s);
  const $$ = (s, el = cab) => Array.from(el.querySelectorAll(s));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const fmt = n => Math.round(n).toLocaleString("en-US");
  const toast = t => window.dispatchEvent(new CustomEvent("welloby:toast", { detail: t }));
  const store = {
    get(k, d) { try { const v = localStorage.getItem("welloby." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("welloby." + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  async function copy(text, what) {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; }
    catch (e) {
      const f = document.createElement("textarea");
      f.value = text; f.readOnly = true; f.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0";
      document.body.append(f); f.select();
      try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
      f.remove();
    }
    toast(ok ? "Copied " + what : "Couldn't copy. Select the text and copy it yourself.");
  }
  function fit(canvas) {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; return true; }
    return false;
  }
  const bestEl = $("[data-cab-best]");
  let current = "guessr", GS = null, ED = null;
  function paintBest() {
    const src = current === "elytra" ? ED : GS;
    if (bestEl && src) bestEl.textContent = src.best();
  }

  /* ================= Spawn Guessr, on the live 3D map ================= */
  GS = (() => {
    const G = W.guessr || {};
    const root = $("[data-gs]");
    const M3 = window.wellobyMap3d;
    if (!root) return { show() {}, best() { return ""; } };
    const frame = $("[data-gs-frame]"), veil = $("[data-gs-veil]"), over = $("[data-gs-over]"), cap = $("[data-gs-cap]");
    const read = $("[data-gs-read]"), roundEl = $("[data-gs-round]"), scoreEl = $("[data-gs-score]");
    const diffIn = $("[data-gs-diff]"), diffName = $("[data-gs-diff-name]"), diffSize = $("[data-gs-diff-size]");
    const hintBtn = $("[data-gs-hint]"), goBtn = $("[data-gs-go]");
    // the look at each spot: camera distance in blocks, tilt (higher is flatter), turning speed, what the slider says
    const DIFFS = [
      ["Easy", 240, 1.0, .22, "high, turning view"],
      ["Normal", 150, 1.1, .15, "turning view"],
      ["Hard", 95, 1.15, 0, "still view"],
      ["Expert", 60, 1.2, 0, "close, still view"],
      ["Insane", 35, 1.3, 0, "eye level, still"]
    ];
    const ROUNDS = 5;
    const inBox = r => s => Math.max(Math.abs(s[0]), Math.abs(s[1])) <= r;
    const AREAS = {
      inner: { label: "near spawn", span: 2000, spots: (G.spots || []).filter(inBox(960)), view: { x: 0, z: 0, distance: 2300 } },
      full: { label: "out to 5,000", span: 10000, spots: (G.far || []).filter(inBox(4950)), view: { x: 0, z: 0, distance: 11500 } }
    };
    if (!AREAS.full.spots.length) AREAS.full.spots = AREAS.inner.spots;
    let diff = Math.min(4, Math.max(0, store.get("guessr.diff", 1) | 0));
    let area = store.get("guessr.area", "inner") === "full" ? "full" : "inner";
    let client = null, ok = false, failed = false, wantStart = false, offline = false;
    let state = "idle", rounds = [], round = 0, total = 0, hint = false, guess = null, last = [], result = null, cam = null, veilT = 0;
    const A = () => AREAS[area];
    const usable = !!(M3 && M3.embeddable && frame);

    function connectMap() {
      if (client || !usable) return;
      failed = false;
      client = M3.connect(frame, ev => {
        if (ev.wl === "ready") {
          ok = true; client.send({ wl: "clean", on: true });
          if (wantStart) { wantStart = false; start(); } else paintOver();
        } else if (ev.wl === "timeout") { if (!ok) { failed = true; client = null; wantStart = false; paintOver(); } }
        else if (ev.wl === "camera") cam = ev;
        else if (ev.wl === "click" && state === "guess") setGuess(ev.x, ev.z);
      });
      frame.src = M3.url + M3.hashFor({ map: "world", x: 0, z: 0, distance: A().view.distance, mode: "flat" });
      paintOver();
    }
    function pick() {
      const all = A().spots.slice(), out = [];
      for (let tries = 0; out.length < ROUNDS && all.length && tries < 500; tries++) {
        const i = (Math.random() * all.length) | 0, s = all[i];
        if (out.every(o => Math.hypot(o[0] - s[0], o[1] - s[1]) > A().span / 9) || tries > 250) { out.push(s); all.splice(i, 1); }
      }
      return out;
    }
    function points(d) {
      if (d <= 4) return 1000;
      return Math.round(1000 * Math.exp(-d / (A().span * 0.107)));
    }
    function title(t) {
      return t >= 4500 ? "Map maker" : t >= 3500 ? "Old-timer" : t >= 2500 ? "Highway regular" : t >= 1500 ? "Spawn wanderer" : t >= 700 ? "Fresh spawn" : "Lost in the woods";
    }
    const bestKey = () => diff + "-" + area;
    function best() {
      const b = store.get("guessr3d.best", {});
      return b[bestKey()] != null ? "Best on " + DIFFS[diff][0] + ", " + A().label + ": " + fmt(b[bestKey()]) : "No best yet on " + DIFFS[diff][0] + ", " + A().label;
    }
    function veilFor(ms) {
      clearTimeout(veilT); veil.dataset.on = "1";
      veilT = setTimeout(() => { veil.dataset.on = "0"; }, ms);
    }

    /* ui */
    function paintSettings() {
      diffIn.value = diff;
      diffName.textContent = DIFFS[diff][0];
      diffSize.textContent = DIFFS[diff][4];
      diffIn.setAttribute("aria-valuetext", DIFFS[diff][0] + ", " + DIFFS[diff][4]);
      $$("[data-gs-area]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.gsArea === area)));
      const lock = state === "look" || state === "guess" || state === "reveal";
      diffIn.disabled = lock;
      $$("[data-gs-area]").forEach(b => { b.disabled = lock; });
    }
    // the help bot's button steps aside only while a round is on screen, so it never covers the game buttons
    let inView = false;
    new IntersectionObserver(es => { inView = es.some(e => e.isIntersecting && e.intersectionRatio > .15); sync(); }, { threshold: [0, .15, .4] }).observe(root);
    function sync() { document.documentElement.classList.toggle("gs-on", inView && !root.hidden && (state === "look" || state === "guess" || state === "reveal")); }
    function paintBar() {
      root.dataset.state = state;
      sync();
      if (state === "idle") { roundEl.textContent = ROUNDS + " rounds"; scoreEl.textContent = "Up to 1,000 points each"; }
      else if (state === "done") { roundEl.textContent = "Finished"; scoreEl.textContent = fmt(total) + " points"; }
      else { roundEl.textContent = "Round " + (round + 1) + " of " + ROUNDS; scoreEl.textContent = fmt(total) + " points"; }
      hintBtn.hidden = !(state === "look" || state === "guess");
      hintBtn.disabled = state === "look" && hint;
      hintBtn.innerHTML = state === "guess" ? "Look again" : "Look wider <small>costs 30%</small>";
      goBtn.disabled = !(state === "look" || state === "guess" || state === "reveal");
      goBtn.textContent = state === "look" ? "Make a guess" : state === "guess" ? "Lock in guess" : state === "reveal" ? (round + 1 < ROUNDS ? "Next round" : "See your score") : "Make a guess";
      cap.textContent = state === "look" ? "Where on the map is this?" + (hint ? " Wider view." : "")
        : state === "guess" ? "Top-down map, north is up. " + (guess ? "Pin dropped. Click again to move it." : "Click to drop your pin.")
        : state === "reveal" ? "Orange is where it was, white is your guess." : "";
      paintBest();
    }
    function paintOver() {
      over.hidden = state === "look" || state === "guess" || state === "reveal";
      if (over.hidden) return;
      if (state === "done") {
        const isBest = result.isBest, prev = result.prev;
        over.innerHTML = '<div class="go-card"><p class="go-kicker">' + DIFFS[diff][0] + ", " + A().label + '</p><h3>' + fmt(total) + ' <small>of ' + fmt(ROUNDS * 1000) + '</small></h3>' +
          '<p class="go-title">' + title(total) + (isBest ? '. <b>New best.</b>' : '. Your best is ' + fmt(prev) + '.') + '</p>' +
          '<ol class="go-rounds">' + last.map((r, i) => '<li><span>' + (i + 1) + '</span>' + fmt(r.d) + ' blocks off<b>' + fmt(r.p) + '</b></li>').join("") + '</ol>' +
          '<p class="go-acts"><button type="button" class="btn btn-lava" data-gs-start>Play again</button><button type="button" class="btn btn-line btn-s" data-gs-copy><svg class="i"><use href="#i-share"/></svg>Copy score</button></p></div>';
        return;
      }
      if (!usable || offline) {
        over.innerHTML = '<div class="go-card"><h3>Spawn Guessr</h3><p>This game runs on the live 3D map, which can\'t load inside this page right now. Elytra Dive works in the meantime.</p>' +
          (M3 && M3.fallback ? '<p class="go-acts"><a class="btn btn-line btn-s" href="' + M3.fallback + '" target="_blank" rel="noopener">Open the 3D map in a new tab</a></p>' : '') + '</div>';
        return;
      }
      const busy = wantStart || (!!client && !ok);
      over.innerHTML = '<div class="go-card"><h3>Spawn Guessr</h3><p>You get a 3D look at a real spot on the server. Then drop a pin on the top-down map where you think it is. ' +
        ROUNDS + ' rounds, up to 1,000 points each. The closer, the more points.</p>' +
        (failed ? '<p><b>The 3D map didn\'t answer.</b> Check your connection and try again.</p>' : '') +
        '<p class="go-acts"><button type="button" class="btn btn-lava" data-gs-start' + (busy ? " disabled" : "") + '>' +
        (busy ? "Loading the 3D map" : failed ? "Try again" : "Start") + '</button></p></div>';
    }
    function paintAll() { paintOver(); paintSettings(); paintBar(); }

    /* rounds */
    function look(fresh) {
      const s = rounds[round], d = DIFFS[diff], k = hint ? 2.2 : 1;
      state = "look";
      veilFor(fresh ? 1300 : 700);
      if (fresh) client.send({ wl: "pins", pins: [] });
      client.send({ wl: "view", map: "world", x: s[0] + .5, z: s[1] + .5, distance: d[1] * k, angle: hint ? Math.min(d[2], .95) : d[2],
        rotation: fresh ? Math.random() * 6.283 : undefined, mode: "perspective", fly: 0 });
      client.send({ wl: "orbit", speed: reduced.matches ? 0 : (d[3] || (hint ? .12 : 0)) });
      paintAll();
    }
    function start() {
      if (!usable) return;
      if (!ok) {
        if (wantStart) return;
        wantStart = true; paintOver();
        M3.check().then(up => { if (up) connectMap(); else { offline = true; wantStart = false; paintOver(); } });
        return;
      }
      rounds = pick(); round = 0; total = 0; last = []; hint = false; guess = null;
      if (rounds.length < ROUNDS) { toast("Not enough spots in this area yet. Try near spawn."); return; }
      look(true);
      read.textContent = "Round 1. Look around, then make your guess.";
    }
    function toGuess() {
      state = "guess";
      client.send({ wl: "orbit", speed: 0 });
      veilFor(500);
      const v = A().view, at = guess ? { x: guess[0], z: guess[1], distance: Math.min(v.distance, 900) } : v;
      client.send({ wl: "view", map: "world", x: at.x, z: at.z, distance: at.distance, mode: "flat", fly: 0 });
      if (guess) client.send({ wl: "pins", pins: [{ x: guess[0], z: guess[1], kind: "guess", label: "Your guess" }] });
      paintAll();
      read.textContent = "Click where you think it was, or line up the cross and lock it in. Drag to move, scroll or pinch to zoom.";
    }
    function setGuess(x, z) {
      guess = [Math.round(x), Math.round(z)];
      client.send({ wl: "pins", pins: [{ x: guess[0], z: guess[1], kind: "guess", label: "Your guess" }] });
      paintBar();
      read.textContent = "Pin at x " + fmt(guess[0]) + ", z " + fmt(guess[1]) + ". Lock it in, or click again to move it.";
    }
    function confirm() {
      if (state === "look") { toGuess(); return; }
      if (state === "guess") {
        const g = guess || (cam && cam.mode === "flat" ? [cam.x, cam.z] : null);
        if (!g) { read.textContent = "Click the map to drop your pin first."; return; }
        guess = g;
        const s = rounds[round], d = Math.hypot(s[0] - g[0], s[1] - g[1]);
        const p = Math.round(points(d) * (hint ? .7 : 1));
        total += p; last.push({ d, p });
        state = "reveal";
        client.send({ wl: "pins", line: true, pins: [{ x: g[0], z: g[1], kind: "guess", label: "Your guess" }, { x: s[0], z: s[1], kind: "real", label: "It was here" }] });
        client.send({ wl: "view", mode: "flat", x: (s[0] + g[0]) / 2, z: (s[1] + g[1]) / 2, distance: Math.max(170, d * 1.9), fly: reduced.matches ? 0 : 1200 });
        read.textContent = fmt(d) + " blocks off. +" + fmt(p) + " points" + (hint ? " (wider view)" : "") + ". It was at x " + fmt(s[0]) + ", z " + fmt(s[1]) + ".";
        paintAll();
        goBtn.focus({ preventScroll: true });
        return;
      }
      if (state === "reveal") {
        if (round + 1 < ROUNDS) {
          round++; hint = false; guess = null;
          look(true);
          read.textContent = "Round " + (round + 1) + ". Look around, then make your guess.";
        } else finish();
      }
    }
    function finish() {
      state = "done";
      read.textContent = "Done. " + fmt(total) + " points.";
      const key = bestKey(), b = store.get("guessr3d.best", {}), prev = b[key];
      result = { isBest: prev == null || total > prev, prev };
      if (result.isBest) { b[key] = total; store.set("guessr3d.best", b); }
      client.send({ wl: "pins", pins: rounds.map((s, i) => ({ x: s[0], z: s[1], kind: "real", label: String(i + 1) })) });
      const v = A().view;
      client.send({ wl: "view", mode: "flat", x: v.x, z: v.z, distance: v.distance, fly: reduced.matches ? 0 : 900 });
      paintAll();
      const again = over.querySelector("[data-gs-start]"); if (again) again.focus({ preventScroll: true });
    }

    over.addEventListener("click", e => {
      if (e.target.closest("[data-gs-start]")) start();
      else if (e.target.closest("[data-gs-copy]")) copy("welloby spawn guessr: " + fmt(total) + " / " + fmt(ROUNDS * 1000) + " on " + DIFFS[diff][0] + " (" + A().label + "). " + title(total).toLowerCase() + ". think you know spawn better? welloby.com", "your score");
    });
    goBtn.addEventListener("click", confirm);
    hintBtn.addEventListener("click", () => {
      if (state === "look" && !hint) { hint = true; look(false); read.textContent = "Wider view. This round now scores 70%."; }
      else if (state === "guess") { look(false); read.textContent = "Back at the spot. Make your guess when you're ready."; }
    });
    diffIn.addEventListener("input", () => { diff = +diffIn.value; store.set("guessr.diff", diff); paintSettings(); paintBest(); });
    $$("[data-gs-area]").forEach(b => b.addEventListener("click", () => {
      if (b.disabled) return;
      area = b.dataset.gsArea; store.set("guessr.area", area); paintSettings(); paintBest();
    }));
    paintSettings(); paintBar(); paintOver();
    return { show() { sync(); }, sync, best };
  })();

  /* ================= Elytra Dive ================= */
  ED = (() => {
    const root = $("[data-ed]"), stage = $("[data-ed-stage]"), cv = $("[data-ed-canvas]"), over = $("[data-ed-over]");
    const rocketBtn = $("[data-ed-rocket]"), rocketsEl = $("[data-ed-rockets]");
    if (!root || !cv) return { show() {}, hide() {}, best() { return ""; } };
    const g = cv.getContext("2d");
    const H = 48;                          // cave height in blocks, lava at 0, sealed roof at H
    const MODES = {
      chill: { label: "Chill", gap0: 23, gapMin: 15, space: [50, 64], w: [4, 7], narrow: 900 },
      normal: { label: "Normal", gap0: 19, gapMin: 12, space: [42, 54], w: [4, 8], narrow: 700 },
      brutal: { label: "Brutal", gap0: 16, gapMin: 10, space: [34, 44], w: [5, 9], narrow: 520 }
    };
    let mode = MODES[store.get("elytra.mode", "normal")] ? store.get("elytra.mode", "normal") : "normal";
    let state = "ready", holding = false, raf = 0, lastT = 0, visible = false, shake = 0, overAt = 0;
    let p, pillars, pickups, sparks, nextX, lastGap, rockets, boost, why, wallSeed;

    function reset() {
      p = { x: 0, y: 30, v: 17, a: 0, stall: false };
      pillars = []; pickups = []; sparks = []; nextX = 70; lastGap = 28; rockets = 3; boost = 0; why = ""; shake = 0;
      wallSeed = Math.random() * 1000;
      while (nextX < 400) addPillar();
      rocketsEl.textContent = rockets;
    }
    const rnd = (a, b) => a + Math.random() * (b - a);
    function addPillar() {
      const m = MODES[mode], gap = Math.max(m.gapMin, m.gap0 - nextX / m.narrow);
      const lo = gap / 2 + 3, hi = H - gap / 2 - 3;
      const c = Math.max(lo, Math.min(hi, lastGap + rnd(-13, 13)));
      const w = Math.round(rnd(m.w[0], m.w[1]));
      const top = Math.round(c + gap / 2), bot = top - Math.round(gap);
      pillars.push({ x: nextX, w, top, bot, seed: Math.random() * 1e4 });
      if (Math.random() < .32) pickups.push({ x: nextX + w / 2, y: (top + bot) / 2, got: false, ph: Math.random() * 6 });
      lastGap = c; nextX = Math.round(nextX + w + rnd(m.space[0], m.space[1]));
    }
    function hash(a, b) { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); }

    /* physics: holding raises the nose, letting go lowers it; speed follows the pitch.
       Below 6.5 blocks a second the wing stalls and the nose drops until it has 9 again. */
    function step(dt) {
      p.stall = p.v < 6.5 || (p.stall && p.v < 9);
      if (p.stall) p.a = Math.max(-.9, p.a - 1.76 * dt);
      else if (holding) p.a = Math.min(.75, p.a + 1.5 * dt);
      else p.a = Math.max(-.9, p.a - 1.1 * dt);
      let acc = -20 * Math.sin(p.a) - .2 * p.v;
      if (boost > 0) { boost -= dt; acc += p.v < 34 ? 32 : 4; }
      p.v = Math.max(2, p.v + acc * dt);
      p.x += p.v * Math.cos(p.a) * dt;
      p.y += p.v * Math.sin(p.a) * dt;
      while (nextX < p.x + 400) addPillar();
      pillars = pillars.filter(q => q.x + q.w > p.x - 80);
      pickups = pickups.filter(q => q.x > p.x - 80);
      // collisions with a slightly forgiving box
      const hw = 1.6, hh = .7;
      if (p.y + hh > H - 1) return crash("You hit the roof");
      if (p.y - hh < 1.2) return crash("You fell in the lava");
      for (const q of pillars) {
        if (p.x + hw > q.x && p.x - hw < q.x + q.w && (p.y + hh > q.top || p.y - hh < q.bot)) return crash("You hit basalt");
      }
      for (const k of pickups) {
        if (!k.got && Math.abs(k.x - p.x) < 2.2 && Math.abs(k.y - p.y) < 2.2) {
          k.got = true; rockets = Math.min(9, rockets + 1); rocketsEl.textContent = rockets;
          for (let i = 0; i < 10; i++) sparks.push({ x: k.x, y: k.y, vx: rnd(-6, 6), vy: rnd(-6, 6), life: 0, max: rnd(.3, .7), c: "#ffd27a" });
        }
      }
      if (Math.random() < dt * 30) sparks.push({ x: p.x + rnd(-40, 140), y: rnd(.5, 3), vx: rnd(-1, 1), vy: rnd(3, 9), life: 0, max: rnd(.8, 2), c: Math.random() < .5 ? "#ff8b47" : "#ffb347" });
      if (boost > 0 && Math.random() < dt * 60) sparks.push({ x: p.x - 1.4, y: p.y, vx: -p.v * .3 + rnd(-3, 3), vy: rnd(-3, 3), life: 0, max: rnd(.2, .5), c: Math.random() < .5 ? "#f3ecdb" : "#ff6a1f" });
      for (const s of sparks) { s.life += dt; s.x += s.vx * dt; s.y += s.vy * dt; }
      sparks = sparks.filter(s => s.life < s.max);
    }
    function crash(text) {
      why = text; state = "over"; overAt = performance.now(); holding = false;
      document.documentElement.classList.remove("game-on");
      if (!reduced.matches) shake = .35;
      for (let i = 0; i < 26; i++) sparks.push({ x: p.x, y: p.y, vx: rnd(-14, 14), vy: rnd(-14, 14), life: 0, max: rnd(.3, .9), c: i % 3 ? "#ff6a1f" : "#f3ecdb" });
      const b = store.get("elytra.best", {}), dist = Math.floor(p.x), prev = b[mode];
      const isBest = prev == null || dist > prev;
      if (isBest && dist > 0) { b[mode] = dist; store.set("elytra.best", b); }
      paintOver(isBest && dist > 0 ? null : prev); paintBest(); rocketBtn.hidden = true;
    }
    function rocket() {
      if (state !== "run" || rockets <= 0 || boost > 0) return;
      rockets--; boost = 1.2; rocketsEl.textContent = rockets;
    }

    /* drawing, all procedural: netherrack walls, basalt columns, bedrock roof, lava */
    let W2 = 0, H2 = 0, S = 1, camX = 0;
    function layout() { fit(cv); W2 = cv.width; H2 = cv.height; S = H2 / (H + 4); }
    const sx = x => (x - camX) * S, sy = y => H2 - (y + 2) * S;
    function draw(t) {
      const gg = g;
      camX = p.x - (W2 / S) * .28;
      gg.save();
      if (shake > 0) gg.translate(rnd(-1, 1) * shake * 18, rnd(-1, 1) * shake * 18);
      const bg = gg.createLinearGradient(0, 0, 0, H2);
      bg.addColorStop(0, "#1d0c0a"); bg.addColorStop(.55, "#3a130d"); bg.addColorStop(1, "#7a2a10");
      gg.fillStyle = bg; gg.fillRect(-20, -20, W2 + 40, H2 + 40);
      // far cave wall, parallax
      gg.fillStyle = "rgba(20,8,7,.55)";
      gg.beginPath(); gg.moveTo(-20, H2);
      for (let i = -1; i <= W2 / (S * 6) + 2; i++) {
        const wx = Math.floor(camX * .45 / 6) + i, h = 8 + hash(wx, wallSeed) * 16;
        gg.lineTo((wx * 6 - camX * .45) * S, sy(h)); gg.lineTo(((wx + 1) * 6 - camX * .45) * S, sy(h));
      }
      gg.lineTo(W2 + 20, H2); gg.fill();
      gg.fillStyle = "rgba(20,8,7,.5)";
      gg.beginPath(); gg.moveTo(-20, 0);
      for (let i = -1; i <= W2 / (S * 5) + 2; i++) {
        const wx = Math.floor(camX * .6 / 5) + i, h = H - 6 - hash(wx, wallSeed + 9) * 12;
        gg.lineTo((wx * 5 - camX * .6) * S, sy(h)); gg.lineTo(((wx + 1) * 5 - camX * .6) * S, sy(h));
      }
      gg.lineTo(W2 + 20, 0); gg.fill();
      // basalt columns
      for (const q of pillars) {
        const x0 = sx(q.x), x1 = sx(q.x + q.w);
        if (x1 < -10 || x0 > W2 + 10) continue;
        column(gg, q, q.top, H, true); column(gg, q, 0, q.bot, false);
      }
      // roof of bedrock, sealed
      for (let bx = Math.floor(camX) - 1; bx < camX + W2 / S + 1; bx++) {
        for (let by = H - 1; by < H + 2; by++) {
          const v = hash(bx, by);
          gg.fillStyle = v < .33 ? "#2b2a29" : v < .66 ? "#3a3938" : "#4c4a48";
          gg.fillRect(Math.floor(sx(bx)), Math.floor(sy(by + 1)), Math.ceil(S) + 1, Math.ceil(S) + 1);
        }
      }
      // pickups: a little rocket
      for (const k of pickups) {
        if (k.got) continue;
        const x = sx(k.x), y = sy(k.y + Math.sin(t / 300 + k.ph) * .4);
        gg.save(); gg.translate(x, y); gg.rotate(-.5);
        gg.fillStyle = "rgba(255,210,122,.25)"; gg.beginPath(); gg.arc(0, 0, S * 1.6, 0, 6.29); gg.fill();
        gg.fillStyle = "#c2371a"; gg.fillRect(-S * .35, -S * .9, S * .7, S * 1.5);
        gg.fillStyle = "#f3ecdb"; gg.fillRect(-S * .35, -S * .3, S * .7, S * .3);
        gg.fillStyle = "#a8a08f"; gg.beginPath(); gg.moveTo(-S * .35, -S * .9); gg.lineTo(0, -S * 1.4); gg.lineTo(S * .35, -S * .9); gg.fill();
        gg.restore();
      }
      // lava
      const lv = gg.createLinearGradient(0, sy(2.4), 0, H2);
      lv.addColorStop(0, "#ffb347"); lv.addColorStop(.25, "#ff6a1f"); lv.addColorStop(1, "#c2371a");
      gg.fillStyle = lv; gg.beginPath(); gg.moveTo(-20, H2 + 20);
      for (let i = 0; i <= W2 + 24; i += 12) gg.lineTo(i, sy(1.2 + Math.sin((i / S + camX) * .35 + t / 420) * .35));
      gg.lineTo(W2 + 20, H2 + 20); gg.fill();
      const glow = gg.createLinearGradient(0, sy(12), 0, sy(1));
      glow.addColorStop(0, "rgba(255,106,31,0)"); glow.addColorStop(1, "rgba(255,106,31,.22)");
      gg.fillStyle = glow; gg.fillRect(0, sy(12), W2, sy(1) - sy(12));
      for (const s of sparks) { gg.globalAlpha = Math.max(0, 1 - s.life / s.max); gg.fillStyle = s.c; gg.fillRect(sx(s.x), sy(s.y), Math.max(2, S * .22), Math.max(2, S * .22)); }
      gg.globalAlpha = 1;
      if (state !== "over" || shake > 0) glider(gg);
      gg.restore();
      hud(gg);
    }
    function column(gg, q, y0, y1, hang) {
      for (let bx = 0; bx < q.w; bx++) {
        // stepped ends so the columns read as blocks, not bars
        const edge = bx === 0 || bx === q.w - 1 ? 1 : 0;
        const a = hang ? y0 + edge : y0, b = hang ? y1 : y1 - edge;
        for (let by = Math.floor(a); by < Math.ceil(b); by++) {
          const v = hash(q.seed + bx, by);
          gg.fillStyle = bx === 0 ? "#26231f" : v < .25 ? "#3b3733" : v < .6 ? "#46413c" : v < .9 ? "#504a44" : "#5d5750";
          gg.fillRect(Math.floor(sx(q.x + bx)), Math.floor(sy(by + 1)), Math.ceil(S) + 1, Math.ceil(S) + 1);
        }
      }
      gg.fillStyle = "rgba(255,106,31,.12)";
      gg.fillRect(sx(q.x), sy(hang ? y0 + 1 : y1), q.w * S, S * .5);
    }
    const W_SHAPE = [[-1.9, -.9], [-1.15, -.9], [-.8, .2], [-.38, -.62], [.38, -.62], [.8, .2], [1.15, -.9], [1.9, -.9], [1.2, .9], [.55, .9], [0, -.02], [-.55, .9], [-1.2, .9]];
    function glider(gg) {
      const x = sx(p.x), y = sy(p.y), u = S * 1.05;
      const halo = gg.createRadialGradient(x, y, 0, x, y, u * 3.4);
      halo.addColorStop(0, "rgba(255,179,71,.28)"); halo.addColorStop(1, "rgba(255,179,71,0)");
      gg.fillStyle = halo; gg.fillRect(x - u * 3.4, y - u * 3.4, u * 6.8, u * 6.8);
      // trail of embers behind the wing
      for (let i = 1; i <= 5; i++) {
        const tx = sx(p.x - i * .9 * Math.cos(p.a)), ty = sy(p.y - i * .9 * Math.sin(p.a));
        gg.globalAlpha = (boost > 0 ? .7 : .35) * (1 - i / 6); gg.fillStyle = i % 2 ? "#ff6a1f" : "#ffb347";
        const q = Math.max(2, S * (.42 - i * .05)); gg.fillRect(tx - q / 2, ty - q / 2, q, q);
      }
      gg.globalAlpha = 1;
      gg.save(); gg.translate(x, y); gg.rotate(-p.a);
      if (p.v > 26) { gg.strokeStyle = "rgba(243,236,219,.4)"; gg.lineWidth = Math.max(1, u * .1); gg.beginPath(); gg.moveTo(-u * 2.3, -u * .55); gg.lineTo(-u * 4.6, -u * .55); gg.moveTo(-u * 2.3, u * .45); gg.lineTo(-u * 3.9, u * .45); gg.stroke(); }
      // the Welloby W as the glider, with the lava chip from the logo on its top right
      gg.fillStyle = "#f3ecdb"; gg.strokeStyle = "#171614"; gg.lineWidth = Math.max(1.5, u * .14); gg.lineJoin = "miter";
      gg.beginPath(); W_SHAPE.forEach((pt, i) => i ? gg.lineTo(pt[0] * u, pt[1] * u) : gg.moveTo(pt[0] * u, pt[1] * u)); gg.closePath();
      gg.stroke(); gg.fill();
      gg.fillStyle = "#ff6a1f"; gg.fillRect(u * 1.5, -u * .9, u * .42, u * .34);
      gg.restore();
    }
    function hud(gg) {
      const u = Math.max(1, H2 / 420);
      gg.font = `800 ${Math.round(26 * u)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      gg.fillStyle = "#f3ecdb"; gg.textBaseline = "top";
      gg.fillText(fmt(Math.max(0, Math.floor(p.x))) + " blocks", 14 * u, 12 * u);
      gg.font = `500 ${Math.round(12 * u)}px "IBM Plex Mono", monospace`; gg.fillStyle = "rgba(243,236,219,.8)";
      gg.fillText(Math.round(p.v) + " b/s" + (p.stall ? "  stall" : boost > 0 ? "  rocket" : "") + "   rockets " + rockets, 14 * u, 42 * u);
      const b = store.get("elytra.best", {})[mode];
      gg.textAlign = "right";
      gg.fillText((b ? "best " + fmt(b) : "no best yet") + "  " + MODES[mode].label.toLowerCase(), W2 - 14 * u, 16 * u);
      gg.textAlign = "left"; gg.textBaseline = "alphabetic";
    }

    /* loop */
    function frame(t) {
      raf = 0;
      if (!visible) return;
      const dt = Math.min(1 / 30, lastT ? (t - lastT) / 1000 : 1 / 60); lastT = t;
      if (state === "run") { let left = dt; while (left > 0 && state === "run") { const h = Math.min(1 / 120, left); step(h); left -= h; } }
      else if (state === "over") { for (const s of sparks) { s.life += dt; s.x += s.vx * dt; s.y += s.vy * dt; } sparks = sparks.filter(s => s.life < s.max); shake = Math.max(0, shake - dt); }
      else if (state === "ready") { p.y = 30 + Math.sin(t / 500) * 1.2; }
      draw(t);
      if (state === "run" || (state === "ready" && !reduced.matches) || shake > 0 || sparks.length) raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf && visible) { lastT = 0; raf = requestAnimationFrame(frame); } }
    function go() {
      if (state === "over" || state === "ready") { if (state === "over") reset(); state = "run"; }
      else if (state === "paused") state = "run";
      over.hidden = true; rocketBtn.hidden = false; kick();
      document.documentElement.classList.add("game-on");
      stage.focus({ preventScroll: true });
    }
    function pause(reason) {
      document.documentElement.classList.remove("game-on");
      if (state !== "run") return;
      state = "paused"; holding = false; paintOver(); rocketBtn.hidden = true;
      if (reason) over.querySelector("p").textContent = reason;
      draw(performance.now());
    }
    function paintOver(prevBest) {
      over.hidden = false;
      if (state === "ready") over.innerHTML = '<div class="go-card go-card-dark"><h3>Elytra Dive</h3><p>Glide under the sealed Nether roof. Hold to lift the nose, let go to let it drop. Climbing costs speed, diving earns it back. Basalt, the roof and the lava all end the run.</p><p class="go-acts"><button type="button" class="btn btn-lava" data-ed-go><svg class="i"><use href="#i-play"/></svg>Fly</button></p></div>';
      else if (state === "paused") over.innerHTML = '<div class="go-card go-card-dark"><h3>Paused</h3><p>Hold to lift the nose, let go to let it drop.</p><p class="go-acts"><button type="button" class="btn btn-lava" data-ed-go><svg class="i"><use href="#i-play"/></svg>Keep flying</button></p></div>';
      else if (state === "over") {
        const dist = Math.floor(p.x);
        over.innerHTML = '<div class="go-card go-card-dark"><p class="go-kicker">' + why + '</p><h3>' + fmt(dist) + ' <small>blocks</small></h3><p class="go-title">' +
          (prevBest == null ? (dist > 0 ? "<b>New best</b> on " + MODES[mode].label + "." : "Hold to lift the nose, let go to let it drop.") : "Best on " + MODES[mode].label + ": " + fmt(prevBest) + ".") + '</p>' +
          '<p class="go-acts"><button type="button" class="btn btn-lava" data-ed-go>Fly again</button><button type="button" class="btn btn-line btn-s" data-ed-copy><svg class="i"><use href="#i-share"/></svg>Copy score</button></p></div>';
      }
    }
    over.addEventListener("click", e => {
      if (e.target.closest("[data-ed-go]")) go();
      else if (e.target.closest("[data-ed-copy]")) copy("welloby elytra dive: " + fmt(Math.floor(p.x)) + " blocks on " + MODES[mode].label.toLowerCase() + ". beat it: welloby.com", "your score");
    });
    rocketBtn.addEventListener("pointerdown", e => { e.stopPropagation(); });
    rocketBtn.addEventListener("click", e => { e.stopPropagation(); rocket(); });
    stage.addEventListener("pointerdown", e => {
      if (e.target.closest(".go-card, [data-ed-rocket]")) return;
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      stage.focus({ preventScroll: true });
      if (state === "over" && performance.now() - overAt < 700) return;
      if (state === "ready" || state === "over" || state === "paused") go();
      holding = true;
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* old browsers */ }
    });
    const release = () => { holding = false; };
    stage.addEventListener("pointerup", release); stage.addEventListener("pointercancel", release); stage.addEventListener("lostpointercapture", release);
    stage.addEventListener("contextmenu", e => e.preventDefault());
    stage.addEventListener("keydown", e => {
      if (e.target !== stage) return;
      if (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
        e.preventDefault();
        if (e.repeat) return;
        if (state === "over" && performance.now() - overAt < 700) return;
        if (state !== "run") go();
        holding = true;
      }
      else if (e.key === "r" || e.key === "R" || e.key === "Shift") { e.preventDefault(); rocket(); }
      else if (e.key === "p" || e.key === "P" || e.key === "Escape") { if (state === "run") { e.preventDefault(); pause(); } else if (state === "paused") { e.preventDefault(); go(); } }
      else if (e.key === "Enter" && (state === "over" || state === "ready" || state === "paused")) { e.preventDefault(); go(); }
    });
    stage.addEventListener("keyup", e => { if (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") holding = false; });
    stage.addEventListener("blur", () => { holding = false; });
    $$("[data-ed-diff]").forEach(b => b.addEventListener("click", () => {
      mode = b.dataset.edDiff; store.set("elytra.mode", mode);
      $$("[data-ed-diff]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      state = "ready"; reset(); paintOver(); paintBest(); rocketBtn.hidden = true; layout(); draw(performance.now()); kick();
    }));
    $$("[data-ed-diff]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.edDiff === mode)));
    document.addEventListener("visibilitychange", () => { if (document.hidden) pause("Paused while the tab was hidden."); });
    new IntersectionObserver(es => {
      for (const e of es) {
        const on = e.isIntersecting && e.intersectionRatio > .35 && !root.hidden;
        if (!on && state === "run") pause("Paused while you scrolled away.");
        visible = on || (!root.hidden && e.isIntersecting);
        if (visible) kick();
      }
    }, { threshold: [0, .35, .6] }).observe(stage);
    new ResizeObserver(() => { layout(); if (p) draw(performance.now()); }).observe(stage);
    reset(); paintOver();
    stage.tabIndex = 0;
    stage.setAttribute("aria-label", "Elytra Dive game area. Space or the mouse button pulls up, R fires a rocket, P pauses.");
    return {
      show() { layout(); draw(performance.now()); visible = true; kick(); },
      hide() { pause(); visible = false; },
      best() { const b = store.get("elytra.best", {})[mode]; return b ? "Best on " + MODES[mode].label + ": " + fmt(b) + " blocks" : "No best yet on " + MODES[mode].label; }
    };
  })();

  /* ================= picker ================= */
  function pickGame(name) {
    current = name === "elytra" ? "elytra" : "guessr";
    $$("[data-game-pick]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.gamePick === current)));
    $("[data-gs]").hidden = current !== "guessr";
    $("[data-ed]").hidden = current !== "elytra";
    if (GS.sync) GS.sync();
    if (current === "elytra") ED.show(); else { ED.hide(); GS.show(); }
    paintBest();
  }
  $$("[data-game-pick]").forEach(b => b.addEventListener("click", () => pickGame(b.dataset.gamePick)));
  paintBest();
  window.wellobyGames = { open: pickGame };
})();
