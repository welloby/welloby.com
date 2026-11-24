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
  const coarse = matchMedia("(pointer: coarse)");
  const Tap = () => coarse.matches ? "Tap" : "Click", tap = () => Tap().toLowerCase();
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
  let current = "guessr", GS = null, ED = null, flying = false;
  function paintBest() {
    const src = current === "elytra" ? ED : GS;
    if (bestEl && src) bestEl.textContent = src.best();
  }

  /* ---------- the page around the games ----------
     A phone screen is mostly game here, so the fixed things on the page (the top bar, the Terms notice) must not sit
     on a game's buttons. Each stage gets --cov-t and --cov-b, how much of it they hide right now, and site.css keeps
     the cards and buttons in the part that is left. The help bot's button and back-to-top step aside while a game is
     on screen (an open help-bot chat stays). */
  const topBar = document.querySelector("header.bar");
  const SKIP = ".kz, .to-top, .toast, dialog, script, template, [hidden]";
  function covers(box) {
    let top = 0, bottom = innerHeight;
    if (topBar && getComputedStyle(topBar).position === "fixed") top = Math.max(0, topBar.getBoundingClientRect().bottom);
    for (const el of document.body.children) {
      if (el === topBar || el.matches(SKIP)) continue;
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" || cs.display === "none" || cs.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.height < 8 || r.width < 120 || r.top < innerHeight * .5 || r.right < box.left || r.left > box.right) continue;
      bottom = Math.min(bottom, r.top);
    }
    return { top, bottom };
  }
  const onScreen = new Set();
  function measure(stage) {
    const r = stage.getBoundingClientRect(), c = covers(r);
    let t = Math.max(0, c.top - r.top), b = Math.max(0, r.bottom - c.bottom);
    const room = Math.min(r.height, 180);                  // a card needs this much; past it, let the page scroll instead
    if (r.height - t - b < room) { const k = Math.max(0, r.height - room) / Math.max(1, t + b); t *= k; b *= k; }
    stage.style.setProperty("--cov-t", Math.round(t) + "px");
    stage.style.setProperty("--cov-b", Math.round(b) + "px");
  }
  let measureRaf = 0;
  function remeasure() {
    measureRaf = 0;
    onScreen.forEach(measure);
    const html = document.documentElement, on = onScreen.size > 0;
    html.classList.toggle("gs-on", on);
    html.classList.toggle("game-on", flying || (on && !document.querySelector(".kz[data-open='1']")));
  }
  const soon = () => { if (!measureRaf) measureRaf = requestAnimationFrame(remeasure); };
  addEventListener("scroll", () => { if (onScreen.size) soon(); }, { passive: true });
  addEventListener("resize", soon);
  function watch(stage) {
    if (!stage) return;
    new IntersectionObserver(es => {
      for (const e of es) {
        if (e.isIntersecting && e.intersectionRatio > .2) onScreen.add(stage);
        else { onScreen.delete(stage); stage.style.removeProperty("--cov-t"); stage.style.removeProperty("--cov-b"); }
      }
      soon();
    }, { threshold: [0, .2, .5, 1] }).observe(stage);
  }
  /* scroll so the whole stage shows under the top bar, unless it already does */
  function bringIntoView(stage) {
    const r = stage.getBoundingClientRect(), c = covers(r);
    if (r.top >= c.top - 2 && r.bottom <= c.bottom + 2) return;
    stage.scrollIntoView({ block: "start", behavior: reduced.matches ? "auto" : "smooth" });
  }
  function setFlying(on) { flying = on; soon(); }

  /* ================= Spawn Guessr, on the live 3D map ================= */
  GS = (() => {
    const G = W.guessr || {};
    const root = $("[data-gs]");
    const M3 = window.wellobyMap3d;
    if (!root || !$("[data-gs-stage]") || !$("[data-gs-go]")) return { show() {}, park() {}, best() { return ""; } };
    const stage = $("[data-gs-stage]"), frame = $("[data-gs-frame]"), veil = $("[data-gs-veil]"), over = $("[data-gs-over]"), cap = $("[data-gs-cap]");
    const read = $("[data-gs-read]"), roundEl = $("[data-gs-round]"), scoreEl = $("[data-gs-score]");
    const diffIn = $("[data-gs-diff]"), diffName = $("[data-gs-diff-name]"), diffSize = $("[data-gs-diff-size]");
    const hintBtn = $("[data-gs-hint]"), goBtn = $("[data-gs-go]");
    /* the round's buttons sit on the map itself, so on a phone they are on screen together with the view
       (the page has them in the bar under the map, which is below the screen there) */
    const play = document.createElement("div");
    play.className = "gs-play"; play.hidden = true;
    const oldActs = goBtn.parentElement;
    if (hintBtn) play.append(hintBtn);
    play.append(goBtn);
    stage.append(play);
    if (oldActs && oldActs !== stage && !oldActs.children.length) oldActs.remove();
    const shield = stage.querySelector(".gs3-shield");
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
    // map: client is the conversation with the frame; ok once it answered; failed when it didn't; wantStart while loading
    let client = null, ok = false, failed = false, wantStart = false, framed = false, loadAt = 0, phase = 0, ticker = 0, note = "", blanking = Promise.resolve();
    let state = "idle", rounds = [], round = 0, total = 0, hint = false, guess = null, last = [], result = null, cam = null, veilT = 0;
    const A = () => AREAS[area];
    const usable = !!(M3 && M3.embeddable && frame && stage);
    const live = () => state === "look" || state === "guess" || state === "reveal";

    function connectMap() {
      if (client || !usable) return;
      failed = false; framed = true;
      if (M3.claim) M3.claim("guessr");
      client = M3.connect(frame, ev => {
        if (ev.wl === "ready") {
          ok = true; client.send({ wl: "clean", on: true }); stopTicker();
          if (!wantStart) paintOver();
          else if (current === "guessr" && !root.hidden) { wantStart = false; start(); }
          else { wantStart = false; paintAll(); toast("Spawn Guessr is ready to play."); }
        } else if (ev.wl === "timeout") { if (!ok) fail(); }
        else if (ev.wl === "camera") cam = ev;
        else if (ev.wl === "click" && state === "guess") setGuess(ev.x, ev.z);
      });
      frame.src = M3.url + M3.hashFor({ map: "world", x: 0, z: 0, distance: A().view.distance, mode: "flat" });
      paintOver();
    }
    /* drop the map frame: after a failure (to load it fresh), or on a phone when the big 3D map needs the memory */
    function unload() {
      stopTicker();
      if (client && client.close) client.close();
      client = null; ok = false; cam = null;
      if (framed) { blanking = M3.blank ? M3.blank(frame) : (frame.src = "about:blank", Promise.resolve()); framed = false; }
    }
    function fail() {
      unload();
      failed = true; wantStart = false;
      read.textContent = "";
      paintAll();
    }
    // while the map loads, the card says how long it has been: a few seconds is normal, a minute on mobile data happens
    function stopTicker() { clearInterval(ticker); ticker = 0; phase = 0; }
    function startTicker() {
      loadAt = Date.now(); phase = 0; clearInterval(ticker);
      ticker = setInterval(() => {
        const s = (Date.now() - loadAt) / 1000, p = s >= 30 ? 2 : s >= 6 ? 1 : 0;
        if (p !== phase) { phase = p; paintOver(); }
      }, 1000);
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
      diffIn.disabled = live();
      $$("[data-gs-area]").forEach(b => { b.disabled = live(); });
    }
    function paintBar() {
      root.dataset.state = state;
      if (state === "idle") { roundEl.textContent = ROUNDS + " rounds"; scoreEl.textContent = "Up to 1,000 points each"; }
      else if (state === "done") { roundEl.textContent = "Finished"; scoreEl.textContent = fmt(total) + " points"; }
      else { roundEl.textContent = "Round " + (round + 1) + " of " + ROUNDS; scoreEl.textContent = fmt(total) + " points"; }
      play.hidden = !live();
      if (hintBtn) {
        hintBtn.hidden = !(state === "look" || state === "guess");
        hintBtn.disabled = state === "look" && hint;
        hintBtn.innerHTML = state === "guess" ? "Look again" : "Look wider <small>30% fewer points</small>";
      }
      goBtn.disabled = !live();
      goBtn.textContent = state === "guess" ? "Lock in guess" : state === "reveal" ? (round + 1 < ROUNDS ? "Next round" : "See your score") : "Make a guess";
      cap.textContent = state === "look" ? "Round " + (round + 1) + " of " + ROUNDS + ". Where is this?" + (hint ? " Wider view." : "")
        : state === "guess" ? "Map from above, north is up. " + (guess ? "Pin set. " + Tap() + " again to move it." : Tap() + " where you think it was.")
        : state === "reveal" ? "Orange: where it was. White: your guess." : "";
      paintBest();
    }
    const elytraBtn = '<button type="button" class="btn btn-line btn-s" data-gs-elytra>Play Elytra Dive</button>';
    const tabLink = () => M3 && M3.fallback ? '<a class="btn btn-line btn-s" href="' + M3.fallback + '" target="_blank" rel="noopener">Open the 3D map in a new tab</a>' : "";
    function paintOver() {
      over.hidden = live();
      if (over.hidden) return;
      if (state === "done") {
        const isBest = result.isBest, prev = result.prev;
        over.innerHTML = '<div class="go-card"><p class="go-kicker">' + DIFFS[diff][0] + ", " + A().label + '</p><h3>' + fmt(total) + ' <small>of ' + fmt(ROUNDS * 1000) + '</small></h3>' +
          '<p class="go-title">' + title(total) + (isBest ? '. <b>New best.</b>' : '. Your best is ' + fmt(prev) + '.') + '</p>' +
          '<ol class="go-rounds">' + last.map((r, i) => '<li><span>' + (i + 1) + '</span>' + fmt(r.d) + ' blocks off<b>' + fmt(r.p) + '</b></li>').join("") + '</ol>' +
          '<p class="go-acts"><button type="button" class="btn btn-lava" data-gs-start>Play again</button><button type="button" class="btn btn-line btn-s" data-gs-copy><svg class="i"><use href="#i-share"/></svg>Copy score</button></p></div>';
        return;
      }
      if (!usable) {
        over.innerHTML = '<div class="go-card"><h3>Spawn Guessr</h3><p>This game needs the live 3D map, and the map can\'t open inside this page here. Elytra Dive works.</p>' +
          '<p class="go-acts">' + elytraBtn + tabLink() + '</p></div>';
        return;
      }
      if (failed) {
        over.innerHTML = '<div class="go-card"><h3>Spawn Guessr</h3><p><b>The 3D map didn\'t load.</b> Check your internet, then try again.</p>' +
          '<p class="go-acts"><button type="button" class="btn btn-lava" data-gs-start>Try again</button>' + elytraBtn + '</p>' +
          (tabLink() ? '<p class="go-acts go-more">' + tabLink() + '</p>' : '') + '</div>';
        return;
      }
      if (wantStart) {
        over.innerHTML = '<div class="go-card"><h3>Spawn Guessr</h3><p class="go-load" role="status">Loading the 3D map...</p>' +
          (phase === 0 ? '<p>This takes a few seconds.</p>' : '<p>Still loading. On mobile data this can take up to a minute.</p>') +
          (phase === 0 ? '' : '<p class="go-acts">' + (phase === 2 ? '<button type="button" class="btn btn-lava btn-s" data-gs-retry>Try again</button>' : '') +
            elytraBtn.replace("Play Elytra Dive", "Play Elytra Dive while you wait") + '</p>') + '</div>';
        return;
      }
      over.innerHTML = '<div class="go-card"><h3>Spawn Guessr</h3>' + (note ? '<p><b>' + note + '</b></p>' : '') +
        '<p>You see a real place on the server in 3D. Then you put a pin on the map where you think it is.</p>' +
        '<p>' + ROUNDS + ' rounds. The closer you are, the more points.</p>' +
        '<p class="go-acts"><button type="button" class="btn btn-lava" data-gs-start>Start</button></p></div>';
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
      note = "";
      bringIntoView(stage);
      if (!ok) {
        if (wantStart) return;
        if (failed || client) unload();
        failed = false; wantStart = true; startTicker(); paintOver();
        Promise.all([M3.check(), blanking]).then(([up]) => { if (!wantStart) return; if (up) connectMap(); else fail(); });
        return;
      }
      rounds = pick(); round = 0; total = 0; last = []; hint = false; guess = null;
      if (rounds.length < ROUNDS) { toast("Not enough spots in this area yet. Try near spawn."); return; }
      look(true);
      read.textContent = "Look around, then press Make a guess.";
    }
    function retry() { wantStart = false; unload(); start(); }
    function toGuess() {
      state = "guess";
      client.send({ wl: "orbit", speed: 0 });
      veilFor(500);
      const v = A().view, at = guess ? { x: guess[0], z: guess[1], distance: Math.min(v.distance, 900) } : v;
      client.send({ wl: "view", map: "world", x: at.x, z: at.z, distance: at.distance, mode: "flat", fly: 0 });
      if (guess) client.send({ wl: "pins", pins: [{ x: guess[0], z: guess[1], kind: "guess", label: "Your guess" }] });
      paintAll();
      read.textContent = Tap() + " where you think it was, then press Lock in guess. " + (coarse.matches ? "Drag to move the map, pinch to zoom." : "Drag to move the map, scroll to zoom.");
    }
    function setGuess(x, z) {
      guess = [Math.round(x), Math.round(z)];
      client.send({ wl: "pins", pins: [{ x: guess[0], z: guess[1], kind: "guess", label: "Your guess" }] });
      paintBar();
      read.textContent = "Pin at x " + fmt(guess[0]) + ", z " + fmt(guess[1]) + ". Press Lock in guess, or " + tap() + " again to move it.";
    }
    function confirm() {
      if (state === "look") { toGuess(); return; }
      if (state === "guess") {
        const g = guess || (cam && cam.mode === "flat" ? [cam.x, cam.z] : null);
        if (!g) { read.textContent = Tap() + " the map to put your pin first."; return; }
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
          read.textContent = "Round " + (round + 1) + ". Look around, then press Make a guess.";
        } else finish();
      }
    }
    function finish() {
      state = "done";
      read.textContent = "";
      const key = bestKey(), b = store.get("guessr3d.best", {}), prev = b[key];
      result = { isBest: prev == null || total > prev, prev };
      if (result.isBest) { b[key] = total; store.set("guessr3d.best", b); }
      client.send({ wl: "pins", pins: rounds.map((s, i) => ({ x: s[0], z: s[1], kind: "real", label: String(i + 1) })) });
      const v = A().view;
      client.send({ wl: "view", mode: "flat", x: v.x, z: v.z, distance: v.distance, fly: reduced.matches ? 0 : 900 });
      paintAll();
      over.scrollTop = 0;
      const again = over.querySelector("[data-gs-start]"); if (again) again.focus({ preventScroll: true });
    }
    /* a phone keeps one 3D map at a time: when the big map on the page loads, this one lets go */
    function yieldMap() {
      if (!framed && !wantStart) return;
      const wasPlaying = live();
      wantStart = false; unload();
      if (wasPlaying) { state = "idle"; note = "The game stopped so the big 3D map could load. Press Start to play again."; read.textContent = ""; }
      paintAll();
    }
    addEventListener("welloby:map3d-claim", e => { if (M3 && M3.single && e.detail !== "guessr") yieldMap(); });

    over.addEventListener("click", e => {
      if (e.target.closest("[data-gs-start]")) start();
      else if (e.target.closest("[data-gs-retry]")) retry();
      else if (e.target.closest("[data-gs-elytra]")) pickGame("elytra");
      else if (e.target.closest("[data-gs-copy]")) copy("welloby spawn guessr: " + fmt(total) + " / " + fmt(ROUNDS * 1000) + " on " + DIFFS[diff][0] + " (" + A().label + "). " + title(total).toLowerCase() + ". think you know spawn better? welloby.com", "your score");
    });
    // the 3D look can't be moved on purpose (that would give the spot away); a tap on it points at the button
    if (shield) shield.addEventListener("click", () => {
      if (state !== "look") return;
      read.textContent = "This view can't be moved. Press Make a guess when you know where it is.";
      goBtn.classList.remove("gs-nudge"); void goBtn.offsetWidth; goBtn.classList.add("gs-nudge");
    });
    goBtn.addEventListener("click", confirm);
    if (hintBtn) hintBtn.addEventListener("click", () => {
      if (state === "look" && !hint) { hint = true; look(false); read.textContent = "Wider view. This round now gives 30% fewer points."; }
      else if (state === "guess") { look(false); read.textContent = "Back at the spot. Press Make a guess when you're ready."; }
    });
    diffIn.addEventListener("input", () => { diff = +diffIn.value; store.set("guessr.diff", diff); paintSettings(); paintBest(); });
    $$("[data-gs-area]").forEach(b => b.addEventListener("click", () => {
      if (b.disabled) return;
      area = b.dataset.gsArea; store.set("guessr.area", area); paintSettings(); paintBest();
    }));
    watch(stage);
    paintSettings(); paintBar(); paintOver();
    return {
      show() { soon(); },
      // on a phone, switching to the other game lets the idle map go (it costs memory); a game or a load in progress stays
      park() { if (M3 && M3.single && !wantStart && !live()) { unload(); paintOver(); } },
      best
    };
  })();

  /* ================= Elytra Dive ================= */
  ED = (() => {
    const root = $("[data-ed]"), stage = $("[data-ed-stage]"), cv = $("[data-ed-canvas]"), over = $("[data-ed-over]");
    const rocketBtn = $("[data-ed-rocket]"), rocketsEl = $("[data-ed-rockets]");
    if (!root || !cv) return { show() {}, hide() {}, best() { return ""; } };
    const g = cv.getContext("2d");
    const H = 48;                          // cave height in blocks, lava at 0, sealed roof at H
    const VIEW = 58;                       // at least this many blocks across, so a tall phone screen still sees what is coming
    const EASY = 3;                        // seconds at the start of a flight in which letting go levels out instead of diving
    const MODES = {
      chill: { label: "Chill", gap0: 23, gapMin: 15, space: [50, 64], w: [4, 7], narrow: 900 },
      normal: { label: "Normal", gap0: 19, gapMin: 12, space: [42, 54], w: [4, 8], narrow: 700 },
      brutal: { label: "Brutal", gap0: 16, gapMin: 10, space: [34, 44], w: [5, 9], narrow: 520 }
    };
    let mode = MODES[store.get("elytra.mode", "normal")] ? store.get("elytra.mode", "normal") : "normal";
    let state = "ready", holding = false, raf = 0, lastT = 0, visible = false, shake = 0, overAt = 0, runT = 0, runs = 0, armY = 30;
    let p, pillars, pickups, sparks, nextX, lastGap, rockets, boost, why, wallSeed;

    function set(s) { state = s; root.dataset.state = s; setFlying(s === "run" || s === "armed"); }
    function reset() {
      p = { x: 0, y: 30, v: 17, a: 0, stall: false };
      pillars = []; pickups = []; sparks = []; nextX = 95; lastGap = 30; rockets = 3; boost = 0; why = ""; shake = 0;
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
       Below 6.5 blocks a second the wing stalls and the nose drops until it has 9 again.
       For the first EASY seconds letting go only levels the wing, so a first tap never flies straight into the lava. */
    function step(dt) {
      runT += dt;
      p.stall = p.v < 6.5 || (p.stall && p.v < 9);
      if (p.stall) p.a = Math.max(-.9, p.a - 1.76 * dt);
      else if (holding) p.a = Math.min(.75, p.a + 1.5 * dt);
      else if (runT < EASY) p.a -= p.a * Math.min(1, 2.5 * dt);
      else p.a = Math.max(-.9, p.a - 1.1 * dt);
      let acc = -20 * Math.sin(p.a) - .2 * p.v;
      if (runT < EASY && !holding) acc = Math.max(acc, (17 - p.v) * .8);   // and keeps the starting speed
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
        if (p.x + hw > q.x && p.x - hw < q.x + q.w && (p.y + hh > q.top || p.y - hh < q.bot)) return crash("You hit a rock");
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
      why = text; overAt = performance.now(); holding = false;
      set("over");
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

    /* drawing, all procedural: netherrack walls, basalt columns, bedrock roof, lava.
       S is pixels per block; on a screen taller than the cave the rest is roof above and lava below (OY). */
    let W2 = 0, H2 = 0, S = 1, OY = 0, DPR = 1, camX = 0;
    function layout() {
      fit(cv); W2 = cv.width; H2 = cv.height;
      DPR = W2 / Math.max(1, cv.getBoundingClientRect().width) || 1;
      S = Math.min(H2 / (H + 4), W2 / VIEW); OY = Math.max(0, H2 - (H + 4) * S) * .55;
    }
    const sx = x => (x - camX) * S, sy = y => H2 - OY - (y + 2) * S;
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
      // roof of bedrock, sealed, down from the top of the screen
      const roofTo = H + 2 + Math.ceil(Math.max(0, sy(H + 2)) / S) + 1;
      for (let bx = Math.floor(camX) - 1; bx < camX + W2 / S + 1; bx++) {
        for (let by = H - 1; by < roofTo; by++) {
          const v = hash(bx, by);
          gg.fillStyle = v < .33 ? "#2b2a29" : v < .66 ? "#3a3938" : "#4c4a48";
          gg.fillRect(Math.floor(sx(bx)), Math.floor(sy(by + 1)), Math.ceil(S) + 1, Math.ceil(S) + 1);
        }
      }
      if (sy(H + 2) > 0) { gg.fillStyle = "rgba(14,13,12,.45)"; gg.fillRect(-20, -20, W2 + 40, sy(H + 2) + 20); }   // the rock above the cave, quieter
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
      hud(gg, t);
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
    const holdWords = () => coarse.matches ? "Touch and hold to fly" : "Hold the mouse or Space to fly";
    /* a label on a dark plate, centred at x, y (canvas pixels); size in CSS pixels */
    function plate(gg, lines, x, y) {
      gg.textAlign = "center"; gg.textBaseline = "middle";
      let w = 0, h = 0;
      for (const l of lines) { gg.font = l.font; w = Math.max(w, gg.measureText(l.text).width); h += l.size * 1.35; }
      const pad = 12 * DPR;
      gg.fillStyle = "rgba(23,22,20,.82)";
      gg.fillRect(x - w / 2 - pad, y - h / 2 - pad * .7, w + pad * 2, h + pad * 1.4);
      let yy = y - h / 2;
      for (const l of lines) { gg.font = l.font; gg.fillStyle = l.color; gg.fillText(l.text, x, yy + l.size * .68); yy += l.size * 1.35; }
      gg.textAlign = "left"; gg.textBaseline = "alphabetic";
    }
    function hud(gg, t) {
      const u = Math.max(1, Math.min(H2, W2) / 420);
      gg.font = `800 ${Math.round(26 * u)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      gg.fillStyle = "#f3ecdb"; gg.textBaseline = "top";
      gg.fillText(fmt(Math.max(0, Math.floor(p.x))) + " blocks", 14 * u, 12 * u);
      gg.font = `500 ${Math.round(12 * u)}px "IBM Plex Mono", monospace`; gg.fillStyle = "rgba(243,236,219,.8)";
      gg.fillText("speed " + Math.round(p.v) + (p.stall ? "  too slow!" : boost > 0 ? "  rocket" : "") + "   rockets " + rockets, 14 * u, 42 * u);
      const b = store.get("elytra.best", {})[mode];
      gg.textAlign = "right";
      gg.fillText((b ? "best " + fmt(b) : "no best yet") + "  " + MODES[mode].label.toLowerCase(), W2 - 14 * u, 16 * u);
      gg.textAlign = "left"; gg.textBaseline = "alphabetic";
      // the controls, said on the stage itself: big while it waits for the first hold, small in the first seconds of a flight
      const big = Math.min(26, W2 / DPR / 15) * DPR, small = Math.min(17, W2 / DPR / 22) * DPR;
      const line = (size, weight, text, color) => ({ size, text, color, font: `${weight} ${Math.round(size)}px "IBM Plex Sans", system-ui, sans-serif` });
      // in the part of the stage the top bar and a fixed notice leave visible (--cov-t, --cov-b), below the glider
      const cov = k => (parseFloat(stage.style.getPropertyValue(k)) || 0) * DPR;
      const top = Math.max(sy(p.y) + 6 * S, cov("--cov-t")), bottom = Math.min(sy(1), H2 - cov("--cov-b"));
      const y = bottom > top + big * 3 ? (top + bottom) / 2 : Math.min(sy(H * .3), H2 - cov("--cov-b") - big * 1.6);
      if (state === "armed") {
        const pulse = reduced.matches ? 1 : .8 + .2 * Math.sin(t / 260);
        plate(gg, [line(big, 800, holdWords(), `rgba(255,179,71,${pulse})`), line(small, 600, "Hold = go up.  Let go = go down.", "#f3ecdb")], W2 / 2, y);
      } else if (state === "run" && runs <= 2 && runT < EASY + 1.5) {
        plate(gg, [line(small, 600, "Hold = go up.  Let go = go down.", "#f3ecdb")], W2 / 2, Math.min(sy(H * .14), H2 - cov("--cov-b") - small * 2));
      }
    }

    /* loop */
    function frame(t) {
      raf = 0;
      if (!visible) return;
      const dt = Math.min(1 / 30, lastT ? (t - lastT) / 1000 : 1 / 60); lastT = t;
      if (state === "run") { let left = dt; while (left > 0 && state === "run") { const h = Math.min(1 / 120, left); step(h); left -= h; } }
      else if (state === "over") { for (const s of sparks) { s.life += dt; s.x += s.vx * dt; s.y += s.vy * dt; } sparks = sparks.filter(s => s.life < s.max); shake = Math.max(0, shake - dt); }
      else if (state === "ready") { p.y = 30 + Math.sin(t / 500) * 1.2; }
      else if (state === "armed") { p.y = armY + Math.sin(t / 500) * .6; }
      draw(t);
      if (state === "run" || ((state === "ready" || state === "armed") && !reduced.matches) || shake > 0 || sparks.length) raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf && visible) { lastT = 0; raf = requestAnimationFrame(frame); } }
    /* Fly (or Fly again, Keep flying) gets the glider ready and waits: the flight starts on the first hold */
    function arm() {
      if (state === "over" || state === "ready") reset();
      if (state === "paused") { p.a = 0; armY = p.y; } else armY = p.y = 30;
      set("armed"); holding = false;
      over.hidden = true; rocketBtn.hidden = true;
      stage.focus({ preventScroll: true });
      bringIntoView(stage);
      layout(); draw(performance.now()); kick();
    }
    function fly() {
      if (state === "over" || state === "ready") reset();
      if (state !== "paused" && state !== "armed") p.y = 30;
      runT = 0; runs++;
      set("run"); holding = true;
      over.hidden = true; rocketBtn.hidden = false; kick();
      stage.focus({ preventScroll: true });
    }
    function pause(reason) {
      if (state !== "run" && state !== "armed") return;
      set("paused"); holding = false; paintOver(); rocketBtn.hidden = true;
      over.querySelector("[data-ed-why]").textContent = reason || "";
      draw(performance.now());
    }
    const how = '<p class="go-how"><b>Hold</b> = go up. <b>Let go</b> = go down.</p>';
    function paintOver(prevBest) {
      over.hidden = false;
      if (state === "ready") over.innerHTML = '<div class="go-card go-card-dark"><h3>Elytra Dive</h3><p>Fly through the Nether cave. Don\'t touch the rocks, the roof or the lava.</p>' + how +
        '<p class="go-acts"><button type="button" class="btn btn-lava" data-ed-go><svg class="i"><use href="#i-play"/></svg>Fly</button></p></div>';
      else if (state === "paused") over.innerHTML = '<div class="go-card go-card-dark"><h3>Paused</h3><p data-ed-why></p>' + how +
        '<p class="go-acts"><button type="button" class="btn btn-lava" data-ed-go><svg class="i"><use href="#i-play"/></svg>Keep flying</button></p></div>';
      else if (state === "over") {
        const dist = Math.floor(p.x);
        over.innerHTML = '<div class="go-card go-card-dark"><p class="go-kicker">' + why + '</p><h3>' + fmt(dist) + ' <small>blocks</small></h3><p class="go-title">' +
          (prevBest == null ? (dist > 0 ? "<b>New best</b> on " + MODES[mode].label + "." : "") : "Best on " + MODES[mode].label + ": " + fmt(prevBest) + ".") + '</p>' +
          (dist < 150 ? how : '') +
          '<p class="go-acts"><button type="button" class="btn btn-lava" data-ed-go>Fly again</button><button type="button" class="btn btn-line btn-s" data-ed-copy><svg class="i"><use href="#i-share"/></svg>Copy score</button></p></div>';
      }
    }
    over.addEventListener("click", e => {
      if (e.target.closest("[data-ed-go]")) arm();
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
      // a finger on a card's backdrop may be scrolling the page past the game, so on touch only Fly starts it
      if (e.pointerType === "touch" && state !== "run" && state !== "armed") return;
      if (state !== "run") fly();
      holding = true;
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* old browsers */ }
    });
    const release = () => { holding = false; };
    stage.addEventListener("pointerup", release); stage.addEventListener("pointercancel", release); stage.addEventListener("lostpointercapture", release);
    stage.addEventListener("contextmenu", e => e.preventDefault());
    // iPhone Safari: no double-tap zoom, magnifier or text selection while a finger holds the stage
    stage.addEventListener("touchstart", e => { if ((state === "run" || state === "armed") && !e.target.closest("[data-ed-rocket]")) e.preventDefault(); }, { passive: false });
    stage.addEventListener("keydown", e => {
      if (e.target !== stage) return;
      if (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
        e.preventDefault();
        if (e.repeat) return;
        if (state === "over" && performance.now() - overAt < 700) return;
        if (state !== "run") fly();
        holding = true;
      }
      else if (e.key === "r" || e.key === "R" || e.key === "Shift") { e.preventDefault(); rocket(); }
      else if (e.key === "p" || e.key === "P" || e.key === "Escape") { if (state === "run") { e.preventDefault(); pause("Press Keep flying, then hold to go on."); } else if (state === "paused") { e.preventDefault(); arm(); } }
      else if (e.key === "Enter" && (state === "over" || state === "ready" || state === "paused")) { e.preventDefault(); arm(); }
    });
    stage.addEventListener("keyup", e => { if (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") holding = false; });
    stage.addEventListener("blur", () => { holding = false; });
    $$("[data-ed-diff]").forEach(b => b.addEventListener("click", () => {
      mode = b.dataset.edDiff; store.set("elytra.mode", mode);
      $$("[data-ed-diff]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      set("ready"); reset(); paintOver(); paintBest(); rocketBtn.hidden = true; layout(); draw(performance.now()); kick();
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
    watch(stage);
    set("ready"); reset(); paintOver();
    stage.tabIndex = 0;
    stage.setAttribute("aria-label", "Elytra Dive. Hold Space, the mouse or a finger to go up, let go to go down. R fires a rocket, P pauses.");
    return {
      show() { layout(); draw(performance.now()); visible = true; kick(); soon(); },
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
    if (current === "elytra") { GS.park(); ED.show(); } else { ED.hide(); GS.show(); }
    paintBest();
  }
  $$("[data-game-pick]").forEach(b => b.addEventListener("click", () => pickGame(b.dataset.gamePick)));
  paintBest();
  window.wellobyGames = { open: pickGame };
})();
