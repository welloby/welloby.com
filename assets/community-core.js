/* Welloby community, shared by every page: talks to the community API, keeps you signed in,
   draws block heads and clan banners, and formats posts. community.js builds the board on
   top of this; on the main page it fills the Community section and the account chip.
   Everything people type is escaped before it reaches the page. */
(() => {
  "use strict";
  const W = window.WELLOBY || {};
  const CFG = W.community || {};
  const API = String(CFG.api || "/api").replace(/\/+$/, "");
  /* Two pages run the app: community.html (data-app="community") and the server list, servers.html (data-app="servers",
     which starts on #/servers). Both are ON_HUB: account pages open right there. Profiles, messages, clans and
     settings live on the community page, so every other page, the server list included, links to them there. */
  const APP = (document.body.dataset && document.body.dataset.app) || "";
  const START = (document.body.dataset && document.body.dataset.start) || "/";
  const ON_HUB = document.body.classList.contains("cm-page");
  const HUB = APP === "community" ? "" : "community.html";
  const KEY = "welloby.session";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const fmt = n => Math.round(Number(n) || 0).toLocaleString("en-US");
  const money = (n, cur) => (cur && cur !== "USD" ? cur + " " : "$") + (Math.round(n * 100) % 100 ? Number(n).toFixed(2) : fmt(n));

  /* ---------- API and session ---------- */
  /* data: the whole answer, for the extra fields some errors carry (where to appeal a ban, which clans you asked) */
  class ApiError extends Error { constructor(msg, status, code, data) { super(msg); this.status = status; this.code = code; this.data = data || {}; } }
  let token = store.get(KEY);
  let me = null, health = null;
  const subs = new Set();
  const emit = () => subs.forEach(fn => { try { fn(me); } catch (e) { console.error(e); } });
  const toast = t => dispatchEvent(new CustomEvent("welloby:toast", { detail: t }));
  /* a session that ended somewhere else (a new password, "Sign out everywhere", a ban): say so once instead of just
     redrawing the page as signed out */
  let endedSaid = false;
  function sessionEnded() {
    if (!token) return;
    setSession(null, null);
    if (!endedSaid) { endedSaid = true; toast("You were signed out. Sign in again to go on."); }
  }

  async function api(path, opts = {}) {
    const headers = { accept: "application/json" };
    const hasBody = opts.body !== undefined;
    if (hasBody) headers["content-type"] = "application/json";
    if (token) headers.authorization = "Bearer " + token;
    let res;
    try {
      res = await fetch(API + path, { method: opts.method || (hasBody ? "POST" : "GET"), headers, body: hasBody ? JSON.stringify(opts.body) : undefined, cache: "no-store", credentials: "omit", signal: opts.signal });
    } catch (e) {
      if (e && e.name === "AbortError") throw e;
      throw new ApiError("Can't reach the community right now. Check your connection and try again.", 0, "offline");
    }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      if (res.status === 401 && data && (data.code === "ended" || data.code === "auth") && token) sessionEnded();
      throw new ApiError((data && data.error) || "Something went wrong. Try again.", res.status, data && data.code, data);
    }
    return data || {};
  }
  function setSession(t, user) {
    token = t || null;
    store.set(KEY, token);
    me = token ? user || me : null;
    if (token) endedSaid = false;
    emit();
    pollCounts();
  }
  async function refreshMe() {
    if (!token) { me = null; emit(); return null; }
    try { const d = await api("/me"); me = d.user || null; if (!me) sessionEnded(); else emit(); }
    catch (e) { if (e.status === 401) setSession(null, null); }
    return me;
  }

  /* ---------- what is waiting: invites, clan news, replies, join requests, reports ----------
     /me brings the counts with the account; between page loads /chats/unread brings them again every 45 seconds and
     when the tab comes back into view, so the dots move by themselves. */
  const COUNTS = ["unreadChats", "waiting", "invites", "notices", "replies", "clanRequests", "allyAsks", "reports", "serverReports", "chatReports"];
  function setCounts(r) {
    if (!me || !r || typeof r !== "object") return;
    let changed = false;
    for (const k of COUNTS) {
      const v = k === "unreadChats" ? r.unread : r[k];
      if (typeof v === "number" && me[k] !== v) { me[k] = v; changed = true; }
    }
    if (!changed) return;
    renderAccount();
    dispatchEvent(new CustomEvent("welloby:counts", { detail: counts() }));
  }
  const counts = () => { const o = {}; for (const k of COUNTS) o[k] = me && typeof me[k] === "number" ? me[k] : 0; return o; };
  let countsAt = 0, countsTimer = 0;
  async function refreshCounts() {
    if (!token || !me || !health) return;
    countsAt = Date.now();
    try { setCounts(await api("/chats/unread")); } catch (e) { /* the next round tries again */ }
  }
  function pollCounts() {
    clearTimeout(countsTimer);
    if (!token) return;
    countsTimer = setTimeout(() => { if (!document.hidden) refreshCounts(); pollCounts(); }, 45000);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - countsAt > 10000) refreshCounts(); });
  async function signOut(everywhere) {
    const endpoint = await pushDrop();   // this browser stops getting the account's notifications; the API is told which address to forget
    try { await api(everywhere ? "/auth/logout-all" : "/auth/logout", { method: "POST", body: endpoint ? { endpoint } : {} }); } catch (e) { /* signed out locally anyway */ }
    setSession(null, null);
  }
  const ready = (async () => {
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 7000);
      const r = await fetch(API + "/health", { cache: "no-store", credentials: "omit", signal: ctl.signal });
      clearTimeout(t);
      const d = r.ok ? await r.json() : null;
      health = d && d.ok === true ? d : null;
    } catch (e) { health = null; }
    if (health) { await refreshMe(); pollCounts(); }
    window.wellobyCommunity = { online: !!health, api: API };
    dispatchEvent(new CustomEvent("welloby:community", { detail: { online: !!health } }));
    emit();
    return !!health;
  })();
  /* another tab signed in or out */
  addEventListener("storage", e => { if (e.key === KEY) { token = e.newValue; refreshMe(); } });

  /* ---------- phone notifications ----------
     sw.js (next to the pages) shows them. This part switches them on and off for this browser and keeps the
     API's copy of the browser's push address in step. The browser is asked for permission only when the
     player taps the button in Settings; nothing here runs in a preview build or a page opened from disk. */
  const PUSH_KEY = "welloby.push";   // { u: account id, e: push address, at: when the API last got it }; there only while notifications are on in this browser
  const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);   // an iPad says it is a Mac
  const standalone = () => navigator.standalone === true || matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches;
  const pushCapable = () => !W.preview && /^https?:$/.test(location.protocol) && window.isSecureContext === true
    && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const pushKey = () => (health && typeof health.push === "string" ? health.push : "");
  const pushFlag = () => { try { const f = JSON.parse(store.get(PUSH_KEY) || "null"); return f && typeof f.u === "number" ? f : null; } catch (e) { return null; } };
  const setDevices = n => { if (me && me.account && typeof n === "number") me.account.pushDevices = n; };
  /* Which state the Notifications card in Settings is in. No browser calls in here, so tests/push.test.js can run it. */
  function pushStateOf(x) {
    if (!x.key) return "server-off";
    if (!x.capable) return x.ios && !x.standalone ? "ios-install" : "unsupported";
    if (x.permission === "denied") return "blocked";
    return x.permission === "granted" && x.subscribed && x.flagUser === x.userId ? "on" : "off";
  }
  async function pushState() {
    const x = { key: pushKey(), capable: pushCapable(), ios: IOS, standalone: standalone(), permission: "default", subscribed: false, flagUser: (pushFlag() || {}).u, userId: me ? me.id : 0 };
    if (x.key && x.capable) {
      x.permission = Notification.permission;
      try { const reg = await navigator.serviceWorker.getRegistration(); x.subscribed = !!(reg && await reg.pushManager.getSubscription()); } catch (e) { x.subscribed = false; }
    }
    return pushStateOf(x);
  }
  const keyBytes = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), ch => ch.charCodeAt(0));
  /* a subscription made with another key (the keys were changed, or it comes from a test copy of the site) is no use with this one */
  function sameKey(sub) {
    const k = sub.options && sub.options.applicationServerKey;
    if (!k) return true;
    const a = new Uint8Array(k), b = keyBytes(pushKey());
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  async function pushSubscription() {
    const reg = await navigator.serviceWorker.register("sw.js");
    await Promise.race([navigator.serviceWorker.ready, new Promise((ok, no) => setTimeout(() => no(new Error("the service worker didn't start")), 8000))]);
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub)) { await sub.unsubscribe(); sub = null; }
    return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(pushKey()) });
  }
  async function pushSave(sub) {
    const r = await api("/push/subscribe", { body: sub.toJSON() });
    store.set(PUSH_KEY, JSON.stringify({ u: me.id, e: sub.endpoint, at: Date.now() }));
    setDevices(r.devices);
  }
  /* Runs straight from the tap on "Turn on notifications". The permission question has to come before anything
     is awaited, or Safari no longer counts it as the player's tap. Answers with the card's new state. */
  async function pushOn() {
    const asked = Notification.requestPermission();
    await Promise.resolve(asked).catch(() => { /* answered below */ });
    if (Notification.permission !== "granted") return pushState();
    let sub = null;
    try { sub = await pushSubscription(); await pushSave(sub); }
    catch (e) { if (sub) sub.unsubscribe().catch(() => { /* gone already */ }); throw e; }
    return "on";
  }
  /* forgets the subscription in this browser and answers with its address, so the API can forget it too */
  async function pushDrop() {
    store.set(PUSH_KEY, null);
    try {
      const reg = pushCapable() ? await navigator.serviceWorker.getRegistration() : null;
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (!sub) return "";
      sub.unsubscribe().catch(() => { /* gone already */ });
      return sub.endpoint;
    } catch (e) { return ""; }
  }
  async function pushOff() {
    const endpoint = await pushDrop();
    if (!endpoint || !token) return;
    try { setDevices((await api("/push/unsubscribe", { body: { endpoint } })).devices); } catch (e) { /* the address is dead either way; the API drops it at the next send */ }
  }
  /* With notifications on, every page load looks the subscription up again: iPhones drop one without telling
     the page, and the API forgets an account's devices when its password changes. The address goes to the API
     when it changed, once a day, when the API says it has none, or when Settings asks (force). */
  let pushSyncing = null, pushForced = false;
  function pushSync(force) {
    // Settings opened straight from another page finds the page-load look still going: its resend follows that one instead of being lost in it
    if (pushSyncing && force && !pushForced) return pushSyncing.then(() => pushSync(true));
    if (!pushSyncing) {
      pushForced = !!force;
      pushSyncing = (async () => {
        const f = pushFlag();
        if (!f || !me || !pushKey() || !pushCapable()) return;
        if (f.u !== me.id || Notification.permission !== "granted") { await pushDrop(); return; }   // another account's leftovers, or the permission was taken back in the browser
        try {
          const sub = await pushSubscription();
          const none = !!me.account && me.account.pushDevices === 0;
          if (force || none || sub.endpoint !== f.e || Date.now() - f.at > 864e5) await pushSave(sub);
        } catch (e) { /* offline, or the push service is: the next page load tries again */ }
      })().finally(() => { pushSyncing = null; });
    }
    return pushSyncing;
  }
  /* follows sign-ins and sign-outs wherever they happen (this tab, another tab, a session that ran out) */
  let pushSeen = -1, pushHealed = false;
  function pushWatch() {
    if (!token) { pushSeen = 0; if (pushFlag()) pushDrop(); return; }   // signed out for certain: this browser goes quiet
    if (!me || !health) return;   // not known yet, or the API can't be reached: leave everything as it is
    const lost = !pushHealed && !!pushFlag() && !!me.account && me.account.pushDevices === 0;
    if (me.id === pushSeen && !lost) return;
    pushSeen = me.id;
    if (lost) pushHealed = true;   // once per page load, so an API that keeps refusing isn't asked over and over
    pushSync(false);
  }
  subs.add(pushWatch);
  /* a tapped notification: the service worker asks an open Welloby tab to show the chat or thread. Chrome throws
     on merely reading navigator.serviceWorker in a sandboxed frame (where the preview build is shown), and that
     would stop this whole file. */
  if (pushCapable()) {
    try {
      navigator.serviceWorker.addEventListener("message", e => {
        const d = e.data || {};
        if (d.welloby !== "open" || typeof d.u !== "string" || d.u[0] !== "/") return;
        if (!ON_HUB) location.href = HUB + "#" + d.u;
        else if (location.hash === "#" + d.u) dispatchEvent(new Event("hashchange"));   // already on it: load it again
        else location.hash = "#" + d.u;
      });
    } catch (e) { /* no service workers here, so no notifications to tap */ }
  }

  /* ---------- Back in the Home Screen app ----------
     Opened from the Home Screen, Welloby has no browser bar, and an iPhone gives it no back swipe either, so while
     it runs as an app every page gets a Back button at the left of the top bar (not on the community start page,
     where the app opens). A tap goes back in the app's own history. When that changes nothing (the page the app
     opened on), it goes up a level instead. A normal browser tab never gets the button. */
  /* where Back goes when there is no history to go back to: x.hub (on the community page), x.hash (its route),
     x.crumb (the last link of the page's breadcrumb), x.chat (a chat's own \u2190 link). No browser calls in here,
     so tests/appback.test.js can run it. */
  function backTo(x) {
    if (!x.hub) return "community";
    const up = x.crumb || x.chat || "";
    return /^#\//.test(up) && up !== x.hash ? up : "#/";
  }
  // the app opens on the community start (site.webmanifest); the server list's start page is not it, so Back shows there
  const appStart = () => APP === "community" && /^(#\/?)?$/.test(location.hash);
  let backTimer = 0;
  function appBack() {
    const before = location.href;
    clearTimeout(backTimer);
    history.back();
    backTimer = setTimeout(() => {
      if (location.href !== before) return;   // the history step happened
      const crumbs = $$(".crumbs a"), chat = $(".chat-back");
      location.href = backTo({ hub: ON_HUB, hash: location.hash, crumb: crumbs.length ? crumbs[crumbs.length - 1].getAttribute("href") : "", chat: chat ? chat.getAttribute("href") : "" });
    }, 350);
  }
  function mountBack() {
    const bar = $("header.bar");
    if (!bar || !standalone()) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "app-back";
    btn.innerHTML = '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 8H3m4.5-4.5L3 8l4.5 4.5"/></svg><span>Back</span>';
    btn.addEventListener("click", appBack);
    const brand = $(".bar-brand, .bar-row .logo", bar);
    if (brand) brand.before(btn); else bar.prepend(btn);
    const paint = () => bar.classList.toggle("has-back", !appStart());
    paint();
    addEventListener("hashchange", paint);
    addEventListener("pagehide", () => clearTimeout(backTimer));   // a page kept for going back to must not move by itself when it comes back
  }
  mountBack();

  /* ---------- seeded randomness ---------- */
  function hash32(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function shade(c, f) { return c.map(v => Math.max(0, Math.min(255, Math.round(v * f)))); }
  const cache = new Map();
  function paint(w, h, px, key) {
    if (cache.has(key)) return cache.get(key);
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const g = cv.getContext("2d"), img = g.createImageData(w, h);
    px.forEach((c, i) => { img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = c[3] === undefined ? 255 : c[3]; });
    g.putImageData(img, 0, 0);
    const url = cv.toDataURL("image/png");
    if (cache.size > 600) cache.clear();
    cache.set(key, url);
    return url;
  }

  /* ---------- block heads: an 8 x 8 face made from the name ---------- */
  const SKIN = ["#f1c6a0", "#e3a97c", "#c98b5e", "#a86d45", "#81502f", "#5b3a24", "#d3d8c6", "#b6a6d4", "#9fb8c9"];
  const HAIR = ["#231710", "#3d2817", "#6b4224", "#a8733a", "#e0b960", "#e8e2d3", "#151515", "#8e2b18", "#ff6a1f", "#3a6ea5", "#5d8a3a", "#c04a8a", "#7a7a7a"];
  const EYES = ["#2f5fbf", "#3f7f35", "#5a3b20", "#1b1b1b", "#7b3ac9", "#c23b2b", "#1f8a8a", "#d9a21b"];
  const GEAR = ["#ff6a1f", "#a3261b", "#f2b632", "#3346a8", "#1f8a8a", "#7a3bb0", "#e8e2d3", "#2a2826", "#3f6b2a"];
  function headPixels(name, seed) {
    const R = rng(hash32(String(name || "?").toLowerCase() + "#" + (seed | 0)));
    const pick = a => a[(R() * a.length) | 0];
    const skin = rgb(pick(SKIN)), hair = rgb(pick(HAIR)), eye = rgb(pick(EYES)), gear = rgb(pick(GEAR));
    const px = Array.from({ length: 64 }, () => skin);
    const set = (x, y, c) => { if (x >= 0 && x < 8 && y >= 0 && y < 8) px[y * 8 + x] = c; };
    const row = (y, c, a = 0, b = 7) => { for (let x = a; x <= b; x++) set(x, y, c); };
    const style = (R() * 8) | 0;
    row(0, hair); row(1, hair);
    if (style === 0) { set(0, 2, hair); set(7, 2, hair); }
    else if (style === 1) { for (let y = 2; y < 7; y++) { set(0, y, hair); set(7, y, hair); } set(1, 2, hair); set(6, 2, hair); }
    else if (style === 2) { row(2, hair, 0, 3); set(0, 3, hair); }
    else if (style === 3) { row(0, skin); row(1, skin); set(3, 0, hair); set(4, 0, hair); set(3, 1, hair); set(4, 1, hair); }
    else if (style === 4) { row(0, gear); row(1, gear); row(2, shade(gear, 0.7)); }
    else if (style === 5) { for (let y = 0; y < 8; y++) { set(0, y, gear); set(7, y, gear); } row(0, gear); row(1, gear); set(1, 2, gear); set(6, 2, gear); }
    else if (style === 6) { row(1, skin); set(0, 1, hair); set(7, 1, hair); }
    else { row(2, hair, 4, 7); set(7, 3, hair); }
    const white = [243, 241, 234];
    set(2, 4, eye); set(5, 4, eye);
    if (R() < 0.6) { set(1, 4, white); set(6, 4, white); }
    if (R() < 0.4) { const b = shade(hair, 0.9); set(1, 3, b); set(2, 3, b); set(5, 3, b); set(6, 3, b); }
    set(3, 5, shade(skin, 0.86)); set(4, 5, shade(skin, 0.86));
    const m = R();
    if (m < 0.22) { row(6, hair, 1, 6); row(7, hair, 1, 6); set(3, 6, shade(skin, 0.55)); set(4, 6, shade(skin, 0.55)); }
    else if (m < 0.34) { row(5, gear, 1, 6); row(6, gear, 1, 6); row(7, gear, 1, 6); }
    else { set(3, 6, shade(skin, 0.6)); set(4, 6, shade(skin, 0.6)); if (R() < 0.5) { set(2, 6, shade(skin, 0.72)); set(5, 6, shade(skin, 0.72)); } }
    if (R() < 0.14) set(6, 5, [163, 38, 27]);
    return px.map(c => shade(c, 0.93 + R() * 0.12));
  }
  const headURL = (name, seed) => paint(8, 8, headPixels(name, seed), "h|" + String(name).toLowerCase() + "|" + (seed | 0));
  function head(user, size, cls) {
    const u = user || {};
    const s = size || 32;
    return `<img class="hd${cls ? " " + cls : ""}" src="${headURL(u.deleted ? "?" : u.name, u.avatar || 0)}" width="${s}" height="${s}" alt="" loading="lazy" decoding="async">`;
  }

  /* ---------- clan banners: a 20 x 40 cloth with up to six patterns ---------- */
  const COLORS = { bone: "#f3ecdb", ash: "#a8a08f", stone: "#57524a", coal: "#1f1d1b", umber: "#7a4a2a", blood: "#a3261b", lava: "#ff6a1f", gold: "#f2b632",
    moss: "#7fae3a", pine: "#3f6b2a", teal: "#1f8a8a", sky: "#4aa3d8", cobalt: "#3346a8", violet: "#7a3bb0", rose: "#d0508f", coral: "#f08a7a" };
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const art = rows => (x, y) => {
    const h = rows.length, w = rows[0].length, ox = Math.floor((20 - w) / 2), oy = Math.floor((40 - h) / 2) - 1;
    const r = rows[y - oy];
    return !!r && x - ox >= 0 && x - ox < w && r[x - ox] === "#";
  };
  const PAT = {
    "stripe-left": x => x < 6, "stripe-right": x => x > 13, "stripe-center": x => x >= 7 && x <= 12,
    "stripe-top": (x, y) => y < 10, "stripe-bottom": (x, y) => y >= 30, "stripe-middle": (x, y) => y >= 16 && y < 24,
    bend: (x, y) => Math.abs(x - y / 2) < 3, "bend-sinister": (x, y) => Math.abs(19 - x - y / 2) < 3,
    saltire: (x, y) => Math.abs(x - y / 2) < 2.5 || Math.abs(19 - x - y / 2) < 2.5,
    cross: (x, y) => (x >= 8 && x <= 11) || (y >= 14 && y <= 17),
    border: (x, y) => x < 2 || x > 17 || y < 2 || y > 37,
    chevron: (x, y) => { const d = Math.abs(x - 9.5) * 1.1; return y > 22 + d && y < 30 + d; },
    "chevron-top": (x, y) => { const d = Math.abs(x - 9.5) * 1.1; return y < 18 - d && y > 10 - d; },
    lozenge: (x, y) => Math.abs(x - 9.5) / 8 + Math.abs(y - 19.5) / 14 <= 1,
    roundel: (x, y) => (x - 9.5) ** 2 + (y - 18.5) ** 2 <= 36,
    "half-left": x => x < 10, "half-right": x => x >= 10, "half-top": (x, y) => y < 20, "half-bottom": (x, y) => y >= 20,
    paly: x => (x >> 1) % 2 === 0, barry: (x, y) => (y >> 2) % 2 === 0, chequy: (x, y) => ((x >> 2) + (y >> 2)) % 2 === 0,
    bricks: (x, y) => { const off = (y >> 2) % 2 ? 2 : 0; return y % 4 === 3 || (x + off) % 5 === 4; },
    gradient: (x, y) => BAYER[(y & 3) * 4 + (x & 3)] / 16 < 1 - y / 30,
    "gradient-up": (x, y) => BAYER[(y & 3) * 4 + (x & 3)] / 16 < (y - 10) / 30,
    flame: art([".....#....", "....##....", "....###...", "...####.#.", "..#######.", ".########.", ".##.#####.", "##...###.#", "##....##.#", "###...#.##", ".###...##.", "..######..", "...####..."]),
    skull: art(["..######..", ".########.", "##########", "##..##..##", "##..##..##", "##########", "####..####", ".########.", "..#.##.#..", "..######..", "..#.#.#..."]),
    sword: art(["..........##", ".........###", "........###.", ".......###..", "......###...", ".#...###....", ".##.###.....", "..####......", "...##.......", "..####......", ".##..##.....", "##.........."]),
    crown: art(["#....##....#", "##..####..##", "############", "############", "#.##.##.##.#", "############", "############"]),
    star: art([".....#.....", ".....#.....", "....###....", "....###....", "###########", ".#########.", "..#######..", "..#######..", ".###...###.", ".##.....##.", "##.......##"]),
    tower: art(["#.#.##.#.#", "##########", ".########.", ".##....##.", ".##.##.##.", ".##....##.", ".########.", ".###..###.", ".###..###.", ".########.", ".##.##.##.", ".########.", ".###..###.", "##########", "##########", "##########"]),
  };
  const PATTERNS = Object.keys(PAT);
  const PATTERN_NAMES = { "stripe-left": "Left stripe", "stripe-right": "Right stripe", "stripe-center": "Pale", "stripe-top": "Chief", "stripe-bottom": "Base",
    "stripe-middle": "Fess", bend: "Bend", "bend-sinister": "Bend sinister", saltire: "Saltire", cross: "Cross", border: "Border", chevron: "Chevron",
    "chevron-top": "Inverted chevron", lozenge: "Lozenge", roundel: "Roundel", "half-left": "Left half", "half-right": "Right half", "half-top": "Top half",
    "half-bottom": "Bottom half", paly: "Paly", barry: "Barry", chequy: "Chequy", bricks: "Bricks", gradient: "Fade down", "gradient-up": "Fade up",
    flame: "Flame", skull: "Skull", sword: "Sword", crown: "Crown", star: "Star", tower: "Watchtower" };
  function parseBanner(spec) {
    const parts = String(spec || "").split("|");
    const base = COLORS[parts[0]] ? parts[0] : "coal";
    const layers = parts.slice(1).map(l => l.split(":")).filter(l => PAT[l[0]] && COLORS[l[1]]).map(([p, c]) => ({ p, c })).slice(0, 6);
    return { base, layers };
  }
  const bannerSpec = b => [b.base].concat(b.layers.map(l => l.p + ":" + l.c)).join("|");
  function bannerURL(spec) {
    const key = "b|" + spec;
    if (cache.has(key)) return cache.get(key);
    const b = parseBanner(spec);
    const R = rng(hash32(String(spec)));
    const px = [];
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 20; x++) {
        let c = rgb(COLORS[b.base]);
        for (const l of b.layers) if (PAT[l.p](x, y)) c = rgb(COLORS[l.c]);
        const fold = 1 - 0.07 * Math.sin((x / 19) * Math.PI * 2) - (y > 37 ? 0.12 : 0) - (x === 0 || x === 19 ? 0.08 : 0);
        px.push(shade(c, fold * (0.95 + R() * 0.08)));
      }
    }
    return paint(20, 40, px, key);
  }
  function banner(spec, cls, label) {
    return `<span class="bnr${cls ? " " + cls : ""}"${label ? ` role="img" aria-label="${esc(label)}"` : ""}><img src="${bannerURL(spec)}" alt="" width="20" height="40" decoding="async"></span>`;
  }
  function randomBanner(seed) {
    const R = rng(seed >>> 0 || (Math.random() * 1e9) | 0);
    const keys = Object.keys(COLORS), pick = a => a[(R() * a.length) | 0];
    const base = pick(keys);
    const n = 1 + ((R() * 3) | 0), layers = [];
    for (let i = 0; i < n; i++) {
      let c = pick(keys);
      while (c === base) c = pick(keys);
      layers.push({ p: pick(PATTERNS), c });
    }
    return bannerSpec({ base, layers });
  }

  /* ---------- reactions: tiny pixel icons ---------- */
  const ICONS = {
    fire: ["...#....", "..##....", "..###.#.", ".#####..", ".######.", "########", "##.##.##", ".######."],
    skull: [".######.", "########", "#..##..#", "#..##..#", "########", ".##..##.", "..####..", "..#..#.."],
    cookie: ["..####..", ".##.###.", "###.##.#", "#.####.#", "###.####", "#.###.##", ".####.#.", "..####.."],
  };
  function pix(rows) {
    let r = "";
    rows.forEach((line, y) => { for (let x = 0; x < line.length; x++) if (line[x] === "#") r += `<rect x="${x}" y="${y}" width="1" height="1"/>`; });
    return `<svg class="px" viewBox="0 0 8 8" aria-hidden="true" shape-rendering="crispEdges">${r}</svg>`;
  }
  const REACT = { fire: { label: "Fire", icon: pix(ICONS.fire) }, skull: { label: "Dead", icon: pix(ICONS.skull) }, cookie: { label: "Cookie", icon: pix(ICONS.cookie) }, gg: { label: "GG", icon: '<b class="gg" aria-hidden="true">GG</b>' } };

  /* ---------- post text: escaped first, then a few safe marks ---------- */
  function format(src) {
    const keep = [];
    const stash = html => "\u0000" + (keep.push(html) - 1) + "\u0000";
    let s = esc(String(src || "").replace(/\u0000/g, ""));
    s = s.replace(/`([^`\n]{1,400})`/g, (m, code) => stash("<code>" + code + "</code>"));
    s = s.replace(/\bhttps?:\/\/[^\s<>"\u0000]+/g, m => {
      let url = m, tail = "";
      while (/[.,!?:;)\]']$/.test(url) && !(url.endsWith(")") && url.includes("("))) { tail = url.slice(-1) + tail; url = url.slice(0, -1); }
      return stash(`<a href="${url}" target="_blank" rel="nofollow ugc noopener noreferrer">${url.replace(/^https?:\/\//, "")}</a>`) + tail;
    });
    s = s.replace(/\b[xX]\s*[:=]?\s*(-?\d{1,7})\s*[,;]?\s*(?:[yY]\s*[:=]?\s*-?\d{1,3}\s*[,;]?\s*)?[zZ]\s*[:=]?\s*(-?\d{1,7})\b/g,
      (m, x, z) => stash(`<a class="coords" href="index.html#map-x${x}-z${z}" title="Show ${x}, ${z} on the 3D map">${m}</a>`));
    s = s.replace(/(^|[\s(>])@([A-Za-z0-9_]{3,16})\b/g, (m, pre, n) => pre + stash(`<a class="mention" href="${HUB}#/u/${encodeURIComponent(n)}">@${n}</a>`));
    s = s.replace(/\[([A-Z0-9]{2,5})\]/g, (m, tag) => stash(`<a class="ctag ctag-inline" href="${HUB}#/c/${tag}">[${tag}]</a>`));
    s = s.replace(/\*\*([^*\n]+?)\*\*/g, "<b>$1</b>");
    s = s.replace(/(^|[^*\w])\*([^*\n]+?)\*(?=[^*\w]|$)/gm, "$1<i>$2</i>");
    s = s.replace(/(^|[^\w])_([^_\n]+?)_(?=[^\w]|$)/gm, "$1<i>$2</i>");
    s = s.replace(/~~([^~\n]+?)~~/g, "<s>$1</s>");
    s = s.replace(/\|\|([^|\n]+?)\|\|/g, '<span class="spoiler" tabindex="0" role="button" aria-label="Spoiler. Press to show.">$1</span>');
    const out = [];
    let para = [], quote = [];
    const flushPara = () => { if (para.length) out.push("<p>" + para.join("<br>") + "</p>"); para = []; };
    const flushQuote = () => { if (quote.length) out.push("<blockquote>" + quote.join("<br>") + "</blockquote>"); quote = []; };
    for (const line of s.split("\n")) {
      const q = /^&gt;\s?(.*)$/.exec(line);
      if (q) { flushPara(); quote.push(q[1]); continue; }
      flushQuote();
      if (!line.trim()) { flushPara(); continue; }
      para.push(line);
    }
    flushPara(); flushQuote();
    return out.join("").replace(/\u0000(\d+)\u0000/g, (m, i) => keep[+i]);
  }
  const plain = (src, n) => {
    const t = String(src || "").replace(/[*_~|`>]/g, "").replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n - 1).trimEnd() + "\u2026" : t;
  };

  /* ---------- time ---------- */
  function ago(t) {
    const s = (Date.now() - t) / 1000;
    if (s < 45) return "just now";
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + " min ago";
    if (s < 86400) return Math.round(s / 3600) + " h ago";
    if (s < 172800) return "yesterday";
    if (s < 7 * 86400) return Math.floor(s / 86400) + " days ago";
    const d = new Date(t);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
  }
  const when = t => `<time datetime="${new Date(t).toISOString()}" title="${esc(new Date(t).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" }))}">${ago(t)}</time>`;
  const plural = (n, one, many) => fmt(n) + " " + (n === 1 ? one : many || one + "s");

  /* ---------- little pieces used everywhere ---------- */
  const userHref = u => HUB + "#/u/" + encodeURIComponent(u.name);
  const clanHref = c => HUB + "#/c/" + encodeURIComponent(c.tag);
  const ctag = c => c ? `<a class="ctag" href="${clanHref(c)}" style="--cc:${COLORS[c.color] || COLORS.lava}" title="${esc(c.name)}">${esc(c.tag)}</a>` : "";
  function badges(u, compact) {
    if (!u || u.deleted) return "";
    const b = [];
    if (u.role === "admin") b.push('<span class="bdg bdg-admin" title="Server admin">Admin</span>');
    else if (u.role === "mod") b.push('<span class="bdg bdg-mod" title="Moderator">Mod</span>');
    if (u.supporter) b.push(`<span class="bdg bdg-sup" title="Supports the server">${compact ? "\u2665" : "Supporter"}</span>`);
    if (u.verified) b.push('<span class="bdg bdg-ver" title="This in-game name is proven">\u2713</span>');
    return b.join("");
  }
  function who(u, size, opts = {}) {
    if (!u || u.deleted) return `<span class="who who-gone">${head({ deleted: true }, size || 24)}<b>Deleted player</b></span>`;
    return `<a class="who" href="${userHref(u)}">${head(u, size || 24)}<b>${esc(u.name)}</b></a>${opts.tag === false ? "" : ctag(u.clan)}${opts.badges === false ? "" : badges(u, true)}`;
  }

  /* ---------- the account chip in the top bar ---------- */
  /* "add" while the account has no email, "confirm" while it isn't confirmed (a confirmed recovery email counts), else "".
     Older answers without the email field say nothing. */
  function mailTodo(u) {
    const a = u && u.account;
    if (!a || typeof a.email !== "string") return "";
    if (a.emailVerified || (a.recovery && a.recoveryVerified)) return "";
    return a.email ? "confirm" : "add";
  }
  /* Sign in and Create account: on the two app pages they open right there and carry the page the visitor is on, so
     signing in comes back to the thread or the list (not from an account page itself); elsewhere they open the
     community page. Kept while the community service is down too, so Sign in never leaves the first screen. */
  function visitorLinks() {
    if (!ON_HUB) return [`${HUB}#/login`, `${HUB}#/register`];
    const here = location.hash && location.hash !== "#" ? location.hash : "#" + START;
    // on an account page itself, keep where that page was going to send them (Sign in <-> Create account keeps it)
    const own = /^#\/(login|register|auth|forgot|reset|verify|undo-email|welcome)\b/.test(here) ? /[?&]next=([^&]*)/.exec(here) : null;
    const back = own ? "?next=" + own[1] : here === "#/" || /^#\/(login|register|auth|forgot|reset|verify|undo-email|welcome)\b/.test(here) ? "" : "?next=" + encodeURIComponent(here);
    return ["#/login" + back, "#/register" + back];
  }
  function renderAccount() {
    const [signIn, join] = visitorLinks();
    const c = counts(), mail = me ? mailTodo(me) : "", unread = c.unreadChats, many = n => (n > 99 ? "99+" : n);
    // the phone menu's account block: the same two links for visitors, the member's own pages for members
    for (const box of $$("[data-account-menu]")) {
      if (!me) {
        box.innerHTML = `<a class="btn-out" href="${signIn}">Sign in</a><a class="btn-out" href="${join}">Create account</a>`;
        box.removeAttribute("data-member");
        continue;
      }
      box.innerHTML = `<a class="btn-out" href="${userHref(me)}">Your profile</a><a class="btn-out" href="${HUB}#/inbox">Invites and replies${c.waiting ? ` <i class="acct-dot">${many(c.waiting)}</i>` : ""}</a>`
        + `<a class="btn-out" href="${HUB}#/messages">Messages${unread ? ` <i class="acct-dot">${many(unread)}</i>` : ""}</a>`
        + `<a class="btn-out" href="${HUB}#/settings${mail ? "?p=email" : ""}">Settings${mail ? ' <i class="acct-dot" aria-label="your email needs you">!</i>' : ""}</a>`
        + '<button type="button" class="btn-out" data-signout>Sign out</button>';
      box.setAttribute("data-member", "1");
    }
    if (document.documentElement) document.documentElement.classList.remove("acct-wait");
    for (const slot of $$("[data-account]")) {
      if (!me) {
        slot.innerHTML = `<a class="acct-in" href="${signIn}">Sign in</a><a class="btn-out acct-join" href="${join}">Create account</a>`;
        continue;
      }
      // waiting: invites, clan news, replies to your threads, join requests and alliance asks (the inbox); reports for staff;
      // and one for an email that still needs adding or confirming
      const alerts = c.waiting + c.reports + (mail ? 1 : 0);
      slot.innerHTML = `<a class="acct-msg" href="${HUB}#/messages" title="Messages" aria-label="Messages${unread ? ", " + unread + " unread" : ""}"><svg class="i" aria-hidden="true"><use href="#i-chat"/></svg><span class="acct-msg-word" aria-hidden="true">Messages</span>${unread ? `<i class="acct-dot">${many(unread)}</i>` : ""}</a><details class="acct">
        <summary aria-label="Your account, ${esc(me.name)}${alerts ? ", " + alerts + " waiting" : ""}">${head(me, 26)}<span class="acct-name">${esc(me.name)}</span>${alerts ? `<i class="acct-dot">${many(alerts)}</i>` : ""}</summary>
        <div class="acct-menu">
          <a href="${userHref(me)}">Your profile</a>
          <a href="${HUB}#/inbox">Invites and replies${c.waiting ? ` <i class="acct-dot">${many(c.waiting)}</i>` : ""}</a>
          <a href="${HUB}#/messages">Messages${unread ? ` <i class="acct-dot">${many(unread)}</i>` : ""}</a>
          ${me.clan ? `<a href="${clanHref(me.clan)}">${esc(me.clan.name)}${c.clanRequests ? ` <i class="acct-dot">${many(c.clanRequests)}</i>` : ""}</a>` : `<a href="${HUB}#/clans">Find a clan</a>`}
          <a href="${HUB}#/settings${mail ? "?p=email" : ""}">Settings${mail ? ' <i class="acct-dot" aria-label="your email needs you">!</i>' : ""}</a>
          ${me.role !== "player" ? `<a href="${HUB}#/admin">Staff desk${me.reports ? ` <i class="acct-dot">${me.reports}</i>` : ""}</a>` : ""}
          <button type="button" data-signout>Sign out</button>
        </div></details>`;
    }
  }
  document.addEventListener("click", e => {
    const out = e.target.closest("[data-signout]");
    if (out) {
      e.preventDefault();
      const menu = out.closest("details.menu");   // Sign out in the phone menu closes it, like its links do
      if (menu) menu.removeAttribute("open");
      signOut(false).then(() => dispatchEvent(new CustomEvent("welloby:toast", { detail: "Signed out" })));
    }
    for (const d of $$("details.acct[open]")) if (!d.contains(e.target) || e.target.closest(".acct-menu a")) d.removeAttribute("open");
  });
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    for (const d of $$("details.acct[open]")) { d.removeAttribute("open"); $("summary", d).focus(); }
  });
  subs.add(renderAccount);
  // a visitor's Sign in follows the page they move to, so it comes back there
  // the phone menu closes when the page moves on (Back, or a script going to another page), not only on its own links
  if (ON_HUB) addEventListener("hashchange", () => {
    if (!me) renderAccount();
    for (const m of $$("details.menu[open]")) m.removeAttribute("open");
  });
  /* the community page keeps the messages count fresh without fetching the whole account again */
  function setUnread(n) { setCounts({ unread: n }); }

  /* ---------- terms: every member accepts the current terms once, on the account ----------
     The account keeps the version it accepted (account.terms), so signing in on a new phone doesn't ask again. This
     browser keeps it too, for visitors and for an API from before accounts kept it. */
  const TERMS = { version: "2026-11-20", label: "20 November 2026", key: "welloby.terms", url: "terms.html" };
  const termsAccepted = () => store.get(TERMS.key) === TERMS.version;
  const termsSaved = u => !!u && !!u.account && u.account.terms === TERMS.version;
  function acceptTerms() {
    store.set(TERMS.key, TERMS.version);
    if (me && me.account && typeof me.account.terms === "string" && me.account.terms !== TERMS.version) {
      me.account.terms = TERMS.version;
      api("/me", { method: "PATCH", body: { terms: TERMS.version } }).catch(() => { me && me.account && (me.account.terms = ""); });
    }
  }
  let termsLater = false;
  function termsGate(u) {
    if (!u || termsLater || /\/terms(\.html)?$/.test(location.pathname) || $("[data-terms-gate]")) return;
    if (termsSaved(u)) { store.set(TERMS.key, TERMS.version); return; }
    if (termsAccepted()) { acceptTerms(); return; }   // accepted in this browser before the account kept it: the account learns it now
    const d = document.createElement("dialog");
    if (typeof d.showModal !== "function") return;
    d.className = "terms-gate notch";
    d.setAttribute("data-terms-gate", "");
    d.setAttribute("aria-labelledby", "terms-gate-title");
    d.innerHTML = `<p class="kicker">New terms \u00b7 ${TERMS.label}</p>
      <h2 id="terms-gate-title">Accept the Welloby terms</h2>
      <p>Welloby now has terms for the server, the Discord and this site. The short version: staff can ban anyone, for any reason. You play at your own risk, and Welloby isn't responsible for what you lose.</p>
      <p><a href="${TERMS.url}" target="_blank" rel="noopener">Read the full terms</a></p>
      <form method="dialog" class="terms-gate-acts">
        <button class="btn btn-lava" value="accept">I agree</button>
        <button class="btn btn-line" value="signout">Sign out instead</button>
      </form>`;
    /* only "Sign out instead" signs out; Esc or the phone's back button is "not now", and it asks again on the next page load */
    d.addEventListener("close", () => {
      if (d.returnValue === "accept") acceptTerms();
      else if (d.returnValue === "signout") signOut(false);
      else termsLater = true;
      d.remove();
    });
    document.body.append(d);
    d.showModal();
  }
  subs.add(termsGate);
  /* Visitors who aren't signed in get a small notice instead, which doesn't stop them browsing
     (asked for in the advertising session, 20 Nov 2026). Its OK is the same acceptance on this
     device as a member's "I agree"; members keep the dialog above. */
  /* The notice is the slim strip at the bottom that every page carries (build.py puts it first after "Skip to content",
     so OK is an early keyboard stop); a page without one gets it added. While it is up the page gets its measured
     height as room at the bottom (--strip-h), so it never sits on the last buttons, and Help floats above it.
     html.terms-ok hides it for good once this browser accepted or a member is signed in. */
  const termsRoom = on => {
    try {
      document.body.classList.toggle("has-terms-bar", on);
      if (document.documentElement) document.documentElement.classList.toggle("terms-ok", !on);
    } catch (e) { /* no page body */ }
  };
  function stripHeight(bar) {
    const put = () => { const h = bar.offsetHeight; if (h && document.documentElement) document.documentElement.style.setProperty("--strip-h", h + "px"); };
    put();
    if (typeof ResizeObserver === "function") new ResizeObserver(put).observe(bar);
  }
  const wired = new WeakSet();
  function termsBar() {
    let bar = $("[data-terms-bar]");
    if (me || termsAccepted() || /\/terms(\.html)?$/.test(location.pathname)) { if (bar) bar.remove(); termsRoom(false); return; }
    if (bar && wired.has(bar)) return;
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "terms-strip";
      bar.setAttribute("data-terms-bar", "");
      bar.setAttribute("role", "region");
      bar.setAttribute("aria-label", "Terms of use");
      bar.innerHTML = `<p>By using this site, playing on Welloby or joining its Discord, you accept the <a href="${TERMS.url}">Terms</a>.</p><button type="button" class="btn-out" data-terms-ok>OK</button>`;
      document.body.append(bar);
    }
    wired.add(bar);
    termsRoom(true);
    bar.querySelector("[data-terms-ok]").addEventListener("click", () => { acceptTerms(); bar.remove(); termsRoom(false); });
    stripHeight(bar);
  }
  subs.add(termsBar);
  if (!token) termsBar();   // no saved session at all: show it straight away
  ready.then(termsBar);     // otherwise wait until sign-in is known, so members never see it flash
  /* agreeing in another tab closes the prompt and the notice here too */
  addEventListener("storage", e => {
    if (e.key !== TERMS.key) return;
    const g = $("[data-terms-gate]");
    if (g && termsAccepted()) { g.returnValue = "accept"; g.close(); }
    termsBar();
  });

  /* ---------- the Community section on the main page ---------- */
  const teaser = $("[data-community]");
  async function fillTeaser() {
    if (!teaser) return;
    const online = await ready;
    if (!online) return;
    let d;
    try { d = await api("/hub"); } catch (e) { return; }
    const st = d.stats || {};
    $("[data-cm-stats]", teaser).innerHTML = [["players", "members"], ["clans", "clans"], ["threads", "threads"], ["posts", "posts"]]
      .map(([k, label]) => `<div><b>${fmt(st[k])}</b><span>${label}</span></div>`).join("");
    $("[data-cm-clans]", teaser).innerHTML = (d.clans || []).slice(0, 5).map((c, i) =>
      `<li><a href="${clanHref(c)}"><i class="rk">${i + 1}</i>${banner(c.banner, "bnr-xs")}<span><b>${esc(c.name)}</b><small>[${esc(c.tag)}] \u00b7 ${plural(c.members, "member")}</small></span></a></li>`).join("")
      || `<li class="cmt-empty">No clans yet. <a href="${HUB}#/clans/new">Make the first one.</a></li>`;
    $("[data-cm-threads]", teaser).innerHTML = (d.threads || []).slice(0, 5).map(t =>
      `<li><a href="${HUB}#/t/${t.id}"><b>${esc(t.title)}</b><small>${t.user && !t.user.deleted ? esc(t.user.name) : "Deleted player"} \u00b7 ${plural(t.replies, "reply", "replies")} \u00b7 ${ago(t.lastAt)}</small></a></li>`).join("")
      || `<li class="cmt-empty">The forum is quiet. <a href="${HUB}#/new">Start the first thread.</a></li>`;
    $("[data-cm-players]", teaser).innerHTML = (d.players || []).slice(0, 12).map(u =>
      `<li><a href="${userHref(u)}" title="${esc(u.name)}">${head(u, 44)}<span>${esc(u.name)}</span></a></li>`).join("");
    const join = $("[data-cm-join]", teaser);
    const paintJoin = () => {
      if (!join) return;
      join.href = me ? userHref(me) : HUB + "#/register";
      join.textContent = me ? "Your profile" : "Create an account";
    };
    subs.add(paintJoin); paintJoin();
    teaser.hidden = false;
  }
  fillTeaser();

  /* creator cards and other static spots that want a block head */
  for (const el of $$("[data-head-name]")) el.innerHTML = head({ name: el.dataset.headName }, 56);

  window.WC = {
    API, HUB, ON_HUB, api, ApiError, ready, refreshMe, signOut, setSession, setUnread, counts, setCounts, refreshCounts, mailTodo,
    me: () => me, health: () => health, onAuth: fn => { subs.add(fn); return () => subs.delete(fn); },
    esc, fmt, money, ago, when, plural, format, plain,
    head, headURL, banner, bannerURL, parseBanner, bannerSpec, randomBanner, COLORS, PATTERNS, PATTERN_NAMES, REACT,
    who, ctag, badges, userHref, clanHref, hash32,
    TERMS, termsAccepted, acceptTerms,
    push: { state: pushState, stateOf: pushStateOf, on: pushOn, off: pushOff, sync: pushSync, test: () => api("/push/test", { body: {} }), ios: IOS, standalone },
    backTo,
  };
})();
