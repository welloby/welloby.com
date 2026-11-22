/* Welloby spawn atlas. No dependencies. Reads window.WELLOBY.atlas (assets/data.js). */
(() => {
  "use strict";
  const W = window.WELLOBY || {};
  const root = document.querySelector("[data-atlas]");
  if (!root || !W.atlas || !W.atlas.surveys || !W.atlas.surveys.length) return;

  const $ = (s, el = root) => el.querySelector(s);
  const $$ = (s, el = root) => Array.from(el.querySelectorAll(s));
  const stage = $(".atlas-stage");
  const canvas = $(".atlas-canvas");
  const ctx = canvas.getContext("2d");
  const live = $("[data-atlas-live]");
  const PREVIEW = !!W.preview;
  const BASE = W.atlas.base || "atlas/";
  const SPAWN = W.atlas.spawn || { min: 100, max: 1000 };
  const STORE = "welloby.atlas.waypoints.v1";
  const WALK = 4.317, SPRINT = 5.612; // blocks per second, vanilla
  const C = { lava: "#ff6a1f", hot: "#ffb37a", bone: "#f3ecdb", ink: "#171614", ash: "#a59d8c", ember: "#c8361a" };
  const MONO = '500 11px "IBM Plex Mono", ui-monospace, Consolas, monospace';

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const fmt = n => (Math.round(n) || 0).toLocaleString("en-US").replace("-", "\u2212");
  const blocks = n => fmt(n) + (Math.round(n) === 1 ? " block" : " blocks");
  const about = n => { const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.max(1, n))) - 1)); return fmt(Math.round(n / p) * p); };
  const xz = p => "X " + fmt(p.x) + ", Z " + fmt(p.z);
  const dateOf = id => new Date(id + "T12:00:00Z");
  const dShort = id => dateOf(id).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const dLong = id => dateOf(id).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const say = t => { if (live) { live.textContent = ""; requestAnimationFrame(() => { live.textContent = t; }); } };
  const toast = t => window.dispatchEvent(new CustomEvent("welloby:toast", { detail: t }));
  const duration = s => { s = Math.round(s); if (s < 60) return s + " s"; const m = Math.floor(s / 60), r = s % 60; if (m < 60) return m + " min" + (r ? " " + r + " s" : ""); const h = Math.floor(m / 60); return h + " h " + (m % 60) + " min"; };

  /* ---------- surveys and level-of-detail images ---------- */
  const surveys = W.atlas.surveys.map(s => ({
    id: s.id, minX: s.minX, minZ: s.minZ, maxX: s.maxX, maxZ: s.maxZ, w: s.maxX - s.minX, h: s.maxZ - s.minZ,
    levels: s.levels.map(l => ({ px: l.px, src: BASE + l.src, img: null, state: 0 }))
  })).sort((a, b) => a.id < b.id ? -1 : 1);
  const latest = surveys[surveys.length - 1];
  const byId = id => surveys.find(s => s.id === id);
  const changeSets = (W.atlas.showChanges === false ? [] : (W.atlas.changes || [])).map(c => ({ ...c, img: null, state: 0 }));
  const change = changeSets[changeSets.length - 1] || null;
  const older = change ? byId(change.from) : (surveys.length > 1 ? surveys[surveys.length - 2] : null);
  const newer = change ? byId(change.to) : latest;

  const S = {
    w: 0, h: 0, dpr: 1, view: { x: 0, z: 0, k: 0.5 }, mode: "map", survey: latest.id, split: 0.5,
    layers: { grid: true, chunks: true, spawn: true, waypoints: true },
    sel: null, hover: null, measuring: false, measure: null, rolled: null, spot: -1,
    expanded: false, active: false, failed: false, near: false
  };
  let points = loadPoints();
  let raf = 0, needsDraw = true, anim = null, inertia = null, zoomTo = null, lastT = 0;

  function loadLevel(sv, i) {
    const l = sv.levels[i];
    if (!l || l.state) return;
    l.state = 1;
    const im = new Image();
    im.decoding = "async";
    im.onload = () => { l.img = im; l.state = 2; S.failed = false; redraw(); refreshThumbs(); };
    im.onerror = () => { l.state = 3; if (sv.levels.every(x => x.state === 3)) { S.failed = true; stage.dataset.failed = "1"; } redraw(); };
    im.src = l.src;
  }
  function wantLevel(sv) {
    const need = S.view.k * S.dpr * sv.w;
    let i = sv.levels.findIndex(l => l.px >= need * 0.8);
    return i < 0 ? sv.levels.length - 1 : i;
  }
  function bestImage(sv, min) {
    const want = Math.max(wantLevel(sv), min || 0);
    loadLevel(sv, 0);
    // ask for the wanted size once the small one is in, unless a bigger one is already on its way
    if (sv.levels[0].state >= 2 && S.near && !sv.levels.slice(want).some(l => l.state === 1 || l.state === 2)) loadLevel(sv, want);
    for (let i = want; i >= 0; i--) if (sv.levels[i].state === 2) return sv.levels[i].img;
    for (let i = want + 1; i < sv.levels.length; i++) if (sv.levels[i].state === 2) return sv.levels[i].img;
    return null;
  }
  function loadMask(c) {
    if (!c || c.state) return;
    c.state = 1;
    const im = new Image();
    im.onload = () => { c.img = im; c.state = 2; redraw(); };
    im.onerror = () => { c.state = 3; };
    im.src = BASE + c.mask;
  }

  /* ---------- view maths ---------- */
  const sx = x => S.w / 2 + (x - S.view.x) * S.view.k;
  const sy = z => S.h / 2 + (z - S.view.z) * S.view.k;
  const at = (px, py) => ({ x: S.view.x + (px - S.w / 2) / S.view.k, z: S.view.z + (py - S.h / 2) / S.view.k });
  const block = p => ({ x: Math.floor(p.x), z: Math.floor(p.z) });
  const shown = () => S.mode === "map" ? byId(S.survey) : newer;
  const inside = (p, sv) => p.x >= sv.minX && p.x < sv.maxX && p.z >= sv.minZ && p.z < sv.maxZ;
  const fitCover = sv => Math.max(S.w / sv.w, S.h / sv.h);
  const fitContain = (w, h) => Math.min(S.w / w, S.h / h);
  const kMin = () => Math.min(fitContain(shown().w, shown().h) * 0.8, 0.5);
  const K_MAX = 40;
  function constrain() {
    const sv = shown();
    S.view.k = clamp(S.view.k, kMin(), K_MAX);
    S.view.x = clamp(S.view.x, sv.minX, sv.maxX);
    S.view.z = clamp(S.view.z, sv.minZ, sv.maxZ);
  }
  function homeView() {
    const sv = shown();
    if (S.mode === "changes" && change) {
      return { x: (change.minX + change.maxX) / 2, z: (change.minZ + change.maxZ) / 2, k: fitContain(change.maxX - change.minX, change.maxZ - change.minZ) * 0.96 };
    }
    if (S.mode === "compare" && older) {
      return { x: (older.minX + older.maxX) / 2, z: (older.minZ + older.maxZ) / 2, k: Math.max(fitCover(older) * 0.9, fitContain(older.w, older.h)) };
    }
    return { x: (sv.minX + sv.maxX) / 2, z: (sv.minZ + sv.maxZ) / 2, k: fitCover(sv) };
  }

  /* ---------- drawing ---------- */
  function redraw() { needsDraw = true; if (!raf) raf = requestAnimationFrame(frame); }
  function frame(t) {
    raf = 0;
    const dt = Math.min(64, lastT ? t - lastT : 16);
    lastT = t;
    let moving = false;
    if (anim) {
      const p = clamp((t - anim.t0) / anim.ms, 0, 1), e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      S.view.x = anim.a.x + (anim.b.x - anim.a.x) * e;
      S.view.z = anim.a.z + (anim.b.z - anim.a.z) * e;
      S.view.k = Math.exp(Math.log(anim.a.k) + (Math.log(anim.b.k) - Math.log(anim.a.k)) * e);
      if (p >= 1) { const done = anim.done; anim = null; if (done) done(); } else moving = true;
    }
    if (zoomTo) {
      const before = at(zoomTo.px, zoomTo.py);
      const f = 1 - Math.exp(-dt / 70);
      S.view.k = Math.exp(Math.log(S.view.k) + (Math.log(zoomTo.k) - Math.log(S.view.k)) * f);
      if (Math.abs(Math.log(zoomTo.k / S.view.k)) < 0.004) { S.view.k = zoomTo.k; }
      const after = at(zoomTo.px, zoomTo.py);
      S.view.x += before.x - after.x; S.view.z += before.z - after.z;
      if (S.view.k === zoomTo.k) zoomTo = null; else moving = true;
      constrain();
    }
    if (inertia) {
      S.view.x -= inertia.vx * dt / S.view.k; S.view.z -= inertia.vy * dt / S.view.k;
      const d = Math.exp(-dt / 240); inertia.vx *= d; inertia.vy *= d;
      constrain();
      if (Math.hypot(inertia.vx, inertia.vy) < 0.02) inertia = null; else moving = true;
    }
    if (needsDraw || moving) { needsDraw = false; draw(); }
    if (moving) raf = requestAnimationFrame(frame); else lastT = 0;
  }
  function stopMotion() { anim = null; inertia = null; zoomTo = null; }
  function flyTo(v, ms, done) {
    stopMotion();
    const sv = shown();
    const b = { x: clamp(v.x, sv.minX, sv.maxX), z: clamp(v.z, sv.minZ, sv.maxZ), k: clamp(v.k || S.view.k, kMin(), K_MAX) };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || ms === 0) { S.view = b; redraw(); if (done) done(); return; }
    anim = { a: { ...S.view }, b, t0: performance.now(), ms: ms || 700, done };
    redraw();
  }

  let hatchPattern = null;
  function hatch(x, y, w, h, alpha) {
    if (!hatchPattern) {
      const c = document.createElement("canvas"); c.width = c.height = 12;
      const g = c.getContext("2d"); g.strokeStyle = "rgba(243,236,219,.16)"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(-3, 9); g.lineTo(9, -3); g.moveTo(3, 15); g.lineTo(15, 3); g.stroke();
      hatchPattern = ctx.createPattern(c, "repeat");
    }
    ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.fillStyle = hatchPattern; ctx.fillRect(x, y, w, h); ctx.restore();
  }
  function drawSurvey(sv, min) {
    const img = bestImage(sv, min);
    if (!img) return false;
    ctx.imageSmoothingEnabled = S.view.k * S.dpr * sv.w / img.naturalWidth < 2.2;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx(sv.minX), sy(sv.minZ), sv.w * S.view.k, sv.h * S.view.k);
    return true;
  }
  function label(x, y, text, fg, bg, align) {
    ctx.font = MONO; ctx.textBaseline = "middle";
    const w = Math.ceil(ctx.measureText(text).width) + 12;
    let left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    left = clamp(Math.round(left), 4, Math.max(4, S.w - w - 4));
    const top = clamp(Math.round(y), 4, Math.max(4, S.h - 24));
    ctx.fillStyle = bg; ctx.fillRect(left, top, w, 20);
    ctx.fillStyle = fg; ctx.textAlign = "left"; ctx.fillText(text, left + 6, top + 10.5);
    return { left, top, w };
  }
  function niceStep(target) {
    const d = Math.pow(10, Math.floor(Math.log10(Math.max(1e-3, target))));
    return ([1, 2, 5, 10].find(n => n * d >= target) || 10) * d;
  }
  function drawGrid() {
    const a = at(0, 0), b = at(S.w, S.h), k = S.view.k;
    ctx.lineWidth = 1;
    if (S.layers.chunks && k >= 3) {
      ctx.strokeStyle = "rgba(243,236,219," + clamp((k - 3) / 6, .08, .22) + ")";
      ctx.beginPath();
      for (let x = Math.ceil(a.x / 16) * 16; x <= b.x; x += 16) { const p = Math.round(sx(x)) + .5; ctx.moveTo(p, 0); ctx.lineTo(p, S.h); }
      for (let z = Math.ceil(a.z / 16) * 16; z <= b.z; z += 16) { const p = Math.round(sy(z)) + .5; ctx.moveTo(0, p); ctx.lineTo(S.w, p); }
      ctx.stroke();
    }
    if (!S.layers.grid) return;
    const step = niceStep(110 / k);
    ctx.font = MONO; ctx.textBaseline = "top";
    for (let x = Math.ceil(a.x / step) * step; x <= b.x; x += step) {
      const p = Math.round(sx(x)) + .5;
      ctx.strokeStyle = x === 0 ? "rgba(255,160,100,.5)" : "rgba(243,236,219,.17)";
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, S.h); ctx.stroke();
      if (p > 46 && p < S.w - 60) { ctx.textAlign = "left"; shadowText(fmt(x), p + 5, 7); }
    }
    for (let z = Math.ceil(a.z / step) * step; z <= b.z; z += step) {
      const p = Math.round(sy(z)) + .5;
      ctx.strokeStyle = z === 0 ? "rgba(255,160,100,.5)" : "rgba(243,236,219,.17)";
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(S.w, p); ctx.stroke();
      if (p > 30 && p < S.h - 40) { ctx.textAlign = "left"; shadowText(fmt(z), 7, p + 5); }
    }
  }
  function shadowText(t, x, y) {
    ctx.fillStyle = "rgba(15,14,12,.75)"; ctx.fillText(t, x + 1, y + 1);
    ctx.fillStyle = "rgba(243,236,219,.82)"; ctx.fillText(t, x, y);
  }
  function drawSpawnBand() {
    const x = sx(0), y = sy(0), k = S.view.k, r1 = SPAWN.min * k, r2 = SPAWN.max * k;
    if (x + r2 < 0 || x - r2 > S.w || y + r2 < 0 || y - r2 > S.h) return;
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r2, 0, Math.PI * 2); ctx.moveTo(x + r1, y); ctx.arc(x, y, r1, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,106,31,.055)"; ctx.fill("evenodd");
    ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(255,150,90,.9)"; ctx.setLineDash([7, 6]);
    ctx.beginPath(); ctx.arc(x, y, r2, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([3, 4]); ctx.strokeStyle = "rgba(255,150,90,.75)";
    ctx.beginPath(); ctx.arc(x, y, r1, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    const lx = x + r2 * 0.7071, ly = y - r2 * 0.7071;
    if (lx > 30 && lx < S.w - 150 && ly > 34 && ly < S.h - 30) label(lx + 6, ly - 22, "first spawn, to " + fmt(SPAWN.max), "#ffd9bf", "rgba(35,24,18,.9)");
  }
  function marker(p, text, kind) {
    const x = sx(p.x + .5), y = sy(p.z + .5);
    if (x < -40 || y < -40 || x > S.w + 40 || y > S.h + 40) return;
    ctx.save(); ctx.translate(Math.round(x), Math.round(y));
    if (kind === "origin") {
      ctx.rotate(Math.PI / 4); ctx.fillStyle = C.lava; ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
      ctx.fillRect(-6, -6, 12, 12); ctx.strokeRect(-6, -6, 12, 12);
    } else if (kind === "rolled") {
      ctx.fillStyle = C.bone; ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5;
      ctx.fillRect(-6, -6, 12, 12); ctx.strokeRect(-6, -6, 12, 12);
      ctx.fillStyle = C.ink; ctx.fillRect(-1.5, -1.5, 3, 3);
    } else {
      ctx.fillStyle = C.bone; ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-6, -9); ctx.lineTo(-6, -18); ctx.lineTo(6, -18); ctx.lineTo(6, -9); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.lava; ctx.fillRect(-2.5, -15.5, 5, 5);
    }
    ctx.restore();
    if (text) label(x + 12, y - (kind === "origin" || kind === "rolled" ? 10 : 24), text, kind === "origin" ? C.ink : C.bone, kind === "origin" ? "#ff8a4b" : "rgba(23,22,20,.9)");
  }
  function drawSelection() {
    if (!S.sel) return;
    const k = S.view.k, x = sx(S.sel.x), y = sy(S.sel.z);
    ctx.save();
    if (k >= 5) {
      ctx.strokeStyle = C.ink; ctx.lineWidth = 4; ctx.strokeRect(x, y, k, k);
      ctx.strokeStyle = C.bone; ctx.lineWidth = 2; ctx.strokeRect(x, y, k, k);
    } else {
      const cx = x + k / 2, cy = y + k / 2;
      ctx.strokeStyle = C.ink; ctx.lineWidth = 4.5; cross(cx, cy);
      ctx.strokeStyle = C.bone; ctx.lineWidth = 2; cross(cx, cy);
    }
    ctx.restore();
  }
  function cross(cx, cy) {
    ctx.beginPath(); ctx.rect(cx - 7, cy - 7, 14, 14);
    ctx.moveTo(cx, cy - 15); ctx.lineTo(cx, cy - 9); ctx.moveTo(cx, cy + 9); ctx.lineTo(cx, cy + 15);
    ctx.moveTo(cx - 15, cy); ctx.lineTo(cx - 9, cy); ctx.moveTo(cx + 9, cy); ctx.lineTo(cx + 15, cy); ctx.stroke();
  }
  function drawMeasure() {
    const m = S.measure; if (!m || !m.a) return;
    const b = m.b || (S.measuring && S.hover ? block(S.hover) : null);
    const ax = sx(m.a.x + .5), ay = sy(m.a.z + .5);
    ctx.save();
    if (b) {
      const bx = sx(b.x + .5), by = sy(b.z + .5);
      ctx.lineCap = "round";
      ctx.strokeStyle = C.ink; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.strokeStyle = C.bone; ctx.lineWidth = 2; ctx.setLineDash([8, 5]); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
      end(bx, by);
      const d = Math.hypot(b.x - m.a.x, b.z - m.a.z), mx = (ax + bx) / 2, my = (ay + by) / 2;
      if (mx > 40 && mx < S.w - 40 && my > 40 && my < S.h - 30) label(mx, my - 26, blocks(d), C.ink, C.bone, "center");
    }
    end(ax, ay);
    ctx.restore();
    function end(x, y) { ctx.fillStyle = C.bone; ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.fillRect(x - 4.5, y - 4.5, 9, 9); ctx.strokeRect(x - 4.5, y - 4.5, 9, 9); }
  }
  function drawSpots() {
    if (!change) return;
    change.spots.forEach((s, i) => {
      const x0 = sx(s.x0), y0 = sy(s.z0), w = (s.x1 - s.x0 + 1) * S.view.k, h = (s.z1 - s.z0 + 1) * S.view.k;
      if (x0 > S.w || y0 > S.h || x0 + w < 0 || y0 + h < 0) return;
      const on = i === S.spot;
      ctx.save();
      ctx.strokeStyle = on ? C.bone : "rgba(243,236,219,.55)"; ctx.lineWidth = on ? 2 : 1;
      const pad = 5;
      ctx.strokeRect(Math.round(x0 - pad) + .5, Math.round(y0 - pad) + .5, Math.round(w + pad * 2), Math.round(h + pad * 2));
      ctx.restore();
      const tag = String(i + 1);
      ctx.font = MONO; const tw = Math.ceil(ctx.measureText(tag).width) + 10;
      const lx = Math.round(x0 - pad), ly = Math.round(y0 - pad - 18);
      ctx.fillStyle = on ? C.bone : C.lava; ctx.fillRect(lx, ly, tw, 18);
      ctx.fillStyle = C.ink; ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.fillText(tag, lx + 5, ly + 9.5);
    });
  }
  function draw() {
    const { w, h } = S;
    if (!w || !h) return;
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    ctx.fillStyle = "#1c1a17"; ctx.fillRect(0, 0, w, h); hatch(0, 0, w, h);
    const sv = shown();
    let have = false;
    if (S.mode === "compare" && older) {
      have = drawSurvey(newer);
      const split = Math.round(S.split * w);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, split, h); ctx.clip();
      ctx.fillStyle = "rgba(23,22,20,.72)"; ctx.fillRect(0, 0, split, h); hatch(0, 0, split, h, .8);
      const ok = drawSurvey(older, older.levels.length - 1);
      ctx.restore();
      if (!ok) loadLevel(older, 0);
      const ox0 = sx(older.minX), oy0 = sy(older.minZ), oy1 = sy(older.maxZ);
      if (ox0 > 150 && split > 150) label(Math.min(ox0, split) - 8, clamp((Math.max(oy0, 0) + Math.min(oy1, h)) / 2 - 10, 60, h - 60), "not surveyed on " + dShort(older.id), C.bone, "rgba(23,22,20,.88)", "right");
    } else if (S.mode === "changes" && change) {
      have = drawSurvey(newer, newer.levels.length - 1);   // the list thumbnails need the full size anyway
      loadMask(change);
      const x0 = sx(sv.minX), y0 = sy(sv.minZ), ww = sv.w * S.view.k, hh = sv.h * S.view.k;
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, y0, ww, hh); ctx.clip();
      ctx.globalCompositeOperation = "saturation"; ctx.fillStyle = "#808080"; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "multiply"; ctx.fillStyle = "#5c5952"; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
      const cx0 = sx(change.minX), cy0 = sy(change.minZ), cw = (change.maxX - change.minX) * S.view.k, ch = (change.maxZ - change.minZ) * S.view.k;
      // outside the compared square
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.rect(cx0, cy0, cw, ch); ctx.clip("evenodd");
      ctx.fillStyle = "rgba(23,22,20,.6)"; ctx.fillRect(0, 0, w, h); hatch(0, 0, w, h, .7); ctx.restore();
      if (change.img) {
        ctx.imageSmoothingEnabled = S.view.k * S.dpr < 2.2;
        ctx.drawImage(change.img, cx0, cy0, cw, ch);
        ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = .35;
        ctx.drawImage(change.img, cx0, cy0, cw, ch);
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = "rgba(243,236,219,.4)"; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.strokeRect(Math.round(cx0) + .5, Math.round(cy0) + .5, Math.round(cw), Math.round(ch)); ctx.setLineDash([]);
      ctx.restore();
      if (cy0 > 34 && cx0 < w - 220) label(Math.max(cx0, 8), cy0 - 26, "compared area: " + fmt(change.maxX - change.minX) + " \u00d7 " + fmt(change.maxZ - change.minZ) + " blocks", C.bone, "rgba(23,22,20,.88)");
    } else {
      have = drawSurvey(sv);
    }
    stage.dataset.loading = have ? "0" : "1";
    drawGrid();
    if (S.layers.spawn && S.mode !== "changes") drawSpawnBand();
    if (S.mode === "changes") drawSpots();
    marker({ x: 0, z: 0 }, S.view.k > 0.2 ? "0, 0" : "", "origin");
    if (S.layers.waypoints) for (const p of points) if (inside(p, sv)) marker(p, p.name, "pin");
    if (S.rolled) marker(S.rolled, "example spawn", "rolled");
    drawMeasure();
    drawSelection();
    updateHud();
  }

  /* ---------- selection bar on the map, for phones and for a closed panel ---------- */
  const selbar = $(".atlas-selbar");
  const stacked = matchMedia("(max-width: 980px)");
  function updateSelbar() { if (selbar) selbar.hidden = !(S.sel && (root.dataset.panel === "0" || (stacked.matches && !S.expanded))); }
  if (stacked.addEventListener) stacked.addEventListener("change", updateSelbar);

  /* ---------- HUD ---------- */
  const hudPos = $("[data-hud-pos]"), hudSub = $("[data-hud-sub]"), scaleLabel = $("[data-scale-label]"), scaleBar = $("[data-scale-bar]");
  const splitEl = $(".atlas-split"), splitA = $("[data-split-a]"), splitB = $("[data-split-b]");
  function updateHud() {
    const p = block(S.hover || S.sel || S.view), sv = shown();
    hudPos.textContent = "X " + fmt(p.x) + "  Z " + fmt(p.z);
    hudSub.textContent = inside(p, sv)
      ? "Nether " + fmt(Math.floor(p.x / 8)) + ", " + fmt(Math.floor(p.z / 8)) + (S.view.k >= 3 ? "  \u00b7  chunk " + fmt(Math.floor(p.x / 16)) + ", " + fmt(Math.floor(p.z / 16)) : "")
      : "outside the survey";
    const seg = niceStep(64 / S.view.k);
    scaleLabel.textContent = fmt(seg) + (seg === 1 ? " block" : " blocks");
    scaleBar.style.width = Math.max(2, seg * S.view.k) + "px";
    if (splitEl) splitEl.style.left = (S.split * 100) + "%";
  }

  /* ---------- hint line on the map ---------- */
  const hintEl = $(".atlas-hint");
  let hintT = 0;
  function showHint(text, ms) {
    if (!hintEl) return;
    clearTimeout(hintT);
    hintEl.textContent = text; hintEl.dataset.show = "1";
    if (ms) hintT = setTimeout(() => { if (S.measuring) showHint("Measuring: click two points"); else hintEl.dataset.show = "0"; }, ms);
  }
  function hideHint() { clearTimeout(hintT); if (hintEl) hintEl.dataset.show = "0"; }

  /* ---------- modes ---------- */
  function setMode(mode, quiet) {
    if (mode === "compare" && !older) mode = "map";
    if (mode === "changes" && !change) mode = "map";
    S.mode = mode; S.spot = -1;
    root.dataset.mode = mode;
    $$("[data-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
    if (mode !== "map") { loadLevel(older, 0); loadLevel(older, older.levels.length - 1); }
    if (mode === "changes") loadMask(change);
    constrain();
    if (!quiet) flyTo(homeView(), 650);
    if (!quiet && mode === "compare") showHint("Drag the divider", 2800); else if (!S.measuring) hideHint();
    renderPanel(); redraw();
    if (!quiet) say(mode === "map" ? "Map view, survey of " + dLong(S.survey) + "." : mode === "compare" ? "Compare view. " + dShort(older.id) + " on the left, " + dShort(newer.id) + " on the right. Drag the divider." : "Changes view. Everything that changed between surveys is lit in orange.");
  }
  function setSurvey(id, quiet) {
    if (!byId(id)) return;
    S.survey = id;
    $$("[data-survey]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.survey === id)));
    const sv = byId(id);
    if (S.sel && !inside(S.sel, sv)) { S.sel = null; S.rolled = null; }
    if (!quiet && S.w) {
      const a = at(0, 0), b = at(S.w, S.h);
      const fits = a.x >= sv.minX - 1 && a.z >= sv.minZ - 1 && b.x <= sv.maxX + 1 && b.z <= sv.maxZ + 1;
      if (!fits) flyTo(homeView(), 500);
    }
    constrain(); renderPanel(); redraw();
    if (!quiet) say("Survey of " + dLong(id) + ".");
  }

  /* ---------- selection, waypoints, measure ---------- */
  function select(p, opts) {
    const b = block(p), sv = shown();
    if (!inside(b, sv)) { say("That block is outside the survey."); return false; }
    S.sel = b; S.hover = null;
    renderPanel(); redraw();
    if (!opts || !opts.quiet) say("Selected " + xz(b) + ".");
    return true;
  }
  function goTo(p, k) {
    const b = block(p);
    if (!inside(b, shown())) return false;
    flyTo({ x: b.x + .5, z: b.z + .5, k: Math.max(S.view.k, k || 3) }, 800);
    select(b, { quiet: true });
    return true;
  }
  function loadPoints() {
    try {
      const data = JSON.parse(localStorage.getItem(STORE) || "[]");
      return Array.isArray(data) ? data.filter(p => p && typeof p.id === "string" && typeof p.name === "string" && p.name.length > 0 && p.name.length <= 40 && Number.isSafeInteger(p.x) && Number.isSafeInteger(p.z)).slice(0, 100) : [];
    } catch (e) { return []; }
  }
  function storePoints(next) {
    points = next;
    let ok = true;
    try { localStorage.setItem(STORE, JSON.stringify(next)); } catch (e) { ok = false; }
    renderPanel(); redraw();
    return ok;
  }
  function measureClick(p) {
    const b = block(p);
    if (!S.measure || !S.measure.a || S.measure.b) { S.measure = { a: b, b: null }; say("Measuring from " + xz(b) + ". Click the second point."); }
    else { S.measure.b = b; S.measuring = false; root.dataset.measuring = "0"; $("[data-act=measure]").setAttribute("aria-pressed", "false"); say("Distance " + blocks(Math.hypot(b.x - S.measure.a.x, b.z - S.measure.a.z)) + "."); hideHint(); }
    renderPanel(); redraw();
  }
  function toggleMeasure(from) {
    S.measuring = !S.measuring || !!from;
    root.dataset.measuring = S.measuring ? "1" : "0";
    $("[data-act=measure]").setAttribute("aria-pressed", String(S.measuring));
    S.measure = S.measuring ? (from ? { a: block(from), b: null } : null) : S.measure;
    if (S.measuring) { say(from ? "Measuring from " + xz(block(from)) + ". Click the second point." : "Measure on. Click two points on the map."); showHint(from ? "Measuring: click the second point" : "Measuring: click two points"); }
    else hideHint();
    renderPanel(); redraw();
  }
  function rollSpawn() {
    const t = Math.random() * Math.PI * 2, u = Math.random();
    const r = Math.sqrt(u * (SPAWN.max * SPAWN.max - SPAWN.min * SPAWN.min) + SPAWN.min * SPAWN.min);
    const p = { x: Math.round(Math.cos(t) * r), z: Math.round(Math.sin(t) * r) };
    if (S.mode !== "map") setMode("map", true);
    if (S.survey !== latest.id) setSurvey(latest.id, true);
    S.rolled = p; S.sel = p;
    flyTo({ x: p.x + .5, z: p.z + .5, k: clamp(S.w / 260, 2.5, 5) }, 1100);
    renderPanel();
    say("Example spawn at " + xz(p) + ", " + blocks(Math.hypot(p.x, p.z)) + " from 0, 0.");
  }

  /* ---------- deep links ---------- */
  function hashFor(p) {
    return "#at-x" + p.x + "-z" + p.z + "-k" + Math.round(clamp(S.view.k, 0.2, K_MAX) * 10) + (S.mode === "map" && S.survey !== latest.id ? "-s" + S.survey.replace(/-/g, "") : "");
  }
  function readHash() {
    const m = /^#at-x(-?\d{1,7})-z(-?\d{1,7})(?:-k(\d{1,3}))?(?:-s(\d{8}))?$/.exec(location.hash);
    if (!m) return false;
    const id = m[4] ? m[4].slice(0, 4) + "-" + m[4].slice(4, 6) + "-" + m[4].slice(6) : latest.id;
    if (S.mode !== "map") setMode("map", true);
    if (byId(id)) setSurvey(id, true);
    const p = { x: +m[1], z: +m[2] };
    if (!inside(p, shown())) return false;
    S.view = { x: p.x + .5, z: p.z + .5, k: clamp((+m[3] || 30) / 10, kMin(), K_MAX) };
    select(p, { quiet: true });
    redraw();
    return true;
  }
  async function copy(text, okMsg) {
    try { await navigator.clipboard.writeText(text); toast(okMsg); return true; }
    catch (e) {
      const f = document.createElement("textarea"); f.value = text; f.readOnly = true; f.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0";
      (S.expanded ? root : document.body).append(f); f.select();
      let ok = false; try { ok = document.execCommand("copy"); } catch (e2) { /* manual copy below */ }
      f.remove();
      toast(ok ? okMsg : "Copy it yourself: " + text);
      return ok;
    }
  }
  function share() {
    const p = S.sel || block(S.view);
    const h = hashFor(p);
    if (PREVIEW) { try { history.replaceState(null, "", h); } catch (e) { /* preview frame */ } copy(xz(p).replace(/\u2212/g, "-"), "Copied " + xz(p) + ". Links to a spot work on the hosted site."); return; }
    try { history.replaceState(null, "", h); } catch (e) { location.hash = h; }
    copy(location.origin + location.pathname + h, "Link to " + xz(p) + " copied");
  }

  function saveImage() {
    if (PREVIEW) { toast("Saving pictures works once the site is hosted. This is a preview."); return; }
    const sv = shown(), bar = Math.round(38 * S.dpr), c = document.createElement("canvas");
    c.width = canvas.width; c.height = canvas.height + bar;
    const g = c.getContext("2d");
    try {
      g.drawImage(canvas, 0, 0);
      g.fillStyle = C.ink; g.fillRect(0, canvas.height, c.width, bar);
      g.fillStyle = C.lava; g.fillRect(0, canvas.height, c.width, Math.max(2, Math.round(2 * S.dpr)));
      g.font = "500 " + Math.round(13 * S.dpr) + 'px "IBM Plex Mono", ui-monospace, monospace'; g.textBaseline = "middle"; g.fillStyle = C.bone;
      const mid = canvas.height + bar / 2 + S.dpr, p = S.sel || block(S.view);
      g.textAlign = "left"; g.fillText("Welloby spawn atlas, " + (S.mode === "map" ? dShort(sv.id) : dShort(older.id) + " to " + dShort(newer.id)) + "  |  X " + p.x + ", Z " + p.z, Math.round(12 * S.dpr), mid);
      g.textAlign = "right"; g.fillStyle = C.lava; g.fillText("mc.welloby.com", c.width - Math.round(12 * S.dpr), mid);
      // toDataURL is synchronous; toBlob waits for an idle moment that some browsers never give after a click
      const bin = atob(c.toDataURL("image/png").split(",")[1]), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const a = document.createElement("a"), url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
      a.href = url; a.download = "welloby-spawn-x" + p.x + "-z" + p.z + ".png";
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast("Picture saved");
    } catch (e) { toast("This browser blocked the export. It works when the site is opened from a web address."); }
  }

  /* ---------- panel ---------- */
  const panel = $("[data-atlas-panel]");
  const el = (tag, attrs, kids) => {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) { if (k === "text") n.textContent = attrs[k]; else if (k === "html") n.innerHTML = attrs[k]; else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k]); }
    if (kids) for (const c of [].concat(kids)) if (c) n.append(c);
    return n;
  };
  const icon = id => '<svg class="i" aria-hidden="true"><use href="#i-' + id + '"/></svg>';
  let thumbs = [];
  function refreshThumbs() { for (const t of thumbs) drawThumb(t); }
  function drawThumb(t) {
    const sv = byId(t.id), s = t.spot, c = t.canvas, g = c.getContext("2d");
    let img = null;
    for (let i = sv.levels.length - 1; i >= 0; i--) if (sv.levels[i].state === 2) { img = sv.levels[i].img; break; }
    loadLevel(sv, sv.levels.length - 1);
    if (!img) return;
    const side = Math.max(s.x1 - s.x0, s.z1 - s.z0) + 28, cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
    const f = img.naturalWidth / sv.w;
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    g.fillStyle = "#1c1a17"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, (cx - side / 2 - sv.minX) * f, (cz - side / 2 - sv.minZ) * f, side * f, side * f, 0, 0, c.width, c.height);
  }
  function renderPanel() {
    updateSelbar();
    if (!panel) return;
    const keep = document.activeElement && panel.contains(document.activeElement) ? document.activeElement.getAttribute("data-k") : null;
    panel.textContent = ""; thumbs = [];
    const sv = shown();

    if (S.mode === "changes" && change) {
      const days = Math.round((dateOf(change.to) - dateOf(change.from)) / 864e5);
      const box = el("section", { class: "ap-card ap-changes" }, [
        el("h3", { text: dShort(change.from) + " to " + dShort(change.to) }),
        el("p", { class: "ap-lede", html: "<b>" + days + " days.</b> About <b>1 in " + Math.max(2, Math.round(1 / Math.max(change.changedShare || 0, 1e-6))) + "</b> surface blocks changed within " + fmt((change.maxX - change.minX) / 2) + " blocks of 0, 0. Everything lit in orange is different. The largest areas:" })
      ]);
      const list = el("ol", { class: "ap-spots" });
      change.spots.forEach((s, i) => {
        const before = el("canvas", { width: 96, height: 96, "aria-hidden": "true" }), after = el("canvas", { width: 96, height: 96, "aria-hidden": "true" });
        thumbs.push({ id: change.from, spot: s, canvas: before }, { id: change.to, spot: s, canvas: after });
        const b = el("button", { type: "button", class: "ap-spot", "data-k": "spot" + i, "aria-pressed": String(S.spot === i), onclick: () => { S.spot = i; const side = Math.max(s.x1 - s.x0, s.z1 - s.z0) + 60; flyTo({ x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2, k: clamp(Math.min(S.w, S.h) / side, 1, 9) }, 800); renderPanel(); say("Area " + (i + 1) + ", " + xz(s) + "."); } }, [
          el("span", { class: "ap-spot-n", text: String(i + 1) }),
          el("span", { class: "ap-pair" }, [before, after]),
          el("span", { class: "ap-spot-t" }, [
            el("b", { text: s.where === "at spawn" ? "At spawn" : fmt(s.dist) + " blocks " + s.where }),
            el("small", { text: xz(s) }),
            el("small", { text: "about " + about(s.area) + " blocks" })
          ])
        ]);
        list.append(el("li", null, b));
      });
      box.append(list, el("p", { class: "ap-note", text: "Left picture " + dShort(change.from) + ", right " + dShort(change.to) + ". Found by comparing the two surveys block by block, with render noise filtered out. Counts are estimates." }));
      panel.append(box);
    }

    if (S.sel) {
      const p = S.sel, d = Math.hypot(p.x, p.z), inBand = d >= SPAWN.min && d <= SPAWN.max;
      const name = el("input", { type: "text", id: "ap-wp-name", maxlength: 40, placeholder: "Name this spot", autocomplete: "off", "data-k": "wpname", "aria-label": "Waypoint name" });
      const save = () => {
        const n = name.value.trim();
        if (!n) { name.focus(); return; }
        const cur = loadPoints();
        if (cur.length >= 100) { toast("100 waypoints is the limit. Remove one first."); return; }
        const id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + String(Math.random()).slice(2);
        const ok = storePoints(cur.concat([{ id, name: n, x: p.x, z: p.z }]));
        toast(ok ? "Saved " + n : "Saved for this visit only: this browser is blocking storage");
      };
      name.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); save(); } });
      panel.append(el("section", { class: "ap-card ap-sel" }, [
        el("div", { class: "ap-head" }, [el("h3", { text: "Selected block" }), el("button", { type: "button", class: "ap-x", "aria-label": "Clear selection", html: icon("x"), onclick: () => { S.sel = null; S.rolled = null; renderPanel(); redraw(); } })]),
        el("p", { class: "ap-coord", text: xz(p) }),
        el("dl", { class: "ap-facts" }, [
          el("dt", { text: "Nether" }), el("dd", { text: "X " + fmt(Math.floor(p.x / 8)) + ", Z " + fmt(Math.floor(p.z / 8)) }),
          el("dt", { text: "From 0, 0" }), el("dd", { text: blocks(d) + (inBand ? ", inside the first-spawn range" : "") }),
          el("dt", { text: "Chunk" }), el("dd", { text: fmt(Math.floor(p.x / 16)) + ", " + fmt(Math.floor(p.z / 16)) })
        ]),
        el("div", { class: "ap-save" }, [name, el("button", { type: "button", class: "btn btn-lava btn-s", "data-k": "wpsave", text: "Save", onclick: save })]),
        el("div", { class: "ap-row" }, [
          el("button", { type: "button", class: "btn btn-line btn-s", "data-k": "copyxz", html: icon("copy") + "Copy", onclick: () => copy(p.x + " " + p.z, "Copied " + xz(p)) }),
          el("button", { type: "button", class: "btn btn-line btn-s", "data-k": "sharexz", html: icon("link") + "Link", onclick: share }),
          el("button", { type: "button", class: "btn btn-line btn-s", "data-k": "measxz", html: icon("ruler") + "Measure from here", onclick: () => toggleMeasure(p) })
        ])
      ]));
    }

    if (S.measure && S.measure.a) {
      const m = S.measure, kids = [el("div", { class: "ap-head" }, [el("h3", { text: "Distance" }), el("button", { type: "button", class: "ap-x", "aria-label": "Clear measurement", html: icon("x"), onclick: () => { S.measure = null; S.measuring = false; root.dataset.measuring = "0"; $("[data-act=measure]").setAttribute("aria-pressed", "false"); hideHint(); renderPanel(); redraw(); } })])];
      if (m.b) {
        const d = Math.hypot(m.b.x - m.a.x, m.b.z - m.a.z);
        kids.push(el("p", { class: "ap-coord", text: blocks(d) }),
          el("dl", { class: "ap-facts" }, [
            el("dt", { text: "From" }), el("dd", { text: xz(m.a) }),
            el("dt", { text: "To" }), el("dd", { text: xz(m.b) }),
            el("dt", { text: "Sprinting" }), el("dd", { text: "about " + duration(d / SPRINT) }),
            el("dt", { text: "Walking" }), el("dd", { text: "about " + duration(d / WALK) }),
            el("dt", { text: "Via the Nether" }), el("dd", { text: blocks(d / 8) + ", about " + duration(d / 8 / SPRINT) + " sprinting" })
          ]),
          el("p", { class: "ap-note", text: "Straight line on flat ground. Real terrain is slower." }));
      } else kids.push(el("p", { class: "ap-lede", text: "From " + xz(m.a) + ". Click the second point on the map." }));
      panel.append(el("section", { class: "ap-card" }, kids));
    }

    // go to / portal maths
    const dim = el("select", { id: "ap-dim", "data-k": "dim", "aria-label": "Dimension of these coordinates" }, [el("option", { value: "overworld", text: "Overworld" }), el("option", { value: "nether", text: "Nether" })]);
    const ix = el("input", { id: "ap-x", type: "text", inputmode: "numeric", autocomplete: "off", "data-k": "gx", placeholder: "0", "aria-label": "X coordinate" });
    const iz = el("input", { id: "ap-z", type: "text", inputmode: "numeric", autocomplete: "off", "data-k": "gz", placeholder: "0", "aria-label": "Z coordinate" });
    const out = el("output", { class: "ap-out", for: "ap-x ap-z ap-dim" });
    const go = el("button", { type: "button", class: "btn btn-bone btn-s", "data-k": "goto", html: icon("pin") + "Show on map" });
    if (renderPanel.memo) { dim.value = renderPanel.memo.dim; ix.value = renderPanel.memo.x; iz.value = renderPanel.memo.z; }
    const num = v => { const t = String(v).trim().replace(/\u2212/g, "-").replace(/,/g, ""); if (!/^[-+]?\d+(\.\d+)?$/.test(t)) return null; const n = Math.floor(Number(t)); return Math.abs(n) <= 3e7 ? n : null; };
    let target = null;
    const calc = () => {
      renderPanel.memo = { dim: dim.value, x: ix.value, z: iz.value };
      const x = num(ix.value === "" ? "0" : ix.value), z = num(iz.value === "" ? "0" : iz.value);
      ix.setAttribute("aria-invalid", String(x === null)); iz.setAttribute("aria-invalid", String(z === null));
      if (x === null || z === null) { out.textContent = "Whole numbers only, for example -120 and 340."; go.disabled = true; target = null; return; }
      const nether = dim.value === "nether";
      const ow = nether ? { x: x * 8, z: z * 8 } : { x, z };
      out.textContent = nether ? "Overworld X " + fmt(ow.x) + ", Z " + fmt(ow.z) : "Nether portal at X " + fmt(Math.floor(x / 8)) + ", Z " + fmt(Math.floor(z / 8));
      target = ow; go.disabled = false;
      if (!inside(ow, sv)) out.textContent += ". Outside the surveyed area.";
    };
    const paste = e => {
      const t = (e.clipboardData || window.clipboardData).getData("text"), n = (t.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
      if (n.length < 2) return;
      e.preventDefault(); ix.value = String(Math.floor(n[0])); iz.value = String(Math.floor(n[n.length === 2 ? 1 : 2])); calc();
    };
    const show = () => {
      calc();
      if (!target) return;
      if (!goTo(target)) out.textContent = "X " + fmt(target.x) + ", Z " + fmt(target.z) + " is outside this survey (" + fmt(sv.minX) + " to " + fmt(sv.maxX - 1) + ").";
      else if (!stacked.matches) canvas.focus({ preventScroll: true });
    };
    const onEnter = e => { if (e.key === "Enter") { e.preventDefault(); show(); } };
    go.addEventListener("click", show); ix.addEventListener("keydown", onEnter); iz.addEventListener("keydown", onEnter);
    ix.addEventListener("input", calc); iz.addEventListener("input", calc); dim.addEventListener("change", calc); ix.addEventListener("paste", paste);
    panel.append(el("section", { class: "ap-card" }, [
      el("h3", { text: "Go to coordinates" }),
      el("div", { class: "ap-goto" }, [
        el("label", { class: "ap-field ap-dim", for: "ap-dim" }, [el("span", { text: "These are" }), dim]),
        el("div", { class: "ap-xz" }, [el("label", { class: "ap-field", for: "ap-x" }, [el("span", { text: "X" }), ix]), el("label", { class: "ap-field", for: "ap-z" }, [el("span", { text: "Z" }), iz])]),
        out, go
      ]),
      el("p", { class: "ap-note", text: "Paste \u201cx y z\u201d from the game and it fills both boxes. Overworld to Nether divides by 8." })
    ]));
    calc();

    // waypoints
    const wp = el("section", { class: "ap-card" }, [el("div", { class: "ap-head" }, [el("h3", { text: "Waypoints" }), el("span", { class: "ap-count", text: String(points.length) })])]);
    if (!points.length) wp.append(el("p", { class: "ap-lede", text: "Click any block on the map, name it, save it. Waypoints stay in this browser; nobody else sees them." }));
    else {
      const ul = el("ul", { class: "ap-wps" });
      points.forEach((p, i) => ul.append(el("li", null, [
        el("button", { type: "button", class: "ap-wp", "data-k": "wp" + i, disabled: !inside(p, sv), title: inside(p, sv) ? "Go to " + p.name : "Outside this survey", onclick: () => goTo(p) }, [el("b", { text: p.name }), el("small", { text: fmt(p.x) + ", " + fmt(p.z) })]),
        el("button", { type: "button", class: "ap-x", "aria-label": "Remove " + p.name, html: icon("trash"), onclick: () => { storePoints(loadPoints().filter(q => q.id !== p.id)); say("Removed " + p.name + "."); } })
      ])));
      wp.append(ul, el("button", { type: "button", class: "btn btn-line btn-s", "data-k": "wpcopy", html: icon("copy") + "Copy all as text", onclick: () => copy(points.map(p => p.name + ": " + p.x + " " + p.z).join("\n"), "Copied " + points.length + " waypoints") }));
    }
    panel.append(wp);

    // layers
    const layer = (key, title, note) => {
      const box = el("input", { type: "checkbox", id: "ap-l-" + key, "data-k": "l" + key });
      box.checked = S.layers[key];
      box.addEventListener("change", () => { S.layers[key] = box.checked; redraw(); });
      return el("label", { class: "ap-check", for: "ap-l-" + key }, [box, el("span", null, [el("b", { text: title }), el("small", { text: note })])]);
    };
    panel.append(el("section", { class: "ap-card" }, [
      el("h3", { text: "Layers" }),
      layer("grid", "Coordinate grid", "X grows east, Z grows south."),
      layer("spawn", "First-spawn range", fmt(SPAWN.min) + " to " + fmt(SPAWN.max) + " blocks from 0, 0. Approximate."),
      layer("chunks", "Chunk borders", "16 \u00d7 16 blocks. Appear when you zoom in."),
      layer("waypoints", "My waypoints", "The pins you saved.")
    ]));

    refreshThumbs();
    if (keep) { const n = panel.querySelector('[data-k="' + keep + '"]'); if (n) n.focus({ preventScroll: true }); }
  }

  /* ---------- pointer, wheel, keys ---------- */
  const rel = e => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const fingers = new Map();
  let drag = null, pinch = null, samples = [];
  const pair = () => { const [a, b] = Array.from(fingers.values()); return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) }; };
  canvas.addEventListener("pointerdown", e => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const p = rel(e);
    S.active = true; root.dataset.active = "1";
    canvas.focus({ preventScroll: true });
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
    stopMotion();
    fingers.set(e.pointerId, p);
    if (fingers.size === 1) { drag = { start: p, last: p, moved: false }; samples = [{ t: performance.now(), x: p.x, y: p.y }]; pinch = null; }
    else if (fingers.size === 2) { pinch = pair(); if (drag) drag.moved = true; }
  });
  canvas.addEventListener("pointermove", e => {
    const p = rel(e);
    if (!fingers.has(e.pointerId)) { if (e.pointerType === "mouse") { S.hover = at(p.x, p.y); redraw(); } return; }
    fingers.set(e.pointerId, p);
    if (fingers.size === 2 && pinch) {
      const n = pair(), anchor = at(pinch.x, pinch.y);
      S.view.k = clamp(S.view.k * n.d / pinch.d, kMin(), K_MAX);
      S.view.x = anchor.x - (n.x - S.w / 2) / S.view.k; S.view.z = anchor.z - (n.y - S.h / 2) / S.view.k;
      pinch = n; constrain();
    } else if (fingers.size === 1 && drag) {
      if (!drag.moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 4) drag.moved = true;
      if (drag.moved) {
        S.view.x -= (p.x - drag.last.x) / S.view.k; S.view.z -= (p.y - drag.last.y) / S.view.k; constrain();
        samples.push({ t: performance.now(), x: p.x, y: p.y }); if (samples.length > 6) samples.shift();
      }
      drag.last = p;
    }
    canvas.classList.toggle("is-dragging", !!(drag && drag.moved));
    S.hover = null; redraw();
  });
  function release(e, cancel) {
    if (!fingers.has(e.pointerId)) return;
    const p = rel(e), single = fingers.size === 1;
    fingers.delete(e.pointerId);
    if (single && drag) {
      if (!cancel && !drag.moved) { const pt = at(p.x, p.y); if (S.measuring) measureClick(pt); else select(pt); }
      else if (!cancel && samples.length > 1) {
        const a = samples[0], b = samples[samples.length - 1], dt = b.t - a.t;
        if (dt > 0 && performance.now() - b.t < 90) {
          const vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;
          if (Math.hypot(vx, vy) > 0.15 && !matchMedia("(prefers-reduced-motion: reduce)").matches) { inertia = { vx, vy }; redraw(); }
        }
      }
    }
    if (fingers.size === 1) { const q = Array.from(fingers.values())[0]; drag = { start: q, last: q, moved: true }; pinch = null; samples = []; }
    if (!fingers.size) { drag = null; pinch = null; canvas.classList.remove("is-dragging"); }
  }
  canvas.addEventListener("pointerup", e => release(e, false));
  canvas.addEventListener("pointercancel", e => release(e, true));
  canvas.addEventListener("pointerleave", () => { S.hover = null; redraw(); });
  canvas.addEventListener("dblclick", e => { e.preventDefault(); const p = rel(e); zoomAt(S.view.k * (e.shiftKey ? 0.5 : 2), p.x, p.y); });
  function zoomAt(k, px, py) {
    anim = null; inertia = null;
    zoomTo = { k: clamp(k, kMin(), K_MAX), px: px == null ? S.w / 2 : px, py: py == null ? S.h / 2 : py };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { const b = at(zoomTo.px, zoomTo.py); S.view.k = zoomTo.k; const a = at(zoomTo.px, zoomTo.py); S.view.x += b.x - a.x; S.view.z += b.z - a.z; zoomTo = null; constrain(); }
    redraw();
  }
  canvas.addEventListener("wheel", e => {
    if (!S.active && !S.expanded && !e.ctrlKey && !e.metaKey) { showHint("Click the map, then scroll to zoom", 1500); return; }
    e.preventDefault();
    const p = rel(e), d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? S.h : 1);
    const base = zoomTo ? zoomTo.k : S.view.k;
    zoomAt(base * Math.exp(-clamp(d, -240, 240) * (e.ctrlKey ? 0.012 : 0.0028)), p.x, p.y);
  }, { passive: false });
  document.addEventListener("pointerdown", e => { if (!root.contains(e.target)) { S.active = false; root.dataset.active = "0"; } });
  let viaKeyboard = false;
  document.addEventListener("keydown", e => { if (e.key === "Tab") viaKeyboard = true; }, true);
  document.addEventListener("pointerdown", () => { viaKeyboard = false; stage.dataset.kbfocus = "0"; }, true);
  canvas.addEventListener("focus", () => { stage.dataset.kbfocus = viaKeyboard ? "1" : "0"; if (viaKeyboard) { S.active = true; root.dataset.active = "1"; } });
  canvas.addEventListener("blur", () => { stage.dataset.kbfocus = "0"; if (!S.expanded) { S.active = false; root.dataset.active = "0"; } });
  canvas.addEventListener("keydown", e => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const step = (e.shiftKey ? 240 : 80) / S.view.k;
    const pan = (dx, dz) => { stopMotion(); S.view.x += dx; S.view.z += dz; };
    switch (e.key) {
      case "ArrowLeft": pan(-step, 0); break;
      case "ArrowRight": pan(step, 0); break;
      case "ArrowUp": pan(0, -step); break;
      case "ArrowDown": pan(0, step); break;
      case "+": case "=": zoomAt(S.view.k * 1.6); break;
      case "-": case "_": zoomAt(S.view.k / 1.6); break;
      case "0": case "Home": flyTo(homeView(), 500); break;
      case "Enter": case " ": if (S.measuring) measureClick(S.view); else select(S.view); break;
      case "m": case "M": toggleMeasure(); break;
      case "Escape":
        if (S.measuring) { toggleMeasure(); break; }
        if (S.expanded) { expand(false); break; }
        if (S.sel) { S.sel = null; S.rolled = null; renderPanel(); break; }
        canvas.blur(); return;
      default: return;
    }
    e.preventDefault(); S.hover = null; constrain(); redraw();
  });

  /* compare divider */
  if (splitEl) {
    let grabbing = false;
    const setSplit = v => { S.split = clamp(v, 0.04, 0.96); splitEl.setAttribute("aria-valuenow", String(Math.round(S.split * 100))); redraw(); };
    splitEl.addEventListener("pointerdown", e => { grabbing = true; try { splitEl.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ } e.preventDefault(); splitEl.focus({ preventScroll: true }); });
    splitEl.addEventListener("pointermove", e => { if (grabbing) setSplit(rel(e).x / S.w); });
    const end = () => { grabbing = false; };
    splitEl.addEventListener("pointerup", end); splitEl.addEventListener("pointercancel", end);
    splitEl.addEventListener("keydown", e => {
      const d = { ArrowLeft: -0.04, ArrowRight: 0.04, Home: -1, End: 1 }[e.key];
      if (d === undefined) return;
      e.preventDefault(); setSplit(Math.abs(d) === 1 ? (d < 0 ? 0.04 : 0.96) : S.split + d);
    });
    if (older) { splitA.textContent = dShort(older.id); splitB.textContent = dShort(newer.id); }
  }

  /* expand to the whole window */
  const expandBtn = $("[data-act=expand]");
  function expand(on) {
    S.expanded = on; root.dataset.expanded = on ? "1" : "0";
    document.documentElement.classList.toggle("atlas-open", on);
    expandBtn.setAttribute("aria-pressed", String(on));
    expandBtn.setAttribute("aria-label", on ? "Shrink the map" : "Fill the window with the map");
    expandBtn.querySelector("use").setAttribute("href", on ? "#i-shrink" : "#i-expand");
    if (on) { S.active = true; canvas.focus({ preventScroll: true }); } else root.scrollIntoView({ block: "start" });
    updateSelbar();
    requestAnimationFrame(resize);
  }
  document.addEventListener("keydown", e => { if (e.key === "Escape" && S.expanded && !e.defaultPrevented && document.activeElement !== canvas) expand(false); });

  /* toolbar actions */
  const actions = {
    in: () => zoomAt(S.view.k * 1.7), out: () => zoomAt(S.view.k / 1.7), home: () => { S.spot = -1; flyTo(homeView(), 600); },
    measure: () => toggleMeasure(), roll: rollSpawn, share, image: saveImage, expand: () => expand(!S.expanded),
    selcopy: () => { if (S.sel) copy(S.sel.x + " " + S.sel.z, "Copied " + xz(S.sel)); },
    selclear: () => { S.sel = null; S.rolled = null; renderPanel(); redraw(); },
    selsave: () => {
      if (root.dataset.panel === "0") actions.panel();
      requestAnimationFrame(() => { const n = $("#ap-wp-name"); if (n) { n.scrollIntoView({ block: "center" }); n.focus({ preventScroll: true }); } });
    },
    panel: () => { const open = root.dataset.panel !== "1"; root.dataset.panel = open ? "1" : "0"; $("[data-act=panel]").setAttribute("aria-pressed", String(open)); updateSelbar(); requestAnimationFrame(resize); }
  };
  $$("[data-act]").forEach(b => b.addEventListener("click", () => actions[b.dataset.act] && actions[b.dataset.act]()));
  $$("[data-mode]").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));

  /* survey chips */
  const chips = $("[data-surveys]");
  if (chips) {
    surveys.slice().reverse().forEach(sv => chips.append(el("button", { type: "button", "data-survey": sv.id, "aria-pressed": String(sv.id === S.survey), text: dShort(sv.id), title: "Survey of " + dLong(sv.id), onclick: () => setSurvey(sv.id) })));
  }
  $$("[data-latest-date]", document).forEach(n => { n.textContent = dLong(latest.id); });

  /* sizing */
  function resize() {
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const first = !S.w;
    const before = S.w ? { kx: S.view.k / fitCover(shown()) } : null;
    S.w = r.width; S.h = r.height; S.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.max(1, Math.round(S.w * S.dpr)); canvas.height = Math.max(1, Math.round(S.h * S.dpr));
    if (first) { S.view = homeView(); if (!readHash()) { /* default view */ } }
    else if (before && S.mode === "map" && Math.abs(before.kx - 1) < 0.02) S.view.k = fitCover(shown());
    constrain(); needsDraw = true; draw();
  }
  new ResizeObserver(resize).observe(stage);
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { S.near = true; io.disconnect(); redraw(); } }, { rootMargin: "700px 0px" });
    io.observe(stage);
  } else S.near = true;
  window.addEventListener("hashchange", () => { if (readHash()) root.scrollIntoView({ block: "start" }); });
  window.addEventListener("storage", e => { if (e.key === STORE || e.key === null) { points = loadPoints(); renderPanel(); redraw(); } });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);

  setMode("map", true);
  renderPanel();
  resize();
  if (/^#at-/.test(location.hash)) requestAnimationFrame(() => root.scrollIntoView({ block: "start" }));

  window.wellobyAtlas = {
    focusPoint(x, z) { return Number.isFinite(x) && Number.isFinite(z) ? goTo({ x, z }) : false; },
    setMode, rollSpawn,
    get state() { return { mode: S.mode, survey: S.survey, view: { ...S.view }, sel: S.sel, split: S.split, size: [S.w, S.h] }; }
  };
})();
