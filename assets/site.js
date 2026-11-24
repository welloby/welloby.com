/* Welloby site behavior: old links to moved sections, copy buttons, live status, join tabs, the phone menu,
   "you are here", Help stepping aside, the daily restart in the visitor's own time. Every section is in the page
   without this file; nothing here hides or moves anything. */
(() => {
  "use strict";
  const W = window.WELLOBY || {};
  const PREVIEW = !!W.preview;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const root = document.documentElement;
  const query = new URLSearchParams(location.search);

  /* ---------- old links: parts of the home page that now have their own pages ----------
     Links already posted in Discord, on listing sites and in videos point at welloby.com/#map and the like, and the
     community board writes index.html#map-x120-z-340 for coordinates. Without scripts they land on the matching card. */
  const MOVED = { map: "map.html", games: "map.html#games", planner: "map.html#planner", world: "faq.html#server-info", watch: "watch.html", brand: "watch.html#brand" };
  const movedTo = h => /^(map|at)-x-?\d+-z-?\d+$/.test(h) ? "map.html#" + h : MOVED[h] || "";
  if (document.body.classList.contains("page-home")) {
    const to = movedTo(location.hash.slice(1));
    if (to) { location.replace(to); return; }
    addEventListener("hashchange", () => { const t = movedTo(location.hash.slice(1)); if (t) location.replace(t); });
  }

  /* ---------- the Copied message: says where to paste (data-copy-where), stays 5 s, a tap closes it ---------- */
  const toastEl = $(".toast");
  let toastT = 0;
  const hideToast = () => { clearTimeout(toastT); if (toastEl) toastEl.dataset.show = "0"; };
  function toast(text) {
    if (!toastEl) return;
    clearTimeout(toastT);
    toastEl.textContent = text; toastEl.dataset.show = "1";
    toastT = setTimeout(hideToast, 5000);
  }
  if (toastEl) toastEl.addEventListener("click", hideToast);
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
      const where = button && button.dataset.copyWhere;
      toast("Copied " + ((button && button.dataset.copyLabel) || text) + "." + (where ? " " + where : ""));
      if (button) {
        button.dataset.copied = "1";
        clearTimeout(button._t); button._t = setTimeout(() => { delete button.dataset.copied; }, 1600);
      }
    } else toast(text.length < 40 ? "Could not copy here. Select it and copy it yourself: " + text : "Your browser blocked copying. Select the text and copy it yourself.");
    return ok;
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-copy]");
    if (b) copyText(b.dataset.copy, b);
  });

  /* ---------- join: edition tabs ---------- */
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
    if (r.state === "online") paint("online", "Online", name + " server online");
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

  /* ---------- "you are here": the section being read, in the second row and the menu ----------
     Only links to a section of this page count; community.js marks the community's own pages (#/forum) itself, so
     those links are left alone. Sections side by side (Rules and FAQ on a computer) are marked together. */
  const bar = $(".bar");
  const links = $$(".bar-nav a[href^='#'], .menu-list a[href^='#']").filter(a => a.hash.length > 1 && !a.hash.startsWith("#/") && document.getElementById(a.hash.slice(1)));
  const sections = Array.from(new Set(links.map(a => document.getElementById(a.hash.slice(1)))));
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      if (bar) bar.dataset.solid = scrollY > 24 ? "1" : "0";
      const line = Math.min(innerHeight * 0.35, 260);
      let top = -Infinity, current = [];
      for (const s of sections) {
        const t = s.getBoundingClientRect().top;
        if (t > line) continue;
        if (t > top + 4) { current = [s.id]; top = t; } else if (t >= top - 4) current.push(s.id);
      }
      for (const a of links) {
        if (current.includes(a.hash.slice(1))) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current");
      }
    });
  }
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll, { passive: true });
  onScroll();

  /* ---------- the phone menu (a <details>) ----------
     It closes on a link, on Help and Search, on a tap outside it (not on the Copied message) and on Escape. While it is
     open the page under it cannot take keyboard focus. It belongs to narrow screens, so widening past 960 px closes it.
     ?menu=1 or #menu opens it, for links from elsewhere. */
  const menu = $(".menu");
  if (menu) {
    const under = () => $$("main, .local, .bar-sub, .site-foot, .kz, .terms-strip");
    const syncInert = () => under().forEach(el => { el.inert = menu.open; });
    /* frees the page at once, not on the later "toggle" event: Help closes the menu and the help bot takes focus in the same tap */
    const closeMenu = () => { menu.removeAttribute("open"); syncInert(); };
    // a message from before the menu opened would sit on its rows; one from inside it (Copied) still shows
    menu.addEventListener("toggle", () => { syncInert(); if (menu.open) hideToast(); });
    menu.addEventListener("click", e => { if (e.target.closest("a, [data-ask], [data-cmd-open]")) closeMenu(); });
    document.addEventListener("click", e => { if (menu.open && !menu.contains(e.target) && !e.target.closest(".toast")) closeMenu(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && menu.open) { closeMenu(); $("summary", menu).focus(); } });
    const wide = matchMedia("(min-width: 960px)");
    const onWide = () => { if (wide.matches) closeMenu(); };
    if (wide.addEventListener) wide.addEventListener("change", onWide); else if (wide.addListener) wide.addListener(onWide);
    if (query.get("menu") === "1" || location.hash === "#menu") menu.setAttribute("open", "");
  }

  /* ---------- Help steps aside while buttons sit where it floats ----------
     The first screen's address card (its Copy buttons are at the right edge; the first screen has its own Help
     button), the community's Create account and Sign in, and the server list's Vote buttons. The class is set before
     the help bot's button exists, so it never flashes over them. */
  const aside = $$(".first .ipcard, .comm-acts, .slist");
  if (aside.length) {
    const inView = new Set();
    aside.forEach(el => { const r = el.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) inView.add(el); });
    root.classList.toggle("card-in-view", inView.size > 0);
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(es => {
        es.forEach(e => { if (e.isIntersecting) inView.add(e.target); else inView.delete(e.target); });
        root.classList.toggle("card-in-view", inView.size > 0);
      });
      aside.forEach(el => io.observe(el));
    }
  }

  /* ---------- a link to a closed question opens it ---------- */
  const openRow = id => { const el = id && document.getElementById(id); if (el && el.tagName === "DETAILS") el.open = true; };
  openRow(location.hash.slice(1));
  addEventListener("hashchange", () => openRow(location.hash.slice(1)));

  /* ---------- the daily restart, also in the visitor's own time (written once) ---------- */
  const restart = $("[data-restart]");
  if (restart) {
    const now = new Date(), at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 9, 40));
    if (at.getTimezoneOffset() !== 0) restart.textContent = " (" + at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " your time)";
  }

  /* ---------- brand kit ---------- */
  if (PREVIEW) {
    document.addEventListener("click", e => {
      const a = e.target.closest("a[download], a[data-file]");
      if (a) { e.preventDefault(); toast("Downloads work once the site is hosted. This is a preview."); }
    });
  }
})();
