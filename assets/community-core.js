/* Welloby community, shared by every page: talks to the community API, keeps you signed in,
   draws block heads and clan banners, and formats posts. community.js builds the board on
   top of this; on the main page it fills the Community section and the account chip.
   Everything people type is escaped before it reaches the page. */
(() => {
  "use strict";
  const W = window.WELLOBY || {};
  const CFG = W.community || {};
  const API = String(CFG.api || "/api").replace(/\/+$/, "");
  const ON_HUB = /community(\.html)?\/?$/.test(location.pathname) || document.body.classList.contains("cm-page");
  const HUB = ON_HUB ? "" : "community.html";
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
  class ApiError extends Error { constructor(msg, status, code) { super(msg); this.status = status; this.code = code; } }
  let token = store.get(KEY);
  let me = null, health = null;
  const subs = new Set();
  const emit = () => subs.forEach(fn => { try { fn(me); } catch (e) { console.error(e); } });

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
      throw new ApiError("Can't reach the board right now. Check your connection and try again.", 0, "offline");
    }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      if (res.status === 401 && data && data.code === "auth" && token) setSession(null, null);
      throw new ApiError((data && data.error) || "Something went wrong. Try again.", res.status, data && data.code);
    }
    return data || {};
  }
  function setSession(t, user) {
    token = t || null;
    store.set(KEY, token);
    me = token ? user || me : null;
    emit();
  }
  async function refreshMe() {
    if (!token) { me = null; emit(); return null; }
    try { const d = await api("/me"); me = d.user || null; if (!me) setSession(null, null); else emit(); }
    catch (e) { if (e.status === 401) setSession(null, null); }
    return me;
  }
  async function signOut(everywhere) {
    try { await api(everywhere ? "/auth/logout-all" : "/auth/logout", { method: "POST", body: {} }); } catch (e) { /* signed out locally anyway */ }
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
    if (health) await refreshMe();
    window.wellobyCommunity = { online: !!health, api: API };
    dispatchEvent(new CustomEvent("welloby:community", { detail: { online: !!health } }));
    emit();
    return !!health;
  })();
  /* another tab signed in or out */
  addEventListener("storage", e => { if (e.key === KEY) { token = e.newValue; refreshMe(); } });

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
      (m, x, z) => stash(`<a class="coords" href="index.html#at-x${x}-z${z}" title="Show ${x}, ${z} on the spawn atlas">${m}</a>`));
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
    if (u.verified) b.push('<span class="bdg bdg-ver" title="Staff checked this is their in-game name">\u2713</span>');
    return b.join("");
  }
  function who(u, size, opts = {}) {
    if (!u || u.deleted) return `<span class="who who-gone">${head({ deleted: true }, size || 24)}<b>Deleted player</b></span>`;
    return `<a class="who" href="${userHref(u)}">${head(u, size || 24)}<b>${esc(u.name)}</b></a>${opts.tag === false ? "" : ctag(u.clan)}${opts.badges === false ? "" : badges(u, true)}`;
  }

  /* ---------- the account chip in the top bar ---------- */
  function renderAccount() {
    for (const slot of $$("[data-account]")) {
      if (!health) { slot.innerHTML = ""; continue; }
      if (!me) {
        slot.innerHTML = ON_HUB
          ? '<a class="acct-in" href="#/login">Sign in</a><a class="btn btn-lava btn-s acct-join" href="#/register">Join</a>'
          : `<a class="acct-in" href="${HUB}#/login">Sign in</a>`;
        continue;
      }
      const alerts = (me.clanRequests || 0) + (me.reports || 0);
      slot.innerHTML = `<details class="acct">
        <summary aria-label="Your account, ${esc(me.name)}${alerts ? ", " + alerts + " waiting" : ""}">${head(me, 26)}<span class="acct-name">${esc(me.name)}</span>${alerts ? `<i class="acct-dot">${alerts}</i>` : ""}</summary>
        <div class="acct-menu">
          <a href="${userHref(me)}">Your profile</a>
          ${me.clan ? `<a href="${clanHref(me.clan)}">${esc(me.clan.name)}${me.clanRequests ? ` <i class="acct-dot">${me.clanRequests}</i>` : ""}</a>` : `<a href="${HUB}#/clans">Find a clan</a>`}
          <a href="${HUB}#/settings">Settings</a>
          ${me.role !== "player" ? `<a href="${HUB}#/admin">Staff desk${me.reports ? ` <i class="acct-dot">${me.reports}</i>` : ""}</a>` : ""}
          <button type="button" data-signout>Sign out</button>
        </div></details>`;
    }
  }
  document.addEventListener("click", e => {
    const out = e.target.closest("[data-signout]");
    if (out) { e.preventDefault(); signOut(false).then(() => dispatchEvent(new CustomEvent("welloby:toast", { detail: "Signed out" }))); }
    for (const d of $$("details.acct[open]")) if (!d.contains(e.target) || e.target.closest(".acct-menu a")) d.removeAttribute("open");
  });
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    for (const d of $$("details.acct[open]")) { d.removeAttribute("open"); $("summary", d).focus(); }
  });
  subs.add(renderAccount);

  /* ---------- the Community section on the main page ---------- */
  const teaser = $("[data-community]");
  async function fillTeaser() {
    if (!teaser) return;
    const online = await ready;
    if (!online) return;
    let d;
    try { d = await api("/hub"); } catch (e) { return; }
    const st = d.stats || {};
    $("[data-cm-stats]", teaser).innerHTML = [["players", "players"], ["clans", "clans"], ["threads", "threads"], ["posts", "posts"]]
      .map(([k, label]) => `<div><b>${fmt(st[k])}</b><span>${label}</span></div>`).join("");
    $("[data-cm-clans]", teaser).innerHTML = (d.clans || []).slice(0, 5).map((c, i) =>
      `<li><a href="${clanHref(c)}"><i class="rk">${i + 1}</i>${banner(c.banner, "bnr-xs")}<span><b>${esc(c.name)}</b><small>[${esc(c.tag)}] \u00b7 ${plural(c.members, "member")}</small></span></a></li>`).join("")
      || `<li class="cmt-empty">No clans yet. <a href="${HUB}#/clans/new">Found the first one.</a></li>`;
    $("[data-cm-threads]", teaser).innerHTML = (d.threads || []).slice(0, 5).map(t =>
      `<li><a href="${HUB}#/t/${t.id}"><b>${esc(t.title)}</b><small>${t.user && !t.user.deleted ? esc(t.user.name) : "Deleted player"} \u00b7 ${plural(t.replies, "reply", "replies")} \u00b7 ${ago(t.lastAt)}</small></a></li>`).join("")
      || `<li class="cmt-empty">The board is quiet. <a href="${HUB}#/new">Start the first thread.</a></li>`;
    $("[data-cm-players]", teaser).innerHTML = (d.players || []).slice(0, 12).map(u =>
      `<li><a href="${userHref(u)}" title="${esc(u.name)}">${head(u, 44)}<span>${esc(u.name)}</span></a></li>`).join("");
    const join = $("[data-cm-join]", teaser);
    const paintJoin = () => {
      if (!join) return;
      join.href = me ? userHref(me) : HUB + "#/register";
      join.textContent = me ? "Your profile" : "Claim your name";
    };
    subs.add(paintJoin); paintJoin();
    teaser.hidden = false;
  }
  fillTeaser();

  /* creator cards and other static spots that want a block head */
  for (const el of $$("[data-head-name]")) el.innerHTML = head({ name: el.dataset.headName }, 56);

  window.WC = {
    API, HUB, ON_HUB, api, ApiError, ready, refreshMe, signOut, setSession,
    me: () => me, health: () => health, onAuth: fn => { subs.add(fn); return () => subs.delete(fn); },
    esc, fmt, money, ago, when, plural, format, plain,
    head, headURL, banner, bannerURL, parseBanner, bannerSpec, randomBanner, COLORS, PATTERNS, PATTERN_NAMES, REACT,
    who, ctag, badges, userHref, clanHref, hash32,
  };
})();
