/* The main map: the live BlueMap of the world around spawn, shown inside the page.
   Also the small messaging client that Spawn Guessr shares (window.wellobyMap3d).
   The map page runs welloby-embed.js (in BlueMap's webroot), which answers these messages;
   without it the map still shows, only the buttons that move the camera do nothing. */
(() => {
  "use strict";
  const W = window.WELLOBY || {};
  const M = W.map3d || {};
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const toast = t => dispatchEvent(new CustomEvent("welloby:toast", { detail: t }));
  const fmt = n => Math.round(n).toLocaleString("en-US");
  const base = String(M.url || "").replace(/#.*$/, "");
  let origin = "";
  try { origin = new URL(base).origin; } catch (e) { origin = ""; }
  /* browsers refuse an http map inside an https page */
  const embeddable = !!origin && (base.startsWith("https://") || location.protocol === "http:");

  /* one conversation with one map frame */
  function connect(frame, onEvent) {
    let ready = false, timer = 0, tries = 0, last = null;
    const queue = [];
    const post = m => { try { frame.contentWindow.postMessage(m, origin); } catch (e) { /* frame gone */ } };
    /* the map only answers once it has downloaded about 1.8 MB and started (7 s on a good line), so
       keep asking for about 90 s for slow phones: every 0.4 s for the first 20 s, then every second */
    function hello() {
      if (ready) return;
      post({ wl: "hello" });
      if (++tries < 120) timer = setTimeout(hello, tries < 50 ? 400 : 1000);
      else if (onEvent) onEvent({ wl: "timeout" });
    }
    function onMsg(e) {
      if (e.source !== frame.contentWindow || e.origin !== origin) return;
      const d = e.data;
      if (!d || typeof d !== "object" || typeof d.wl !== "string") return;
      if (d.wl === "ready" && !ready) { ready = true; clearTimeout(timer); queue.splice(0).forEach(post); }
      if (d.wl === "ready" || d.wl === "camera") last = d;
      if (onEvent) onEvent(d);
    }
    addEventListener("message", onMsg);
    frame.addEventListener("load", () => { ready = false; tries = 0; clearTimeout(timer); hello(); });
    return {
      send(m) { if (ready) post(m); else { queue.push(m); if (queue.length > 20) queue.shift(); } },
      get ready() { return ready; },
      get camera() { return last; }
    };
  }
  /* BlueMap reads its camera from the address: map:x:y:z:distance:rotation:angle:tilt:ortho:mode */
  const hashFor = v => "#" + [v.map || "world", Math.round(v.x || 0), Math.round(v.y == null ? 70 : v.y), Math.round(v.z || 0),
    Math.round(v.distance || 400), (v.rotation || 0).toFixed(2), (v.mode === "flat" ? 0 : (v.angle == null ? .8 : v.angle)).toFixed(2),
    0, v.mode === "flat" ? 1 : 0, v.mode || "perspective"].join(":");
  /* is the map reachable over a working connection right now (address up, certificate valid)?
     Asked once, by loading one small picture from the map. */
  let probe = null;
  function check() {
    if (!embeddable) return Promise.resolve(false);
    if (!probe) probe = new Promise(resolve => {
      let done = false;
      const finish = v => { if (!done) { done = true; resolve(v); } };
      const img = new Image();
      img.onload = () => finish(true);
      img.onerror = () => finish(false);
      setTimeout(() => finish(false), 8000);
      img.src = base + "assets/logo.png?check=" + Date.now();
    });
    return probe;
  }
  window.wellobyMap3d = { url: base, fallback: M.fallback || base, origin, embeddable, connect, hashFor, check };

  const root = document.querySelector("[data-mapx]");
  if (!root) return;
  const SPAWN = W.spawn || { min: 100, max: 1000 };
  /* phones and tablets (the touch-screen query site.css uses), where the full map makes the page lag */
  const phone = matchMedia("(hover: none) and (pointer: coarse)").matches;
  /* BlueMap only loads the detailed tiles (about 26 MB around spawn) once the camera is under 1,000 blocks
     away, so phones start the Overworld above that, on the light low-detail model, until they zoom in */
  const WORLDS = {
    world: { name: "Overworld", distance: phone ? 1200 : 420, angle: .8 },
    world_the_nether: { name: "Nether", distance: 260, angle: .75 },
    world_the_end: { name: "End", distance: 220, angle: .7 }
  };
  const START = { map: "world", x: 0, z: 0, distance: WORLDS.world.distance, rotation: .6, angle: WORLDS.world.angle, mode: "perspective" };
  const frame = root.querySelector("[data-mapx-frame]"), gate = root.querySelector("[data-mapx-gate]");
  const note = root.querySelector("[data-mapx-note]"), loadBtn = root.querySelector("[data-mapx-load]");
  let client = null, loaded = false, world = "world", mode = "perspective";

  const say = t => { if (note) note.textContent = t || ""; };
  function paint() {
    root.querySelectorAll("[data-mapx-world]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mapxWorld === world)));
    root.querySelectorAll("[data-mapx-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mapxMode === mode)));
  }
  function load(view) {
    if (!embeddable || !frame) return false;
    if (loaded) return true;
    loaded = true;
    root.dataset.state = "loading";
    client = connect(frame, ev => {
      if (ev.wl === "ready") root.dataset.state = "live";
      if (ev.wl === "camera" || ev.wl === "ready") {
        if (ev.map && ev.map !== world && WORLDS[ev.map]) world = ev.map;
        if (ev.mode === "flat" || ev.mode === "perspective") mode = ev.mode;
        paint();
      }
    });
    frame.addEventListener("load", () => { if (root.dataset.state === "loading") root.dataset.state = "live"; }, { once: true });
    check().then(ok => {
      if (ok) frame.src = base + hashFor(view || START);
      else { root.dataset.state = "poster"; say(""); }      // the poster opens the map in its own tab instead
    });
    return true;
  }
  function view(v, fly) {
    if (!load(v)) return;
    client.send(Object.assign({ wl: "view", fly: reduced ? 0 : (fly == null ? 900 : fly) }, v));
  }
  function open(v) {
    const sec = document.getElementById("map");
    if (sec) sec.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    if (v) view(v); else load();
  }
  function goto(x, z, label) {
    if (!isFinite(x) || !isFinite(z)) return;
    world = "world"; mode = "perspective"; paint();
    root.dataset.live = "1";
    const v = { map: "world", x, z, distance: 140, angle: 1.05, rotation: .5, mode: "perspective" };
    open(v);
    if (client) client.send({ wl: "pins", pins: [{ x, z, kind: "spot", label: label || fmt(x) + ", " + fmt(z) }] });
    say((label ? label + ": " : "") + "x " + fmt(x) + ", z " + fmt(z));
    if (Math.max(Math.abs(x), Math.abs(z)) > (M.area || 5000)) toast("That spot is outside the area the 3D map covers.");
  }
  function roll() {
    const a = Math.random() * Math.PI * 2, r = SPAWN.min + Math.random() * (SPAWN.max - SPAWN.min);
    const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
    world = "world"; mode = "perspective"; paint();
    open({ map: "world", x, z, distance: 170, angle: 1, rotation: Math.random() * 6.28, mode: "perspective" });
    if (client) client.send({ wl: "pins", pins: [{ x, z, kind: "spot", label: "A new player could land here" }] });
    say("Rolled a first spawn: x " + fmt(x) + ", z " + fmt(z) + ". New players land " + fmt(SPAWN.min) + " to " + fmt(SPAWN.max) + " blocks from 0, 0.");
  }

  /* load when the section comes close, unless the browser asked to save data, or on a phone, where downloading
     and drawing the map lags the page: there it waits for a tap (Load, the map's buttons, a coordinate link) */
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  if (!embeddable) root.dataset.state = "poster";
  else if (saveData || phone) {
    root.dataset.state = "ask";
    root.querySelectorAll("[data-mapx-ask]").forEach(el => { el.hidden = el.dataset.mapxAsk !== (phone ? "phone" : "save"); });   // the card says why it waits
  } else new IntersectionObserver((es, ob) => { if (es.some(e => e.isIntersecting)) { load(); ob.disconnect(); } }, { rootMargin: "250px" }).observe(root);
  if (loadBtn) loadBtn.addEventListener("click", () => load());

  /* the gate keeps page scrolling from turning into map zooming until someone clicks in */
  if (gate) gate.addEventListener("click", () => { load(); root.dataset.live = "1"; setTimeout(() => { try { frame.focus(); } catch (e) { /* ignore */ } }, 50); });
  new IntersectionObserver(es => { if (es.some(e => !e.isIntersecting)) root.dataset.live = "0"; }, { threshold: 0 }).observe(root);

  root.addEventListener("click", e => {
    const w = e.target.closest("[data-mapx-world]"), m = e.target.closest("[data-mapx-mode]"), act = e.target.closest("[data-mapx-act]");
    if (w || m || act) root.dataset.live = "1";   // someone using the map's buttons wants the map, not the page scroll
    if (w) {
      world = w.dataset.mapxWorld; const o = WORLDS[world] || WORLDS.world;
      paint(); say("");
      view({ map: world, x: 0, z: 0, distance: o.distance, angle: o.angle, rotation: .6, mode }, 0);
      if (client) client.send({ wl: "pins", pins: [] });
    } else if (m) {
      mode = m.dataset.mapxMode; paint();
      const c = client && client.camera;
      view({ mode, x: c ? c.x : 0, z: c ? c.z : 0, distance: c ? c.distance : START.distance, angle: mode === "flat" ? 0 : .8 }, 0);
    } else if (act) {
      const k = act.dataset.mapxAct;
      if (k === "spawn") { world = "world"; mode = "perspective"; paint(); say(""); view(START); if (client) client.send({ wl: "pins", pins: [] }); }
      else if (k === "roll") roll();
      else if (k === "full") {
        load(); root.dataset.live = "1";
        if (document.fullscreenElement) document.exitFullscreen();
        else if (root.requestFullscreen) root.requestFullscreen().catch(() => { root.dataset.full = root.dataset.full === "1" ? "0" : "1"; });
        else root.dataset.full = root.dataset.full === "1" ? "0" : "1";
      }
    }
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && root.dataset.full === "1") root.dataset.full = "0"; });

  /* links like index.html#map-x120-z-340 (coordinates posted on the community board) */
  function fromHash() {
    const m = /^#(?:map|at)-x(-?\d+)-z(-?\d+)$/.exec(location.hash);
    if (m) goto(Number(m[1]), Number(m[2]));
  }
  addEventListener("hashchange", fromHash);
  fromHash();
  paint();
  window.wellobyMap = { open: () => open(), goto, roll, spawn: () => open(START) };
})();
