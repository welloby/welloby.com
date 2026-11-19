/* Welloby site behavior: copy buttons, live status, join tabs, navigation, hero embers. */
(() => {
  "use strict";
  const W = window.WELLOBY || {};
  const PREVIEW = !!W.preview;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- toast ---------- */
  const toastEl = $(".toast");
  let toastT = 0;
  function toast(text) {
    if (!toastEl) return;
    clearTimeout(toastT);
    toastEl.textContent = text; toastEl.dataset.show = "1";
    toastT = setTimeout(() => { toastEl.dataset.show = "0"; }, 3200);
  }
  window.addEventListener("welloby:toast", e => toast(e.detail));

  /* ---------- copy ---------- */
  async function copyText(text, button) {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; }
    catch (e) {
      const f = document.createElement("textarea");
      f.value = text; f.readOnly = true; f.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0";
      document.body.append(f); f.select();
      try { ok = document.execCommand("copy"); } catch (e2) { /* fall through to manual copy */ }
      f.remove();
      if (button) button.focus({ preventScroll: true });
    }
    if (ok) {
      toast("Copied " + ((button && button.dataset.copyLabel) || text));
      if (button) {
        button.dataset.copied = "1";
        clearTimeout(button._t); button._t = setTimeout(() => { delete button.dataset.copied; }, 1600);
      }
    } else toast(button && button.dataset.copyLabel ? "Couldn't copy here. Select the text and copy it yourself." : "Copy it yourself: " + text);
    return ok;
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-copy]");
    if (b) copyText(b.dataset.copy, b);
  });

  /* ---------- join ticket: edition tabs ---------- */
  const server = W.server || {};
  const tabs = $$("[data-edition]");
  let edition = "java";
  function showEdition(v, focus) {
    edition = v;
    for (const t of tabs) {
      const on = t.dataset.edition === v;
      t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    }
    $$("[data-for]").forEach(n => { n.hidden = n.dataset.for !== v; });
    checkStatus(true);
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => showEdition(t.dataset.edition));
    t.addEventListener("keydown", e => {
      const n = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (n === undefined) return;
      e.preventDefault();
      showEdition(tabs[(n + tabs.length) % tabs.length].dataset.edition, true);
    });
  });

  /* ---------- live status ---------- */
  const lamps = $$("[data-status-lamp]"), shortEls = $$("[data-status-short]"), longEl = $("[data-status-long]"), whenEl = $("[data-status-when]"), refreshBtn = $("[data-status-refresh]");
  const cache = {};
  let pending = null, checkedAt = 0;
  function paint(state, short, long) {
    lamps.forEach(l => { l.dataset.state = state; });
    shortEls.forEach(n => { n.textContent = short; });
    if (longEl) longEl.textContent = long;
  }
  function paintWhen() {
    if (!whenEl) return;
    if (PREVIEW) { whenEl.textContent = "Live status loads once the site is hosted."; return; }
    if (!checkedAt) { whenEl.textContent = ""; return; }
    const s = Math.round((Date.now() - checkedAt) / 1000);
    whenEl.textContent = s < 20 ? "Checked just now" : s < 90 ? "Checked a minute ago" : "Checked " + Math.round(s / 60) + " minutes ago";
  }
  function show(ed) {
    const r = cache[ed];
    if (!r) return;
    const name = ed === "bedrock" ? "Bedrock" : "Java";
    if (r.state === "online") paint("online", "Online", name + " server online" + (r.version ? ", " + r.version : ""));
    else if (r.state === "offline") paint("offline", "Offline", name + " server is not answering right now");
    else paint("unknown", "Status unknown", "Couldn't reach the status service. The server may still be up.");
    checkedAt = r.at; paintWhen();
    /* motion.js listens for this to show the live player count */
    window.dispatchEvent(new CustomEvent("welloby:status", { detail: { edition: ed, state: r.state, players: r.players || null } }));
  }
  async function checkStatus(useCache) {
    const ed = edition;
    if (PREVIEW) {
      const snap = server.snapshot || {};
      paint(snap.online ? "online" : "unknown", snap.online ? "Online" : "Status", snap.online ? "Online when this preview was built" + (snap.version && ed === "java" ? ", " + snap.version : "") : "Status loads on the hosted site");
      paintWhen();
      return;
    }
    if (useCache && cache[ed] && Date.now() - cache[ed].at < 45000) { show(ed); return; }
    if (pending === ed) return;
    pending = ed;
    if (!cache[ed]) paint("loading", "Checking", "Checking the " + (ed === "bedrock" ? "Bedrock" : "Java") + " server");
    if (refreshBtn) refreshBtn.disabled = true;
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000);
    const api = server.statusApi || "https://api.mcstatus.io/v2/status";
    const url = ed === "bedrock" ? api + "/bedrock/" + server.bedrock.host + ":" + server.bedrock.port : api + "/java/" + server.java.host;
    try {
      const res = await fetch(url, { signal: ctl.signal, cache: "no-store", credentials: "omit" });
      if (!res.ok) throw new Error("status service");
      const d = await res.json();
      if (typeof d.online !== "boolean") throw new Error("incomplete");
      let version = "";
      if (d.online && d.version) {
        const v = String(d.version.name_clean || d.version.name || "").trim();
        if (v && v.length <= 24) version = ed === "bedrock" ? "" : v;
      }
      const pl = d.online && d.players && typeof d.players.online === "number" ? { online: d.players.online, max: d.players.max || 0 } : null;
      cache[ed] = { state: d.online ? "online" : "offline", version, players: pl, at: Date.now() };
    } catch (e) {
      cache[ed] = { state: "unknown", version: "", at: Date.now() };
    } finally {
      clearTimeout(timer); pending = null;
      if (refreshBtn) refreshBtn.disabled = false;
      if (edition === ed) show(ed);
    }
  }
  if (refreshBtn) refreshBtn.addEventListener("click", () => { delete cache[edition]; checkStatus(false); });
  setInterval(() => { paintWhen(); if (!PREVIEW && !document.hidden && checkedAt && Date.now() - checkedAt > 120000) checkStatus(false); }, 20000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !PREVIEW && checkedAt && Date.now() - checkedAt > 120000) checkStatus(false); });
  if (tabs.length) showEdition("java"); else checkStatus(false);

  /* ---------- top bar and section tracking ---------- */
  const bar = $(".bar");
  const links = $$(".bar-nav a[href^='#'], .menu-list a[href^='#']");
  const sections = Array.from(new Set(links.map(a => a.hash))).map(h => document.getElementById(h.slice(1))).filter(Boolean);
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      if (bar) bar.dataset.solid = scrollY > 24 ? "1" : "0";
      let current = null;
      const line = Math.min(innerHeight * 0.35, 260);
      for (const s of sections) if (s.getBoundingClientRect().top <= line) current = s;
      for (const a of links) {
        const on = !!current && a.hash === "#" + current.id;
        if (on) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current");
      }
    });
  }
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll, { passive: true });
  onScroll();

  const menu = $(".menu");
  if (menu) {
    menu.addEventListener("click", e => { if (e.target.closest("a")) menu.removeAttribute("open"); });
    document.addEventListener("click", e => { if (menu.open && !menu.contains(e.target)) menu.removeAttribute("open"); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && menu.open) { menu.removeAttribute("open"); $("summary", menu).focus(); } });
  }

  /* ---------- brand kit ---------- */
  if (PREVIEW) {
    document.addEventListener("click", e => {
      const a = e.target.closest("a[download], a[data-file]");
      if (a) { e.preventDefault(); toast("Downloads work once the site is hosted. This is a preview."); }
    });
  }

  /* ---------- hero embers: small square sparks rising off the lava ---------- */
  const hero = $(".hero"), cv = $(".hero-embers"), art = $(".hero-art");
  if (hero && cv && art && W.embers && W.embers.length && !reduced.matches) {
    const g = cv.getContext("2d");
    let w = 0, h = 0, dpr = 1, parts = [], run = false, last = 0, emit = [];
    const colors = ["#ff6a1f", "#ff8a3d", "#ffb347", "#ffd27a"];
    function layout() {
      const r = hero.getBoundingClientRect();
      w = r.width; h = r.height; dpr = Math.min(devicePixelRatio || 1, 2);
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      const iw = art.naturalWidth || 1672, ih = art.naturalHeight || 941, s = Math.max(w / iw, h / ih);
      const pos = getComputedStyle(art).objectPosition.split(" ").map(v => parseFloat(v) / 100);
      const ox = (w - iw * s) * (isNaN(pos[0]) ? .5 : pos[0]), oy = (h - ih * s) * (isNaN(pos[1]) ? .5 : pos[1]);
      emit = W.embers.map(p => ({ x: ox + p[0] * iw * s, y: oy + p[1] * ih * s })).filter(p => p.x > 0 && p.x < w && p.y > 0 && p.y < h);
    }
    function spawn() {
      if (!emit.length) return;
      const e = emit[(Math.random() * emit.length) | 0];
      parts.push({ x: e.x + (Math.random() - .5) * 10, y: e.y, vx: (Math.random() - .5) * 9, vy: -(14 + Math.random() * 26), life: 0, max: 2.6 + Math.random() * 3.2, s: Math.random() < .25 ? 3 : 2, c: colors[(Math.random() * colors.length) | 0], ph: Math.random() * 6.3 });
    }
    function tick(t) {
      if (!run) return;
      const dt = Math.min(.05, last ? (t - last) / 1000 : .016); last = t;
      if (parts.length < 46 && Math.random() < dt * 9) spawn();
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      parts = parts.filter(p => p.life < p.max);
      for (const p of parts) {
        p.life += dt; p.x += (p.vx + Math.sin(p.ph + p.life * 1.7) * 7) * dt; p.y += p.vy * dt;
        const a = Math.min(1, p.life * 3) * Math.max(0, 1 - p.life / p.max);
        g.globalAlpha = a * .9; g.fillStyle = p.c;
        g.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
      }
      g.globalAlpha = 1;
      requestAnimationFrame(tick);
    }
    /* the pointer stirs up extra sparks */
    let lastPuff = 0;
    hero.addEventListener("pointermove", e => {
      if (e.pointerType !== "mouse" || parts.length > 90 || e.timeStamp - lastPuff < 40) return;
      lastPuff = e.timeStamp;
      const r = hero.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      for (let i = 0; i < 2; i++) parts.push({ x: x + (Math.random() - .5) * 14, y: y + (Math.random() - .5) * 8, vx: (Math.random() - .5) * 30, vy: -(20 + Math.random() * 40), life: 0, max: .8 + Math.random() * 1.2, s: Math.random() < .3 ? 3 : 2, c: colors[(Math.random() * colors.length) | 0], ph: Math.random() * 6.3 });
    });
    const start = () => { if (!run) { run = true; last = 0; requestAnimationFrame(tick); } };
    const stop = () => { run = false; };
    new ResizeObserver(layout).observe(hero);
    if (art.complete) layout(); else art.addEventListener("load", layout);
    new IntersectionObserver(es => { for (const e of es) (e.isIntersecting && !document.hidden) ? start() : stop(); }).observe(hero);
    document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else if (hero.getBoundingClientRect().bottom > 0) start(); });
  }
})();
