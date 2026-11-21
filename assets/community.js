/* The Welloby community page (community.html): the board, clans, players, supporters,
   sign-in and the staff desk. One page, switched by the part of the address after #.
   It talks to the API through community-core.js (window.WC). */
(() => {
  "use strict";
  const WC = window.WC, app = document.getElementById("app");
  if (!WC || !app) return;
  const { api, esc, fmt, ago, when, plural, format, plain, head, banner, who, ctag, badges, money, COLORS } = WC;
  const W = window.WELLOBY || {};
  const DONATE = W.donate || {};
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const toast = t => dispatchEvent(new CustomEvent("welloby:toast", { detail: t }));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const enc = encodeURIComponent;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { if (v == null || v === "") localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  };
  let CATS = [
    { id: "news", name: "Announcements", about: "Server news from the staff.", staff: true },
    { id: "general", name: "General", about: "Anything about Welloby." },
    { id: "clans", name: "Clans and recruiting", about: "Find a crew, recruit, call out a rival." },
    { id: "history", name: "History and lore", about: "Wars, griefs, famous bases and how they fell." },
    { id: "trading", name: "Trading", about: "Buy, sell and swap. In-game items only." },
    { id: "help", name: "Help", about: "Can't connect, found a bug, need an answer." },
    { id: "offtopic", name: "Off-topic", about: "Everything that isn't Minecraft." },
  ];
  const CAT_ICON = { news: "i-flag", general: "i-chat", clans: "i-users", history: "i-scroll", trading: "i-swap", help: "i-help", offtopic: "i-dice" };
  const TAG_NAMES = { builder: "Builder", fighter: "Fighter", explorer: "Explorer", duper: "Duper", basehunter: "Base hunter", redstone: "Redstone", trader: "Trader",
    historian: "Historian", miner: "Miner", farmer: "Farmer", lonewolf: "Lone wolf", griefer: "Griefer" };
  const ROLE_NAMES = { leader: "Leader", officer: "Officer", member: "Member" };
  const JOIN_NAMES = { open: "Open to all", request: "Ask to join", closed: "Not recruiting" };
  const catOf = id => CATS.find(c => c.id === id) || { id, name: id, about: "" };
  const icon = (id, cls) => `<svg class="i${cls ? " " + cls : ""}" aria-hidden="true"><use href="#${id}"/></svg>`;
  const me = () => WC.me();
  const isStaff = () => !!me() && me().role !== "player";

  /* ---------- views and events ---------- */
  let seq = 0, handlers = {}, timers = [];
  const on = (type, sel, fn) => { (handlers[type] = handlers[type] || []).push([sel, fn]); };
  for (const type of ["click", "submit", "input", "change", "keydown"]) {
    app.addEventListener(type, e => {
      for (const [sel, fn] of handlers[type] || []) {
        const el = e.target.closest(sel);
        if (el && app.contains(el)) {
          if (type === "submit" || (type === "click" && el.tagName === "BUTTON" && el.type !== "submit")) e.preventDefault();
          fn(e, el);
          return;
        }
      }
    });
  }
  function show(html, title, after) {
    app.innerHTML = `<div class="cm-view">${html}</div>`;
    placeStart();
    document.title = (title ? title + " \u00b7 " : "") + "Welloby community";
    if (after) after();
    $$(".cm-view .glow, .cm-view [data-stagger] > *").forEach((el, i) => el.style.setProperty("--i", Math.min(i, 14)));
  }
  function every(ms, fn) { const t = setInterval(() => { if (!document.hidden) fn(); }, ms); timers.push(t); }
  const parse = () => {
    const h = location.hash.replace(/^#/, "") || "/";
    const i = h.indexOf("?");
    return { path: (i < 0 ? h : h.slice(0, i)) || "/", q: new URLSearchParams(i < 0 ? "" : h.slice(i + 1)) };
  };
  const go = h => { if (location.hash === h) route(); else location.hash = h; };
  function setNav(path) {
    const top = "/" + (path.split("/")[1] || "");
    const map = { "/": "/", "/welcome": "/", "/forum": "/forum", "/t": "/forum", "/new": "/forum", "/search": "/forum", "/clans": "/clans", "/c": "/clans", "/players": "/players", "/u": "/players", "/supporters": "/supporters", "/servers": "/servers", "/s": "/servers" };
    const cur = map[top] || "";
    for (const a of $$(".bar-nav a, .menu-list a")) {
      const h = a.getAttribute("href") || "";
      if (cur && h === "#" + cur) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    }
    dispatchEvent(new Event("scroll"));
  }
  function skeleton() {
    app.innerHTML = '<div class="cm-view cm-loading" aria-label="Loading"><div class="wrap"><i class="sk sk-h"></i><i class="sk"></i><i class="sk"></i><i class="sk sk-s"></i></div></div>';
  }
  const ROUTES = [];
  const page = (re, fn) => ROUTES.push([re, fn]);
  let lastPath = null;
  async function route() {
    const my = ++seq;
    handlers = {};
    timers.forEach(clearInterval); timers = [];
    const { path, q } = parse();
    setNav(path);
    const samePage = lastPath === path;
    const online = await WC.ready;
    if (my !== seq) return;
    if (!online) { offline(); return; }
    const hit = ROUTES.find(([re]) => re.test(path));
    if (!hit) { notFound(); return; }
    if (!samePage) skeleton();
    app.setAttribute("aria-busy", "true");
    try { await hit[1](hit[0].exec(path), q, () => my !== seq); }
    catch (e) { if (my === seq) failed(e); }
    if (my !== seq) return;
    app.removeAttribute("aria-busy");
    const target = q.get("p") && document.getElementById("p" + q.get("p"));
    if (target) { target.scrollIntoView({ block: "center", behavior: reduced || !samePage ? "auto" : "smooth" }); target.classList.add("flash"); }
    else if (!samePage) scrollTo(0, 0);
    if (!samePage) {
      const h1 = $("h1", app);
      if (h1 && lastPath !== null) { h1.setAttribute("tabindex", "-1"); h1.focus({ preventScroll: true }); }
    }
    lastPath = path;
  }
  addEventListener("hashchange", route);
  /* signing out from the account menu redraws the page; sign-in forms move on by themselves */
  WC.ready.then(() => {
    let was = me() ? me().id : 0;
    WC.onAuth(() => { const now = me() ? me().id : 0; if (was && !now) { was = now; route(); } else was = now; });
  });
  app.addEventListener("click", e => { const s = e.target.closest(".spoiler"); if (s) s.classList.add("open"); });
  app.addEventListener("keydown", e => { const s = e.target.closest(".spoiler"); if (s && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); s.classList.add("open"); } });

  /* ---------- getting started ----------
     The three steps from the welcome page sit under the page title of the community pages until
     they're all done or the player hides them, so the next one is always a click away. */
  const startKey = u => "welloby.start." + u.id;
  const startSteps = u => [
    { href: "#/settings", icon: "i-edit", label: "Set up your profile", done: !!(u.bio || (u.tags || []).length || u.since || u.avatar) },
    { href: "#/clans", icon: "i-users", label: "Find a clan", done: !!(u.clan || (u.requested || []).length) },
    { href: "#/new/general", icon: "i-chat", label: "Say hi on the board", done: (u.posts || 0) + (u.threads || 0) > 0 },
  ];
  const startSig = u => startSteps(u).map(s => (s.done ? 1 : 0)).join("");
  function startBar(u) {
    const steps = startSteps(u), done = steps.filter(s => s.done).length, here = "#" + parse().path;
    return `<nav class="startbar wrap" aria-label="Getting started" data-start="${startSig(u)}">
      <p class="startbar-t"><b>Getting started</b><small>${done} of ${steps.length} done</small></p>
      <ol class="startbar-steps">${steps.map(s => `<li${s.done ? ' class="done"' : ""}><a href="${s.href}"${s.href === here ? ' aria-current="page"' : ""}>${icon(s.done ? "i-check" : s.icon)}<span>${s.label}</span>${s.done ? '<span class="sr-only"> (done)</span>' : ""}</a></li>`).join("")}</ol>
      <button type="button" class="startbar-x" data-startx aria-label="Hide these steps" title="Hide these steps">${icon("i-x")}</button></nav>`;
  }
  function startDone(u) { store.set(startKey(u), ""); toast("You're all set. Welcome to Welloby!"); }
  let startLooked = 0;
  function placeStart() {
    const u = me();
    if (!u || store.get(startKey(u)) !== "on") return;
    const top = $(".cm-view > .pagehead, .cm-view > .mast", app);   // the sign-in pages and the welcome page have neither
    if (!top) return;
    if (!startSig(u).includes("0")) { startDone(u); return; }
    top.insertAdjacentHTML("afterend", startBar(u));
    // posts and clan requests change on the server: look again now and then (the bar follows below)
    if (Date.now() - startLooked > 15000) { startLooked = Date.now(); WC.refreshMe(); }
  }
  /* each time the account is fetched again (saving the profile, joining a clan, the look above), tick steps off in place */
  WC.onAuth(u => {
    const bar = $(".startbar", app);
    if (!bar || !u || bar.dataset.start === startSig(u)) return;
    if (startSig(u).includes("0")) bar.outerHTML = startBar(u);
    else { bar.remove(); startDone(u); }
  });
  app.addEventListener("click", e => {
    const x = e.target.closest("[data-startx]");
    if (!x || !me()) return;
    store.set(startKey(me()), "");
    x.closest(".startbar").remove();
    toast("Hidden. Settings, Clans and the board are always in the menu.");
  });

  /* ---------- shared bits ---------- */
  const errBox = () => '<p class="form-err" role="alert" hidden></p>';
  function formErr(form, msg) {
    const box = $(".form-err", form);
    if (!box) { toast(msg); return; }
    box.textContent = msg; box.hidden = !msg;
    if (msg) box.scrollIntoView({ block: "nearest" });
  }
  async function busy(btn, fn) {
    if (!btn || btn.disabled) return;
    btn.disabled = true; btn.classList.add("is-busy");
    try { return await fn(); }
    finally { btn.disabled = false; btn.classList.remove("is-busy"); }
  }
  /* destructive buttons ask twice instead of opening a dialog */
  function twice(btn, fn, label) {
    if (btn.dataset.armed) { clearTimeout(btn._arm); delete btn.dataset.armed; btn.textContent = btn._label; return fn(); }
    btn._label = btn.textContent;
    btn.dataset.armed = "1"; btn.textContent = label || "Click again to confirm";
    btn._arm = setTimeout(() => { delete btn.dataset.armed; btn.textContent = btn._label; }, 4000);
  }
  const fields = form => Object.fromEntries(new FormData(form).entries());
  function needSignIn(what) {
    return `<div class="cm-gate notch"><h2>Sign in ${esc(what)}</h2><p>Accounts are free and take a minute, or one click with Google, Discord or Facebook. Your password here is separate from the one you use in game.</p>
      <p class="cm-gate-acts"><a class="btn btn-lava" href="#/login?next=${enc(location.hash)}">Sign in</a><a class="btn btn-line" href="#/register?next=${enc(location.hash)}">Create an account</a></p></div>`;
  }
  function pager(pageNo, pages, base) {
    if (pages <= 1) return "";
    const nums = [];
    for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - pageNo) <= 2) nums.push(i); else if (nums[nums.length - 1] !== "\u2026") nums.push("\u2026");
    return `<nav class="pager" aria-label="Pages">${pageNo > 1 ? `<a href="${base}${pageNo - 1}" rel="prev">Newer</a>` : ""}${nums.map(n => n === "\u2026" ? "<span>\u2026</span>"
      : n === pageNo ? `<span aria-current="page">${n}</span>` : `<a href="${base}${n}">${n}</a>`).join("")}${pageNo < pages ? `<a href="${base}${pageNo + 1}" rel="next">Older</a>` : ""}</nav>`;
  }
  const crumbs = list => `<nav class="crumbs" aria-label="Breadcrumb">${list.map(([href, t]) => href ? `<a href="${href}">${esc(t)}</a>` : `<span>${esc(t)}</span>`).join('<i aria-hidden="true">/</i>')}</nav>`;
  function threadRow(t, opts = {}) {
    const unread = isNew(t);
    return `<li class="tr${t.pinned ? " tr-pin" : ""}${unread ? " tr-new" : ""}">
      <a class="tr-hit" href="#/t/${t.id}" aria-label="${esc(t.title)}"></a>
      ${head(t.user, 40, "tr-head")}
      <div class="tr-main">
        <p class="tr-title">${t.pinned ? `<span class="tr-flag" title="Pinned">${icon("i-pin")}</span>` : ""}${t.locked ? `<span class="tr-flag" title="Locked">${icon("i-lock")}</span>` : ""}<b>${esc(t.title)}</b>${unread ? '<span class="tr-dot">New</span>' : ""}</p>
        <p class="tr-meta">${opts.cat ? `<span class="chip">${esc(catOf(t.category).name)}</span>` : ""}${who(t.user, 0, { badges: false }).replace(/<img[^>]*>/, "")} \u00b7 ${when(t.created)}</p>
      </div>
      <div class="tr-side"><b>${fmt(t.replies)}</b><small>${t.replies === 1 ? "reply" : "replies"}</small></div>
      <div class="tr-last"><small>${t.last ? esc(t.last) : ""}</small>${when(t.lastAt)}</div>
    </li>`;
  }
  const seenKey = "welloby.seen";
  const lastVisit = Number(store.get(seenKey) || 0);
  store.set(seenKey, String(Date.now()));
  const isNew = t => lastVisit && t.lastAt > lastVisit && !(me() && t.user && t.user.id === me().id && t.replies === 0);
  function clanCard(c) {
    return `<li class="ccard glow" style="--cc:${COLORS[c.color] || COLORS.lava}">
      <a class="ccard-hit" href="#/c/${enc(c.tag)}" aria-label="${esc(c.name)}"></a>
      ${banner(c.banner, "bnr-m")}
      <div class="ccard-txt">
        <h3>${esc(c.name)}</h3>
        <p class="ccard-tag">[${esc(c.tag)}] \u00b7 ${plural(c.members, "member")}</p>
        ${c.motto ? `<p class="ccard-motto">\u201c${esc(c.motto)}\u201d</p>` : ""}
        <div class="ccard-foot"><span class="heads">${(c.heads || []).map(h => head(h, 26)).join("")}</span><span class="join join-${c.join}">${JOIN_NAMES[c.join]}</span></div>
      </div>
    </li>`;
  }
  function playerCard(u) {
    return `<li class="pcard glow">
      <a class="pcard-hit" href="${WC.userHref(u)}" aria-label="${esc(u.name)}"></a>
      ${head(u, 64, "pcard-head")}
      <div class="pcard-txt"><b>${esc(u.name)}</b>${u.clan ? ctag(u.clan) : ""}<span class="pcard-badges">${badges(u, true)}</span>
      ${u.ign && u.ign.toLowerCase() !== u.name.toLowerCase() ? `<small class="pcard-ign">in game ${esc(u.ign)}</small>` : ""}
      <small>${u.tags && u.tags.length ? u.tags.map(t => TAG_NAMES[t] || t).join(" \u00b7 ") : "Joined " + ago(u.created)}</small></div>
    </li>`;
  }
  const empty = (msg, extra) => `<div class="cm-empty">${icon("i-dice")}<p>${msg}</p>${extra || ""}</div>`;
  const statTiles = st => [["players", "Players"], ["clans", "Clans"], ["threads", "Threads"], ["posts", "Posts"]]
    .map(([k, l]) => `<div class="stat"><b data-count="${Number(st[k]) || 0}">${fmt(st[k])}</b><span>${l}</span></div>`).join("");
  function countUp(root) {
    if (reduced) return;
    for (const el of $$("[data-count]", root)) {
      const target = Number(el.dataset.count);
      if (!(target > 1)) continue;
      const t0 = performance.now();
      const stepFn = t => { const k = Math.min(1, (t - t0) / 900); el.textContent = fmt(target * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(stepFn); };
      requestAnimationFrame(stepFn);
    }
  }
  function burstAt(el, n = 26) {
    if (reduced || !el) return;
    const r = el.getBoundingClientRect(), colors = ["#ff6a1f", "#ff8b47", "#ffb347", "#f3ecdb", "#c2371a", "#7fae3a"];
    for (let i = 0; i < n; i++) {
      const b = document.createElement("i");
      const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 160;
      b.className = "burst";
      b.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;--bx:${(Math.cos(a) * v).toFixed(1)}px;--by:${(Math.sin(a) * v - 60).toFixed(1)}px;--s:${4 + (Math.random() * 7 | 0)}px;--c:${colors[i % colors.length]};--r:${(Math.random() - 0.5) * 720 | 0}deg`;
      document.body.append(b);
      b.addEventListener("animationend", () => b.remove(), { once: true });
    }
  }

  /* ---------- composer ---------- */
  function composer({ name = "body", value = "", label = "Your post", submit = "Post", rows = 6, draft = "" } = {}) {
    const saved = draft ? store.get("welloby.draft." + draft) || "" : "";
    const v = value || saved;
    return `<div class="cmp" data-cmp${draft ? ` data-draft="${esc(draft)}"` : ""}>
      <label class="sr-only" for="cmp-${name}">${esc(label)}</label>
      <div class="cmp-tools" role="toolbar" aria-label="Formatting">
        <button type="button" data-wrap="**" title="Bold"><b>B</b></button><button type="button" data-wrap="*" title="Italic"><i>I</i></button>
        <button type="button" data-wrap="~~" title="Strikethrough"><s>S</s></button><button type="button" data-wrap="\`" title="Code">{ }</button>
        <button type="button" data-wrap="||" title="Spoiler">Spoiler</button><button type="button" data-line="> " title="Quote">Quote</button>
        <button type="button" data-insert="x 0 z 0" title="Coordinates become a link to the 3D map">Coords</button>
        <span class="cmp-gap"></span>
        <button type="button" data-preview aria-pressed="false">Preview</button>
      </div>
      <textarea id="cmp-${name}" name="${name}" rows="${rows}" maxlength="8000" placeholder="**bold**, *italic*, > quote, ||spoiler||, @name, [TAG], x 120 z -450">${esc(v)}</textarea>
      <div class="cmp-preview post-body" hidden></div>
      <div class="cmp-foot"><small data-count>${v.length} / 8000</small><span class="cmp-hint">Ctrl + Enter to send</span><button class="btn btn-lava" type="submit">${esc(submit)}</button></div>
    </div>`;
  }
  function wireComposer() {
    on("click", "[data-cmp] [data-wrap], [data-cmp] [data-line], [data-cmp] [data-insert]", (e, b) => {
      const box = b.closest("[data-cmp]"), ta = $("textarea", box);
      const s = ta.selectionStart, en = ta.selectionEnd, sel = ta.value.slice(s, en);
      let ins, caret;
      if (b.dataset.wrap) { const w = b.dataset.wrap; ins = w + (sel || "text") + w; caret = sel ? s + ins.length : s + w.length; }
      else if (b.dataset.line) { const pre = s > 0 && ta.value[s - 1] !== "\n" ? "\n" : ""; ins = pre + (sel || "quote").split("\n").map(l => "> " + l).join("\n") + "\n"; caret = s + ins.length; }
      else { ins = b.dataset.insert; caret = s + ins.length; }
      ta.setRangeText(ins, s, en, "end");
      if (b.dataset.wrap && !sel) ta.setSelectionRange(caret, caret + 4);
      ta.focus();
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    on("click", "[data-cmp] [data-preview]", (e, b) => {
      const box = b.closest("[data-cmp]"), ta = $("textarea", box), pv = $(".cmp-preview", box);
      const onNow = b.getAttribute("aria-pressed") !== "true";
      b.setAttribute("aria-pressed", String(onNow));
      pv.innerHTML = format(ta.value) || "<p><i>Nothing to preview yet.</i></p>";
      pv.hidden = !onNow; ta.hidden = onNow;
    });
    on("input", "[data-cmp] textarea", (e, ta) => {
      const box = ta.closest("[data-cmp]");
      $("[data-count]", box).textContent = ta.value.length + " / 8000";
      if (box.dataset.draft) store.set("welloby.draft." + box.dataset.draft, ta.value);
    });
    on("keydown", "[data-cmp] textarea", (e, ta) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ta.form && ta.form.requestSubmit(); }
    });
  }
  const clearDraft = key => store.set("welloby.draft." + key, null);

  /* ======================================================== HOME */
  page(/^\/$/, async (m, q, stale) => {
    const d = await api("/hub");
    if (stale()) return;
    const u = me();
    const sup = d.support || {};
    const pct = sup.goal ? Math.min(100, (sup.total / sup.goal) * 100) : 0;
    show(`
      <section class="mast">
        <div class="mast-bg" aria-hidden="true"></div>
        <div class="wrap mast-in">
          <p class="kicker">Welloby community</p>
          <h1>${u ? "Welcome back, " + esc(u.name) : "Join the community"}</h1>
          <p class="mast-lede">Clans, players and the board. Make an account, raise a banner for your crew and tell everyone who griefed whom.</p>
          <div class="stats">${statTiles(d.stats || {})}</div>
          <p class="mast-acts">${u
            ? `<a class="btn btn-lava btn-l" href="#/new">${icon("i-plus")}Start a thread</a><a class="btn btn-line btn-l" href="${WC.userHref(u)}">${head(u, 22)}Your profile</a>`
            : `<a class="btn btn-lava btn-l" href="#/register">Create an account</a><a class="btn btn-line btn-l" href="#/login">Sign in</a>`}</p>
        </div>
      </section>
      <div class="wrap home"><div class="home-col">
        <section class="panel home-board">
          <header class="panel-h"><h2>On the board</h2><a href="#/forum">All boards ${icon("i-send")}</a></header>
          ${d.threads.length ? `<ul class="tl" data-stagger>${d.threads.map(t => threadRow(t, { cat: true })).join("")}</ul>` : empty("The board is quiet.", '<a class="btn btn-lava btn-s" href="#/new">Start the first thread</a>')}
        </section>
        <section class="panel home-faces">
          <header class="panel-h"><h2>New faces</h2><a href="#/players">Everyone ${icon("i-send")}</a></header>
          <ul class="faces" data-stagger>${d.players.map(p => `<li><a href="${WC.userHref(p)}" title="${esc(p.name)}, joined ${esc(ago(p.created))}">${head(p, 56)}<span>${esc(p.name)}</span></a></li>`).join("")}</ul>
        </section>
      </div><div class="home-col">
        <section class="panel home-clans">
          <header class="panel-h"><h2>Top clans</h2><a href="#/clans">All clans ${icon("i-send")}</a></header>
          ${d.clans.length ? `<ol class="rank" data-stagger>${d.clans.map((c, i) => `<li><a href="#/c/${enc(c.tag)}"><i class="rk">${i + 1}</i>${banner(c.banner, "bnr-s")}<span><b>${esc(c.name)}</b><small>[${esc(c.tag)}] \u00b7 ${plural(c.members, "member")}</small></span></a></li>`).join("")}</ol>`
            : empty("No clans yet.", '<a class="btn btn-lava btn-s" href="#/clans/new">Found the first one</a>')}
        </section>
        <section class="panel home-servers">
          <header class="panel-h"><h2>Top servers</h2><a href="#/servers">Server list ${icon("i-send")}</a></header>
          ${(d.servers || []).length ? `<ol class="rank" data-stagger>${d.servers.map(s => `<li><a href="#/s/${s.id}"><i class="rk">${s.featured ? "\u2605" : s.rank}</i>${srvIcon(s, 30)}<span><b>${esc(s.name)}</b><small>${plural(s.votes.month, "vote")} this month${s.status && s.status.online ? ` \u00b7 ${fmt(s.status.players || 0)} online` : ""}</small></span></a></li>`).join("")}</ol>`
            : empty("No servers listed yet.", '<a class="btn btn-lava btn-s" href="#/servers/new">Add yours</a>')}
        </section>
        <section class="panel home-diplo">
          <header class="panel-h"><h2>Wars and alliances</h2><a href="#/clans#diplomacy">The map ${icon("i-send")}</a></header>
          ${d.relations.length ? `<ul class="feed" data-stagger>${d.relations.map(r => `<li class="feed-${r.kind}">${banner(r.a.banner, "bnr-xs")}<p><a href="#/c/${enc(r.a.tag)}">${esc(r.a.name)}</a> ${r.kind === "war" ? '<b class="war">declared war on</b>' : '<b class="ally">allied with</b>'} <a href="#/c/${enc(r.b.tag)}">${esc(r.b.name)}</a><small>${ago(r.created)}</small></p>${banner(r.b.banner, "bnr-xs")}</li>`).join("")}</ul>`
            : empty("No wars declared. Yet.")}
        </section>
        <section class="panel home-sup">
          <header class="panel-h"><h2>Supporters</h2><a href="#/supporters">The wall ${icon("i-send")}</a></header>
          <div class="hgoal"><p><b>${money(sup.total || 0)}</b> of ${money(sup.goal || 0)} this month${sup.count ? ` from ${plural(sup.count, "supporter")}` : ""}</p>
          <div class="goal-track" role="progressbar" aria-label="Monthly goal" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><i style="--p:${pct.toFixed(1)}%"></i></div></div>
          <ul class="sup-mini">${(sup.recent || []).slice(0, 5).map(s => `<li>${s.user ? head(s.user, 22) : '<i class="hd hd-anon"></i>'}<b>${esc(s.name)}</b><span>${money(s.amount, s.currency)}</span></li>`).join("") || "<li>Be the first.</li>"}</ul>
        </section>
      </div></div>`, "", () => countUp(app));
  });

  /* ======================================================== BOARD */
  page(/^\/forum\/?$/, async (m, q, stale) => {
    const d = await api("/forum");
    if (stale()) return;
    CATS = d.categories.map(c => ({ id: c.id, name: c.name, about: c.about, staff: c.staff }));
    show(`
      <section class="pagehead"><div class="wrap">
        <p class="kicker">The board</p><h1>Boards</h1>
        <form class="search" role="search" data-search><label class="sr-only" for="fs">Search the board</label>
          <input id="fs" name="q" type="search" placeholder="Search threads and posts" minlength="2" maxlength="60"><button class="btn btn-ink" type="submit">${icon("i-search")}Search</button></form>
        <a class="btn btn-lava pagehead-act" href="#/new">${icon("i-plus")}New thread</a>
      </div></section>
      <div class="wrap"><ul class="cats" data-stagger>${d.categories.map(c => `
        <li class="cat glow">
          <a class="cat-hit" href="#/forum/${c.id}" aria-label="${esc(c.name)}"></a>
          <span class="cat-ico">${icon(CAT_ICON[c.id] || "i-chat")}</span>
          <div class="cat-main"><h2>${esc(c.name)}${c.staff ? ' <span class="chip">Staff posts</span>' : ""}</h2><p>${esc(c.about)}</p></div>
          <dl class="cat-n"><div><dt>Threads</dt><dd>${fmt(c.threads)}</dd></div><div><dt>Posts</dt><dd>${fmt(c.posts)}</dd></div></dl>
          <div class="cat-last">${c.latest ? `<a href="#/t/${c.latest.id}">${esc(c.latest.title)}</a><small>${c.latest.last ? esc(c.latest.last) + ", " : ""}${ago(c.latest.lastAt)}</small>` : "<small>Nothing yet</small>"}</div>
        </li>`).join("")}</ul></div>`, "Boards");
    on("submit", "[data-search]", (e, f) => { const v = f.q.value.trim(); if (v.length >= 2) go("#/search?q=" + enc(v)); });
  });

  page(/^\/forum\/([a-z]+)(?:\/(\d+))?$/, async (m, q, stale) => {
    const d = await api(`/forum/${m[1]}?page=${m[2] || 1}`);
    if (stale()) return;
    const c = d.category;
    const canPost = !c.staff || isStaff();
    show(`
      <section class="pagehead"><div class="wrap">
        ${crumbs([["#/forum", "Boards"], [null, c.name]])}
        <h1>${esc(c.name)}</h1><p class="pagehead-lede">${esc(c.about)}</p>
        ${canPost ? `<a class="btn btn-lava pagehead-act" href="#/new/${c.id}">${icon("i-plus")}New thread</a>` : ""}
      </div></section>
      <div class="wrap">
        ${d.threads.length ? `<ul class="tl tl-big" data-stagger>${d.threads.map(t => threadRow(t)).join("")}</ul>` : empty("No threads here yet.", canPost ? `<a class="btn btn-lava btn-s" href="#/new/${c.id}">Start one</a>` : "")}
        ${pager(d.page, d.pages, `#/forum/${c.id}/`)}
      </div>`, c.name);
  });

  page(/^\/search$/, async (m, q, stale) => {
    const term = (q.get("q") || "").trim();
    const d = term.length >= 2 ? await api("/search?q=" + enc(term)) : { threads: [] };
    if (stale()) return;
    show(`
      <section class="pagehead"><div class="wrap">${crumbs([["#/forum", "Boards"], [null, "Search"]])}
        <h1>Search</h1>
        <form class="search" role="search" data-search><label class="sr-only" for="fs2">Search the board</label>
          <input id="fs2" name="q" type="search" value="${esc(term)}" minlength="2" maxlength="60"><button class="btn btn-ink" type="submit">${icon("i-search")}Search</button></form>
      </div></section>
      <div class="wrap">${d.threads.length ? `<p class="muted">${plural(d.threads.length, "thread")} mention \u201c${esc(term)}\u201d.</p><ul class="tl tl-big" data-stagger>${d.threads.map(t => threadRow(t, { cat: true })).join("")}</ul>`
        : empty(term ? `Nothing matches \u201c${esc(term)}\u201d.` : "Type at least two letters.")}</div>`, "Search");
    on("submit", "[data-search]", (e, f) => { const v = f.q.value.trim(); if (v.length >= 2) go("#/search?q=" + enc(v)); });
  });

  page(/^\/new(?:\/([a-z]+))?$/, async (m, q, stale) => {
    if (stale()) return;
    const u = me();
    const cats = CATS.filter(c => !c.staff || isStaff());
    const pick = (m[1] && cats.some(c => c.id === m[1])) ? m[1] : "general";
    show(`
      <section class="pagehead"><div class="wrap">${crumbs([["#/forum", "Boards"], [null, "New thread"]])}<h1>New thread</h1></div></section>
      <div class="wrap narrow">${u ? `
        <form class="card form" data-new>
          <label class="fld"><span>Board</span><select name="category">${cats.map(c => `<option value="${c.id}"${c.id === pick ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
          <label class="fld"><span>Title</span><input name="title" maxlength="100" minlength="4" required placeholder="What's it about?" value="${esc(store.get("welloby.draft.newtitle") || "")}"></label>
          ${composer({ submit: "Post thread", rows: 10, draft: "new" })}
          ${errBox()}
        </form>` : needSignIn("to start a thread")}</div>`, "New thread");
    wireComposer();
    on("input", "[data-new] input[name=title]", (e, i) => store.set("welloby.draft.newtitle", i.value));
    on("submit", "[data-new]", (e, f) => busy($("button[type=submit]", f), async () => {
      formErr(f, "");
      try {
        const r = await api("/threads", { body: fields(f) });
        clearDraft("new"); store.set("welloby.draft.newtitle", null);
        toast("Thread posted");
        go("#/t/" + r.id);
      } catch (err) { formErr(f, err.message); }
    }));
  });

  /* ---------- a thread ---------- */
  page(/^\/t\/(\d+)(?:\/(\d+|last))?$/, async (m, q, stale) => {
    const id = m[1];
    const pq = q.get("p") ? "post=" + enc(q.get("p")) : "page=" + (m[2] || 1);
    const d = await api(`/threads/${id}?${pq}`);
    if (stale()) return;
    renderThread(d);
  });
  function renderThread(d) {
    const t = d.thread, u = me(), staff = isStaff();
    const posts = new Map(d.posts.map(p => [p.id, p]));
    const canReply = u && (!t.locked || staff) && !(u && u.banned);
    show(`
      <section class="pagehead pagehead-thread"><div class="wrap">
        ${crumbs([["#/forum", "Boards"], ["#/forum/" + t.category, t.categoryName], [null, "Thread"]])}
        <h1 data-title>${t.pinned ? `<span class="tr-flag" title="Pinned">${icon("i-pin")}</span>` : ""}${t.locked ? `<span class="tr-flag" title="Locked">${icon("i-lock")}</span>` : ""}${esc(t.title)}</h1>
        <p class="pagehead-lede">${who(t.user, 22)} started this ${when(t.created)} \u00b7 ${plural(t.replies, "reply", "replies")}</p>
        ${staff || (u && t.user && u.id === t.user.id) ? `<div class="modbar" role="group" aria-label="Thread tools">
          ${u && t.user && u.id === t.user.id || staff ? '<button type="button" class="btn btn-line btn-s" data-rename>Rename</button>' : ""}
          ${staff ? `<button type="button" class="btn btn-line btn-s" data-mod="pinned" data-v="${t.pinned ? 0 : 1}">${t.pinned ? "Unpin" : "Pin"}</button>
          <button type="button" class="btn btn-line btn-s" data-mod="locked" data-v="${t.locked ? 0 : 1}">${t.locked ? "Unlock" : "Lock"}</button>
          <label class="modmove"><span class="sr-only">Move to</span><select data-move>${CATS.map(c => `<option value="${c.id}"${c.id === t.category ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>` : ""}
          ${staff || t.replies === 0 ? '<button type="button" class="btn btn-line btn-s btn-danger" data-delthread>Delete thread</button>' : ""}
        </div>` : ""}
      </div></section>
      <div class="wrap thread">
        ${pager(d.page, d.pages, `#/t/${t.id}/`)}
        <div class="posts" data-stagger>${d.posts.map(p => postHTML(p, t, d.page)).join("")}</div>
        ${pager(d.page, d.pages, `#/t/${t.id}/`)}
        <div class="newer" data-newer hidden><button type="button" class="btn btn-ink" data-loadnew>New replies. Show them</button></div>
        ${t.locked && !staff ? `<p class="locked-note">${icon("i-lock")}This thread is locked.</p>` : canReply ? `
        <form class="card form reply" data-reply id="reply">
          <h2>Reply</h2>
          ${composer({ submit: "Post reply", draft: "t" + t.id })}
          ${errBox()}
        </form>` : u ? "" : needSignIn("to reply")}
      </div>`, t.title);
    wireComposer();
    wirePosts(t, posts, d.page);
    on("submit", "[data-reply]", (e, f) => busy($("button[type=submit]", f), async () => {
      formErr(f, "");
      try {
        const r = await api(`/threads/${t.id}/posts`, { body: { body: f.body.value } });
        clearDraft("t" + t.id);
        f.body.value = "";
        go(`#/t/${t.id}/${r.page}?p=${r.id}`);
      } catch (err) { formErr(f, err.message); }
    }));
    on("click", "[data-mod]", (e, b) => busy(b, async () => {
      try { await api(`/threads/${t.id}`, { method: "PATCH", body: { [b.dataset.mod]: b.dataset.v === "1" } }); toast("Done"); route(); }
      catch (err) { toast(err.message); }
    }));
    on("change", "[data-move]", async (e, s) => {
      try { await api(`/threads/${t.id}`, { method: "PATCH", body: { category: s.value } }); toast("Moved to " + catOf(s.value).name); route(); }
      catch (err) { toast(err.message); }
    });
    on("click", "[data-delthread]", (e, b) => twice(b, () => busy(b, async () => {
      try { await api(`/threads/${t.id}`, { method: "DELETE" }); toast("Thread deleted"); go("#/forum/" + t.category); }
      catch (err) { toast(err.message); }
    }), "Click again to delete"));
    on("click", "[data-rename]", () => {
      const h = $("[data-title]", app);
      h.innerHTML = `<form class="rename" data-renameform><label class="sr-only" for="rn">New title</label><input id="rn" name="title" value="${esc(t.title)}" maxlength="100" minlength="4" required><button class="btn btn-lava btn-s" type="submit">Save</button><button class="btn btn-line btn-s" type="button" data-cancel>Cancel</button></form>`;
      $("input", h).focus();
    });
    on("click", "[data-renameform] [data-cancel]", () => route());
    on("submit", "[data-renameform]", (e, f) => busy($("button[type=submit]", f), async () => {
      try { await api(`/threads/${t.id}`, { method: "PATCH", body: { title: f.title.value } }); route(); }
      catch (err) { toast(err.message); }
    }));
    if (d.page === d.pages) {
      let known = d.total;
      every(25000, async () => {
        try {
          const n = await api(`/threads/${t.id}?page=last`);
          if (n.total > known) { const box = $("[data-newer]", app); if (box) { box.hidden = false; $("button", box).textContent = `${plural(n.total - known, "new reply", "new replies")}. Show them`; } }
        } catch (e) { /* try again next round */ }
      });
      on("click", "[data-loadnew]", () => go(`#/t/${t.id}/last`));
    }
  }
  function postHTML(p, t, pageNo) {
    if (p.deleted) {
      return `<article class="post post-gone" id="p${p.id}"><div class="post-side">${head({ deleted: true }, 48)}</div><div class="post-main"><p class="post-removed">This post was removed.</p></div></article>`;
    }
    const u = p.user, viewer = me(), mine = viewer && u && viewer.id === u.id, staff = isStaff();
    const reacts = Object.entries(WC.REACT).map(([k, r]) => {
      const n = p.reactions[k] || 0, on_ = p.mine.includes(k);
      return `<button type="button" class="react${on_ ? " on" : ""}${n ? "" : " zero"}" data-react="${k}" aria-pressed="${on_}" aria-label="${r.label}${n ? ", " + n : ""}" title="${r.label}">${r.icon}<span>${n || ""}</span></button>`;
    }).join("");
    return `<article class="post${p.first ? " post-first" : ""}" id="p${p.id}" data-post="${p.id}">
      <aside class="post-side">
        ${u.deleted ? head(u, 64, "post-head") : `<a class="post-head" href="${WC.userHref(u)}" tabindex="-1" aria-hidden="true">${head(u, 64)}</a>`}
        ${u.deleted ? '<b class="post-name">Deleted player</b>' : `<a class="post-name" href="${WC.userHref(u)}">${esc(u.name)}</a>`}
        ${u.clan ? `<span class="post-clan">${ctag(u.clan)}<small>${ROLE_NAMES[u.clan.role] || ""}</small></span>` : ""}
        <span class="post-badges">${badges(u)}</span>
        ${u.deleted ? "" : `<small class="post-meta">${plural(u.posts || 0, "post")}<br>${plural(u.rep || 0, "reaction")}</small>`}
      </aside>
      <div class="post-main">
        <header class="post-top"><a class="post-when" href="#/t/${t.id}/${pageNo}?p=${p.id}">${when(p.created)}</a>${p.edited ? `<span class="post-edited" title="Edited ${esc(new Date(p.edited).toLocaleString("en-US"))}">edited</span>` : ""}${p.first ? '<span class="chip">Opening post</span>' : ""}</header>
        <div class="post-body" data-body>${format(p.body)}</div>
        <footer class="post-foot">
          <div class="reacts" role="group" aria-label="Reactions">${reacts}</div>
          <div class="post-acts">
            ${viewer && (!t.locked || staff) ? '<button type="button" data-quote>Quote</button>' : ""}
            ${(mine || staff) && (!t.locked || staff) ? '<button type="button" data-edit>Edit</button>' : ""}
            ${mine || staff ? '<button type="button" data-del>Delete</button>' : ""}
            ${viewer && !mine ? '<button type="button" data-report>Report</button>' : ""}
          </div>
        </footer>
      </div>
    </article>`;
  }
  function wirePosts(t, posts, pageNo) {
    const postOf = el => posts.get(Number(el.closest("[data-post]").dataset.post));
    on("click", "[data-react]", (e, b) => {
      if (!me()) { toast("Sign in to react"); return; }
      const p = postOf(b);
      busy(b, async () => {
        try {
          const r = await api(`/posts/${p.id}/react`, { body: { kind: b.dataset.react } });
          p.reactions = r.reactions; p.mine = r.mine;
          const wrap = b.closest(".reacts");
          for (const btn of $$("[data-react]", wrap)) {
            const k = btn.dataset.react, n = r.reactions[k] || 0, onNow = r.mine.includes(k);
            btn.classList.toggle("on", onNow); btn.classList.toggle("zero", !n);
            btn.setAttribute("aria-pressed", String(onNow));
            $("span", btn).textContent = n || "";
          }
          if (r.mine.includes(b.dataset.react)) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); }
        } catch (err) { toast(err.message); }
      });
    });
    on("click", "[data-quote]", (e, b) => {
      const p = postOf(b), ta = $("[data-reply] textarea", app);
      if (!ta) return;
      const lines = String(p.body).split("\n").filter(l => !/^>/.test(l)).slice(0, 8);
      const q = `> @${p.user.name} wrote:\n` + lines.map(l => "> " + l).join("\n") + "\n\n";
      ta.value = (ta.value ? ta.value.replace(/\s*$/, "\n\n") : "") + q;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      ta.scrollIntoView({ block: "center" });
      ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    });
    on("click", "[data-edit]", (e, b) => {
      const art = b.closest("[data-post]"), p = postOf(b), body = $("[data-body]", art);
      body.innerHTML = `<form class="form edit" data-editform>${composer({ name: "edit" + p.id, value: p.body, submit: "Save", rows: 6 })}<button type="button" class="btn btn-line btn-s" data-canceledit>Cancel</button>${errBox()}</form>`;
      $("textarea", body).focus();
    });
    on("click", "[data-canceledit]", (e, b) => {
      const art = b.closest("[data-post]"), p = postOf(b);
      $("[data-body]", art).innerHTML = format(p.body);
    });
    on("submit", "[data-editform]", (e, f) => busy($("button[type=submit]", f), async () => {
      const art = f.closest("[data-post]"), p = postOf(f), text = $("textarea", f).value;
      try {
        await api(`/posts/${p.id}`, { method: "PATCH", body: { body: text } });
        p.body = text;
        $("[data-body]", art).innerHTML = format(text);
        if (!$(".post-edited", art)) $(".post-top", art).insertAdjacentHTML("beforeend", '<span class="post-edited">edited</span>');
        toast("Saved");
      } catch (err) { formErr(f, err.message); }
    }));
    on("click", "[data-del]", (e, b) => twice(b, () => busy(b, async () => {
      const p = postOf(b);
      try {
        const r = await api(`/posts/${p.id}`, { method: "DELETE" });
        toast(r.thread ? "Thread deleted" : "Post deleted");
        if (r.thread) go("#/forum/" + t.category); else route();
      } catch (err) { toast(err.message); }
    }), "Really delete?"));
    on("click", "[data-report]", (e, b) => {
      const art = b.closest("[data-post]");
      if ($("[data-reportform]", art)) return;
      $(".post-main", art).insertAdjacentHTML("beforeend", `<form class="report" data-reportform><label class="fld"><span>What's wrong with this post?</span>
        <input name="reason" maxlength="300" minlength="3" required placeholder="What happened..."></label><button class="btn btn-ink btn-s" type="submit">Send to staff</button><button class="btn btn-line btn-s" type="button" data-cancelreport>Cancel</button>${errBox()}</form>`);
      $("[data-reportform] input", art).focus();
    });
    on("click", "[data-cancelreport]", (e, b) => b.closest("form").remove());
    on("submit", "[data-reportform]", (e, f) => busy($("button[type=submit]", f), async () => {
      try { await api(`/posts/${postOf(f).id}/report`, { body: { reason: f.reason.value } }); f.outerHTML = '<p class="report-done">Thanks. The staff will look at it.</p>'; }
      catch (err) { formErr(f, err.message); }
    }));
  }

  /* ======================================================== CLANS */
  page(/^\/clans\/?$/, async (m, q, stale) => {
    const sort = q.get("sort") || "members", term = q.get("q") || "", rec = q.get("recruiting") === "1";
    const d = await api(`/clans?sort=${enc(sort)}&q=${enc(term)}${rec ? "&recruiting=1" : ""}`);
    if (stale()) return;
    const u = me();
    const all = term || rec ? (await api("/clans")).clans : d.clans;
    if (stale()) return;
    show(`
      <section class="pagehead"><div class="wrap">
        <p class="kicker">Crews of Welloby</p><h1>Clans</h1>
        <p class="pagehead-lede">${plural(all.length, "clan")}. Leaders and officers accept new members and speak for the clan: allies, wars, all of it.</p>
        ${u && !u.clan ? `<a class="btn btn-lava pagehead-act" href="#/clans/new">${icon("i-plus")}Found a clan</a>` : u && u.clan ? `<a class="btn btn-line pagehead-act" href="#/c/${enc(u.clan.tag)}">${esc(u.clan.name)}</a>` : `<a class="btn btn-lava pagehead-act" href="#/register">Join to found a clan</a>`}
      </div></section>
      <div class="wrap">
        <form class="filters" data-filters>
          <label class="sr-only" for="cq">Find a clan</label><input id="cq" name="q" type="search" value="${esc(term)}" placeholder="Find a clan by name or tag">
          <label class="fld-inline"><span>Sort</span><select name="sort"><option value="members"${sort === "members" ? " selected" : ""}>Most members</option><option value="new"${sort === "new" ? " selected" : ""}>Newest</option><option value="name"${sort === "name" ? " selected" : ""}>A to Z</option></select></label>
          <label class="check"><input type="checkbox" name="recruiting" value="1"${rec ? " checked" : ""}><span>Recruiting only</span></label>
        </form>
        ${d.clans.length ? `<ul class="clans" data-stagger>${d.clans.map(clanCard).join("")}</ul>` : empty(term ? "No clan matches that." : "No clans yet. Be the first to raise a banner.")}
        <section class="panel diplo" id="diplomacy">
          <header class="panel-h"><h2>The diplomacy map</h2><p class="muted">Green lines are alliances, red lines are wars. Dashed means only one side said so. Drag the banners around.</p></header>
          <div class="diplo-map" data-diplo></div>
        </section>
      </div>`, "Clans", () => diplomacy($("[data-diplo]", app), all, d.relations));
    let t = 0;
    const apply = f => { const p = new URLSearchParams(); if (f.q.value.trim()) p.set("q", f.q.value.trim()); if (f.sort.value !== "members") p.set("sort", f.sort.value); if (f.recruiting.checked) p.set("recruiting", "1"); go("#/clans" + (p.toString() ? "?" + p : "")); };
    on("input", "[data-filters] input[name=q]", (e, i) => { clearTimeout(t); t = setTimeout(() => apply(i.form), 450); });
    on("change", "[data-filters] select, [data-filters] input[type=checkbox]", (e, i) => apply(i.form));
    on("submit", "[data-filters]", (e, f) => apply(f));
    if (location.hash.includes("#diplomacy")) setTimeout(() => { const el = $("#diplomacy"); if (el) el.scrollIntoView(); }, 50);
  });

  /* A small force layout: banners repel, alliances pull together, wars push apart a little. */
  function diplomacy(box, clans, rels) {
    if (!box) return;
    const byTag = Object.fromEntries(clans.map(c => [c.tag, c]));
    const pairs = new Map();
    for (const r of rels) {
      if (!byTag[r.src] || !byTag[r.dst]) continue;
      const k = [r.src, r.dst].sort().join("|");
      const e = pairs.get(k) || { a: [r.src, r.dst].sort()[0], b: [r.src, r.dst].sort()[1], kinds: [] };
      e.kinds.push(r.kind); pairs.set(k, e);
    }
    const edges = [...pairs.values()].map(e => ({ ...e, kind: e.kinds.includes("war") ? "war" : "ally", mutual: e.kinds.length === 2 && e.kinds[0] === e.kinds[1] }));
    const tags = [...new Set(edges.flatMap(e => [e.a, e.b]))];
    if (!tags.length) { box.innerHTML = empty("No alliances or wars on record. The first declaration goes on the map."); return; }
    const Wd = 900, H = 460;
    const nodes = tags.map((tag, i) => {
      const a = (i / tags.length) * Math.PI * 2;
      return { tag, c: byTag[tag], x: Wd / 2 + Math.cos(a) * 180, y: H / 2 + Math.sin(a) * 140, vx: 0, vy: 0 };
    });
    const N = Object.fromEntries(nodes.map(n => [n.tag, n]));
    for (let it = 0; it < 420; it++) {
      for (const a of nodes) {
        for (const b of nodes) {
          if (a === b) continue;
          const dx = a.x - b.x, dy = a.y - b.y, d2 = Math.max(dx * dx + dy * dy, 400);
          const f = 9000 / d2;
          a.vx += (dx / Math.sqrt(d2)) * f; a.vy += (dy / Math.sqrt(d2)) * f;
        }
        a.vx += (Wd / 2 - a.x) * 0.004; a.vy += (H / 2 - a.y) * 0.006;
      }
      for (const e of edges) {
        const a = N[e.a], b = N[e.b], dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        const want = e.kind === "ally" ? 150 : 250, f = (d - want) * 0.02;
        a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
      }
      for (const n of nodes) { n.x = Math.min(Wd - 50, Math.max(50, n.x + n.vx * 0.5)); n.y = Math.min(H - 60, Math.max(60, n.y + n.vy * 0.5)); n.vx *= 0.6; n.vy *= 0.6; }
    }
    box.innerHTML = `<svg viewBox="0 0 ${Wd} ${H}" role="img" aria-label="Map of clan alliances and wars">
      <defs><pattern id="dg" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="currentColor" stroke-opacity=".07"/></pattern></defs>
      <rect width="${Wd}" height="${H}" fill="url(#dg)"/>
      <g class="dl">${edges.map((e, i) => `<line data-e="${i}" class="dl-${e.kind}${e.mutual ? "" : " dl-one"}"/>`).join("")}</g>
      <g class="dn">${nodes.map(n => `<g class="dnode" data-tag="${esc(n.tag)}" tabindex="0" role="link" aria-label="${esc(n.c.name)}">
        <rect x="-26" y="-34" width="52" height="84" rx="0" class="dnode-hit"/>
        <rect x="-15" y="-31" width="30" height="3" class="dnode-pole"/>
        <image href="${WC.bannerURL(n.c.banner)}" x="-12" y="-28" width="24" height="48" preserveAspectRatio="none" style="image-rendering:pixelated"/>
        <text y="38" text-anchor="middle">${esc(n.tag)}</text></g>`).join("")}</g>
    </svg>`;
    const svg = $("svg", box);
    const draw = () => {
      edges.forEach((e, i) => { const l = $(`[data-e="${i}"]`, svg); l.setAttribute("x1", N[e.a].x); l.setAttribute("y1", N[e.a].y); l.setAttribute("x2", N[e.b].x); l.setAttribute("y2", N[e.b].y); });
      for (const g of $$(".dnode", svg)) { const n = N[g.dataset.tag]; g.setAttribute("transform", `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`); }
    };
    draw();
    let drag = null, moved = false;
    const pt = e => { const r = svg.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * Wd, y: ((e.clientY - r.top) / r.height) * H }; };
    svg.addEventListener("pointerdown", e => { const g = e.target.closest(".dnode"); if (!g) return; drag = N[g.dataset.tag]; moved = false; svg.setPointerCapture(e.pointerId); g.classList.add("drag"); });
    svg.addEventListener("pointermove", e => { if (!drag) return; const p = pt(e); if (Math.abs(p.x - drag.x) + Math.abs(p.y - drag.y) > 3) moved = true; drag.x = Math.min(Wd - 30, Math.max(30, p.x)); drag.y = Math.min(H - 40, Math.max(40, p.y)); draw(); });
    svg.addEventListener("pointerup", () => { if (!drag) return; const tag = drag.tag; $$(".dnode.drag", svg).forEach(g => g.classList.remove("drag")); drag = null; if (!moved) go("#/c/" + enc(tag)); });
    svg.addEventListener("keydown", e => { const g = e.target.closest(".dnode"); if (g && e.key === "Enter") go("#/c/" + enc(g.dataset.tag)); });
  }

  page(/^\/c\/([A-Za-z0-9]{2,5})\/?$/, async (m, q, stale) => {
    const d = await api("/clans/" + enc(m[1]));
    if (stale()) return;
    renderClan(d);
  });
  function renderClan(d) {
    const c = d.clan, my = d.my, u = me();
    const officer = my && my.member && (my.role === "leader" || my.role === "officer"), leader = my && my.role === "leader";
    let act = "";
    if (!u) act = `<a class="btn btn-lava btn-l" href="#/login?next=${enc(location.hash)}">Sign in to join</a>`;
    else if (my.member) act = `<a class="btn btn-lava btn-l" href="#/messages/clan">${icon("i-chat")}Clan chat</a>${officer ? `<a class="btn btn-line btn-l" href="#/c/${enc(c.tag)}/edit">${icon("i-edit")}Edit clan</a>` : ""}<button type="button" class="btn btn-line btn-l" data-leave>${leader ? "Leave" : "Leave clan"}</button>${leader ? '<button type="button" class="btn btn-line btn-l btn-danger" data-disband>Disband</button>' : ""}`;
    else if (my.inClan) act = `<p class="muted">You're in another clan.</p>`;
    else if (c.join === "open") act = `<button type="button" class="btn btn-lava btn-l" data-join>${icon("i-plus")}Join ${esc(c.name)}</button>`;
    else if (c.join === "request") act = my.requested ? `<p class="req-sent">${icon("i-check")}Request sent. The leader or an officer will answer.</p><button type="button" class="btn btn-line btn-s" data-cancelreq>Cancel request</button>`
      : `<form class="ask" data-ask><label class="fld"><span>Ask to join</span><input name="message" maxlength="300" placeholder="Say who you are and what you bring"></label><button class="btn btn-lava" type="submit">Send request</button>${errBox()}</form>`;
    else act = '<p class="muted">This clan isn\u2019t taking new members right now.</p>';
    if (my && my.staff && !leader) act += '<button type="button" class="btn btn-line btn-s btn-danger staff-x" data-staffremove>Remove clan (staff)</button>';
    const rel = d.relations;
    const out = rel.filter(r => r.dir === "out"), inc = rel.filter(r => r.dir === "in");
    const relItem = r => `<li class="rel rel-${r.kind}">${banner(r.clan.banner, "bnr-xs")}<p><a href="#/c/${enc(r.clan.tag)}">${esc(r.clan.name)}</a><small>${r.kind === "war" ? (r.dir === "out" ? "At war with them" : "They declared war") : (r.dir === "out" ? "Our ally" : "Calls us an ally")} \u00b7 ${ago(r.created)}</small></p>${officer && r.dir === "out" ? `<button type="button" class="link" data-unrel="${esc(r.clan.tag)}">Drop</button>` : ""}</li>`;
    show(`
      <section class="clanhero" style="--cc:${COLORS[c.color] || COLORS.lava}">
        <div class="clanhero-bg" aria-hidden="true"></div>
        <div class="wrap clanhero-in">
          <div class="clanhero-flag">${banner(c.banner, "bnr-xl", c.name + " banner")}</div>
          <div class="clanhero-id">
            ${crumbs([["#/clans", "Clans"], [null, c.tag]])}
            <h1>${esc(c.name)} <span class="tagbig">[${esc(c.tag)}]</span></h1>
            ${c.motto ? `<p class="motto">\u201c${esc(c.motto)}\u201d</p>` : ""}
            <ul class="clanfacts"><li><b>${fmt(c.members)}</b> ${c.members === 1 ? "member" : "members"}</li><li>Led by ${c.leader ? `<a href="#/u/${enc(c.leader)}">${esc(c.leader)}</a>` : "nobody"}</li><li>Founded ${when(c.created)}</li><li class="join join-${c.join}">${JOIN_NAMES[c.join]}</li></ul>
            <div class="clanacts">${act}</div>
          </div>
        </div>
      </section>
      <div class="wrap clanbody">
        <div class="clanmain">
          <section class="panel"><header class="panel-h"><h2>About</h2></header><div class="post-body">${c.about ? format(c.about) : '<p class="muted">The leader hasn\u2019t written anything yet.</p>'}</div></section>
          <section class="panel"><header class="panel-h"><h2>Members</h2><span class="muted">${plural(d.members.length, "player")}</span></header>
            <ul class="roster" data-stagger>${d.members.map(p => `<li data-member="${esc(p.name)}">
              <a href="${WC.userHref(p)}">${head(p, 44)}</a>
              <div><a class="roster-name" href="${WC.userHref(p)}">${esc(p.name)}</a>${badges(p, true)}<small><b class="role role-${p.clan && p.clan.role}">${ROLE_NAMES[p.clan && p.clan.role] || ""}</b> \u00b7 joined ${ago(p.joined)}</small></div>
              ${officer && u && p.id !== u.id && p.clan.role !== "leader" ? `<div class="roster-acts">
                ${leader ? (p.clan.role === "officer" ? '<button type="button" class="link" data-member-act="demote">Demote</button>' : '<button type="button" class="link" data-member-act="promote">Make officer</button>') : ""}
                ${leader ? '<button type="button" class="link" data-member-act="transfer">Hand over</button>' : ""}
                ${leader || p.clan.role === "member" ? '<button type="button" class="link danger" data-member-act="kick">Remove</button>' : ""}
              </div>` : ""}
            </li>`).join("")}</ul></section>
        </div>
        <aside class="clanside">
          ${d.requests ? `<section class="panel panel-hot"><header class="panel-h"><h2>Requests</h2><span class="count">${d.requests.length}</span></header>
            ${d.requests.length ? `<ul class="reqs">${d.requests.map(r => `<li data-req="${esc(r.user.name)}">${head(r.user, 36)}<div><a href="${WC.userHref(r.user)}"><b>${esc(r.user.name)}</b></a><small>${ago(r.created)}</small>${r.message ? `<q>${esc(r.message)}</q>` : ""}</div>
              <div class="req-acts"><button type="button" class="btn btn-lava btn-s" data-decide="1">Accept</button><button type="button" class="btn btn-line btn-s" data-decide="0">Turn down</button></div></li>`).join("")}</ul>`
              : '<p class="muted">Nobody is waiting.</p>'}</section>` : ""}
          <section class="panel"><header class="panel-h"><h2>Diplomacy</h2></header>
            ${out.length ? `<h3 class="mini">${esc(c.tag)} says</h3><ul class="rels">${out.map(relItem).join("")}</ul>` : ""}
            ${inc.length ? `<h3 class="mini">Others say</h3><ul class="rels">${inc.map(relItem).join("")}</ul>` : ""}
            ${!rel.length ? '<p class="muted">No allies, no enemies. Suspicious.</p>' : ""}
            ${officer ? `<form class="relform" data-relform><h3 class="mini">Declare</h3>
              <label class="fld"><span>Clan tag</span><input name="other" maxlength="5" required placeholder="TAG" autocapitalize="characters"></label>
              <div class="radios" role="radiogroup" aria-label="Relation"><label><input type="radio" name="kind" value="ally" checked><span>Ally</span></label><label><input type="radio" name="kind" value="war"><span>War</span></label></div>
              <button class="btn btn-ink btn-s" type="submit">Declare</button>${errBox()}</form>` : ""}
          </section>
        </aside>
      </div>`, c.name);
    const reload = () => route();
    on("click", "[data-join]", (e, b) => busy(b, async () => { try { await api(`/clans/${enc(c.tag)}/join`, { body: {} }); toast("Welcome to " + c.name); burstAt(b); await WC.refreshMe(); reload(); } catch (err) { toast(err.message); } }));
    on("submit", "[data-ask]", (e, f) => busy($("button", f), async () => { try { await api(`/clans/${enc(c.tag)}/join`, { body: { message: f.message.value } }); toast("Request sent"); reload(); } catch (err) { formErr(f, err.message); } }));
    on("click", "[data-cancelreq]", (e, b) => busy(b, async () => { try { await api(`/clans/${enc(c.tag)}/join`, { method: "DELETE" }); reload(); } catch (err) { toast(err.message); } }));
    on("click", "[data-leave]", (e, b) => twice(b, () => busy(b, async () => {
      try { const r = await api(`/clans/${enc(c.tag)}/leave`, { body: {} }); toast(r.disbanded ? "The clan is disbanded" : "You left " + c.name); await WC.refreshMe(); go(r.disbanded ? "#/clans" : location.hash); }
      catch (err) { toast(err.message); }
    }), "Click again to leave"));
    on("click", "[data-disband], [data-staffremove]", (e, b) => twice(b, () => busy(b, async () => {
      try { await api(`/clans/${enc(c.tag)}`, { method: "DELETE" }); toast(c.name + " is gone"); await WC.refreshMe(); go("#/clans"); }
      catch (err) { toast(err.message); }
    }), "Click again to disband"));
    on("click", "[data-decide]", (e, b) => busy(b, async () => {
      const name = b.closest("[data-req]").dataset.req;
      try { await api(`/clans/${enc(c.tag)}/requests/${enc(name)}`, { body: { accept: b.dataset.decide === "1" } }); toast(b.dataset.decide === "1" ? name + " is in" : "Request turned down"); await WC.refreshMe(); reload(); }
      catch (err) { toast(err.message); }
    }));
    on("click", "[data-member-act]", (e, b) => {
      const name = b.closest("[data-member]").dataset.member, action = b.dataset.memberAct;
      const run = () => busy(b, async () => {
        try { await api(`/clans/${enc(c.tag)}/members/${enc(name)}`, { body: { action } }); toast({ promote: name + " is an officer", demote: name + " is a member again", kick: name + " was removed", transfer: name + " leads the clan now" }[action]); await WC.refreshMe(); reload(); }
        catch (err) { toast(err.message); }
      });
      if (action === "kick" || action === "transfer") twice(b, run, action === "kick" ? "Remove?" : "Hand over?"); else run();
    });
    on("submit", "[data-relform]", (e, f) => busy($("button", f), async () => {
      try { await api(`/clans/${enc(c.tag)}/relations`, { method: "PUT", body: { other: f.other.value.trim(), kind: f.kind.value } }); toast(f.kind.value === "war" ? "War declared" : "Alliance declared"); reload(); }
      catch (err) { formErr(f, err.message); }
    }));
    on("click", "[data-unrel]", (e, b) => busy(b, async () => {
      try { await api(`/clans/${enc(c.tag)}/relations`, { method: "PUT", body: { other: b.dataset.unrel, kind: "" } }); reload(); } catch (err) { toast(err.message); }
    }));
  }

  /* ---------- found or edit a clan, with the banner designer ---------- */
  page(/^\/clans\/new$|^\/c\/([A-Za-z0-9]{2,5})\/edit$/, async (m, q, stale) => {
    const editing = !!m[1];
    let c = null;
    if (editing) { c = (await api("/clans/" + enc(m[1]))).clan; if (stale()) return; }
    const u = me();
    if (!u) { show(`<section class="pagehead"><div class="wrap"><h1>${editing ? "Edit clan" : "Found a clan"}</h1></div></section><div class="wrap narrow">${needSignIn("to found a clan")}</div>`, "Found a clan"); return; }
    if (editing && !(u.clan && u.clan.tag === c.tag && (u.clan.role === "leader" || u.clan.role === "officer"))) {
      show(`<section class="pagehead"><div class="wrap"><h1>Edit ${esc(c.name)}</h1></div></section><div class="wrap narrow">${empty("Only the leader and officers of " + esc(c.name) + " can change it.", `<a class="btn btn-line btn-s" href="#/c/${enc(c.tag)}">Back to the clan</a>`)}</div>`, "Edit clan");
      return;
    }
    if (!editing && u.clan) { show(`<section class="pagehead"><div class="wrap"><h1>Found a clan</h1></div></section><div class="wrap narrow">${empty("You're already in " + esc(u.clan.name) + ". Leave it first to found your own.", `<a class="btn btn-line btn-s" href="#/c/${enc(u.clan.tag)}">Go to your clan</a>`)}</div>`, "Found a clan"); return; }
    const state = WC.parseBanner(c ? c.banner : WC.randomBanner(WC.hash32(u.name)));
    let color = c ? c.color : "lava", selLayer = state.layers.length ? 0 : -1;
    const leader = !editing || (u.clan && u.clan.tag === c.tag && u.clan.role === "leader");
    const sw = (name, val, cur, label) => Object.entries(COLORS).map(([k, hex]) => `<label class="sw" title="${k}"><input type="radio" name="${name}" value="${k}"${k === cur ? " checked" : ""}><i style="background:${hex}"></i><span class="sr-only">${label} ${k}</span></label>`).join("");
    show(`
      <section class="pagehead"><div class="wrap">${crumbs(editing ? [["#/clans", "Clans"], ["#/c/" + enc(c.tag), c.tag], [null, "Edit"]] : [["#/clans", "Clans"], [null, "Found a clan"]])}<h1>${editing ? "Edit " + esc(c.name) : "Found a clan"}</h1>
        <p class="pagehead-lede">${editing ? "Officers can change the banner and the words. Only the leader can rename the clan." : "You become its leader. You can be in one clan at a time."}</p></div></section>
      <div class="wrap">
        <form class="clanform" data-clanform>
          <div class="designer card">
            <div class="designer-stage"><div class="designer-flag" data-flag></div><button type="button" class="btn btn-line btn-s" data-random>${icon("i-dice")}Surprise me</button></div>
            <div class="designer-tools">
              <fieldset><legend>Cloth</legend><div class="sws" data-base>${sw("base", "", state.base, "Cloth color")}</div></fieldset>
              <fieldset><legend>Layers <small>painted from the top of the list down, up to six</small></legend>
                <ol class="layers" data-layers></ol>
                <button type="button" class="btn btn-ink btn-s" data-addlayer>${icon("i-plus")}Add a layer</button>
              </fieldset>
              <fieldset class="layeredit" data-layeredit><legend>Pattern for the selected layer</legend><div class="pats" data-pats></div><div class="sws" data-layercolor></div></fieldset>
            </div>
          </div>
          <div class="card form">
            <div class="grid2">
              <label class="fld"><span>Clan name</span><input name="name" maxlength="24" minlength="3" required value="${esc(c ? c.name : "")}"${leader ? "" : " disabled"}></label>
              <label class="fld"><span>Tag <small>2 to 5 letters or numbers</small></span><input name="tag" maxlength="5" minlength="2" required pattern="[A-Za-z0-9]{2,5}" value="${esc(c ? c.tag : "")}" autocapitalize="characters"${leader ? "" : " disabled"}></label>
            </div>
            <fieldset class="fld"><legend>Clan color <small>used for your tag everywhere</small></legend><div class="sws">${sw("color", "", color, "Clan color")}</div></fieldset>
            <label class="fld"><span>Motto <small>optional</small></span><input name="motto" maxlength="80" value="${esc(c ? c.motto : "")}" placeholder="Something worth shouting"></label>
            <label class="fld"><span>About <small>optional, formatting works</small></span><textarea name="about" rows="5" maxlength="1500" placeholder="Who you are, what you build, who you hate">${esc(c ? c.about : "")}</textarea></label>
            <fieldset class="fld"><legend>How people join</legend><div class="radios" role="radiogroup">
              ${["request", "open", "closed"].map(k => `<label><input type="radio" name="join" value="${k}"${(c ? c.join : "request") === k ? " checked" : ""}><span>${JOIN_NAMES[k]}</span></label>`).join("")}</div></fieldset>
            ${errBox()}
            <p class="form-acts"><button class="btn btn-lava btn-l" type="submit">${editing ? "Save" : "Raise the banner"}</button>${editing ? `<a class="btn btn-line btn-l" href="#/c/${enc(c.tag)}">Cancel</a>` : ""}</p>
          </div>
        </form>
      </div>`, editing ? "Edit clan" : "Found a clan", () => paintDesigner());
    function paintDesigner() {
      const spec = WC.bannerSpec(state);
      $("[data-flag]", app).innerHTML = banner(spec, "bnr-xl", "Your banner");
      $("[data-layers]", app).innerHTML = state.layers.map((l, i) => `<li class="${i === selLayer ? "sel" : ""}" data-li="${i}">
        <button type="button" class="layer-pick" data-sel="${i}" aria-pressed="${i === selLayer}">${banner(WC.bannerSpec({ base: state.base, layers: [l] }), "bnr-xs")}<span>${esc(WC.PATTERN_NAMES[l.p] || l.p)}</span><i style="background:${COLORS[l.c]}"></i></button>
        <span class="layer-acts"><button type="button" data-up="${i}" aria-label="Move up"${i ? "" : " disabled"}>\u2191</button><button type="button" data-down="${i}" aria-label="Move down"${i < state.layers.length - 1 ? "" : " disabled"}>\u2193</button><button type="button" data-rm="${i}" aria-label="Remove layer">\u00d7</button></span></li>`).join("")
        || '<li class="muted">Plain cloth. Add a layer.</li>';
      $("[data-addlayer]", app).disabled = state.layers.length >= 6;
      const ed = $("[data-layeredit]", app);
      ed.hidden = selLayer < 0;
      if (selLayer >= 0) {
        const l = state.layers[selLayer];
        $("[data-pats]", app).innerHTML = WC.PATTERNS.map(p => `<button type="button" class="pat${p === l.p ? " on" : ""}" data-pat="${p}" title="${esc(WC.PATTERN_NAMES[p])}" aria-pressed="${p === l.p}">${banner(WC.bannerSpec({ base: state.base, layers: [{ p, c: l.c }] }), "bnr-xs")}<span class="sr-only">${esc(WC.PATTERN_NAMES[p])}</span></button>`).join("");
        $("[data-layercolor]", app).innerHTML = Object.entries(COLORS).map(([k, hex]) => `<label class="sw" title="${k}"><input type="radio" name="layercolor" value="${k}"${k === l.c ? " checked" : ""}><i style="background:${hex}"></i><span class="sr-only">Layer color ${k}</span></label>`).join("");
      }
    }
    on("change", "[data-base] input", (e, i) => { state.base = i.value; paintDesigner(); });
    on("change", "[data-layercolor] input", (e, i) => { if (selLayer >= 0) { state.layers[selLayer].c = i.value; paintDesigner(); } });
    on("click", "[data-pat]", (e, b) => { if (selLayer >= 0) { state.layers[selLayer].p = b.dataset.pat; paintDesigner(); } });
    on("click", "[data-sel]", (e, b) => { selLayer = Number(b.dataset.sel); paintDesigner(); });
    on("click", "[data-addlayer]", () => {
      if (state.layers.length >= 6) return;
      const keys = Object.keys(COLORS).filter(k => k !== state.base);
      state.layers.push({ p: WC.PATTERNS[(Math.random() * WC.PATTERNS.length) | 0], c: keys[(Math.random() * keys.length) | 0] });
      selLayer = state.layers.length - 1; paintDesigner();
    });
    on("click", "[data-up], [data-down]", (e, b) => {
      const i = Number(b.dataset.up ?? b.dataset.down), j = b.dataset.up !== undefined ? i - 1 : i + 1;
      if (j < 0 || j >= state.layers.length) return;
      [state.layers[i], state.layers[j]] = [state.layers[j], state.layers[i]]; selLayer = j; paintDesigner();
    });
    on("click", "[data-rm]", (e, b) => { state.layers.splice(Number(b.dataset.rm), 1); selLayer = Math.min(selLayer, state.layers.length - 1); paintDesigner(); });
    on("click", "[data-random]", () => { Object.assign(state, WC.parseBanner(WC.randomBanner())); selLayer = state.layers.length ? 0 : -1; paintDesigner(); });
    on("input", "[data-clanform] input[name=tag]", (e, i) => { const p = i.selectionStart; i.value = i.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); i.setSelectionRange(p, p); });
    on("submit", "[data-clanform]", (e, f) => busy($("button[type=submit]", f), async () => {
      formErr(f, "");
      const b = { banner: WC.bannerSpec(state), color: f.color.value, motto: f.motto.value, about: f.about.value, join: f.join.value };
      if (leader) { b.name = f.name.value; b.tag = f.tag.value; }
      try {
        const r = editing ? await api("/clans/" + enc(c.tag), { method: "PATCH", body: b }) : await api("/clans", { body: b });
        await WC.refreshMe();
        toast(editing ? "Saved" : "Your banner is up");
        go("#/c/" + enc(r.tag));
        if (!editing) setTimeout(() => burstAt($(".clanhero-flag")), 500);
      } catch (err) { formErr(f, err.message); }
    }));
  });

  /* ======================================================== SERVER LIST */
  const STAG = { anarchy: "Anarchy", survival: "Survival", smp: "SMP", pvp: "PvP", factions: "Factions", skyblock: "Skyblock", creative: "Creative",
    minigames: "Minigames", prison: "Prison", hardcore: "Hardcore", cracked: "Cracked", modded: "Modded", rpg: "RPG", towny: "Towny", lifesteal: "Lifesteal",
    economy: "Economy", vanilla: "Vanilla", bedrock: "Bedrock" };
  const REGION = { europe: "Europe", "north-america": "North America", "south-america": "South America", asia: "Asia", oceania: "Oceania", africa: "Africa", global: "Worldwide" };
  const EDITION = { java: "Java", bedrock: "Bedrock", both: "Java and Bedrock" };
  const javaAddr = s => (s.port === 25565 ? s.host : s.host + ":" + s.port);
  function srvIcon(s, size, cls) {
    const src = s.icon ? `${WC.API}/servers/${s.id}/icon?d=${Math.floor(((s.status && s.status.at) || 0) / 864e5)}` : WC.bannerURL(WC.randomBanner(WC.hash32(s.name)));
    return `<img class="sicon${s.icon ? "" : " sicon-gen"}${cls ? " " + cls : ""}" src="${src}" width="${size}" height="${size}" alt="" loading="lazy" decoding="async">`;
  }
  function liveBits(s) {
    const st = s.status;
    if (!st) return '<i class="lamp" data-state="loading"></i><b>\u2026</b><small>checking</small>';
    if (!st.online) return '<i class="lamp" data-state="offline"></i><b>Offline</b><small>right now</small>';
    /* some servers report a fake maximum (Welloby says 1), so only show "of max" when it makes sense */
    const of = st.max && st.max >= (st.players || 0) ? `of ${fmt(st.max)} online` : "online";
    return `<i class="lamp" data-state="online"></i><b>${fmt(st.players || 0)}</b><small>${of}</small>`;
  }
  function serverRow(s) {
    const addr = s.edition === "bedrock" ? s.host : javaAddr(s);
    return `<li class="srow${s.featured ? " srow-feat" : ""}" style="--cc:${COLORS[s.color] || COLORS.lava}" data-votebox>
      <a class="srow-hit" href="#/s/${s.id}" aria-label="${esc(s.name)}"></a>
      <span class="srow-rank">${s.featured ? '<span title="Featured">\u2605</span>' : "#" + s.rank}</span>
      ${srvIcon(s, 64)}
      <div class="srow-main">
        <h3>${esc(s.name)}${s.verified ? '<span class="bdg bdg-ver" title="The owner proved this server is theirs">\u2713</span>' : ""}${s.featured ? '<span class="chip chip-feat">Featured</span>' : ""}</h3>
        <p class="srow-short">${esc(s.short)}</p>
        <p class="srow-meta"><button type="button" class="addr" data-copy="${esc(addr)}" title="Copy the address">${icon("i-copy")}${esc(addr)}</button>${s.edition === "bedrock" ? `<span class="chip">Bedrock, port ${s.port}</span>` : s.bedrock ? '<span class="chip">+ Bedrock</span>' : ""}${s.version ? `<span class="chip">${esc(s.version)}</span>` : ""}${s.tags.slice(0, 3).map(t => `<span class="chip">${esc(STAG[t] || t)}</span>`).join("")}</p>
      </div>
      <div class="srow-live">${liveBits(s)}</div>
      <div class="srow-vote"><b data-vcount>${fmt(s.votes.month)}</b><small>${s.votes.month === 1 ? "vote" : "votes"}</small><button type="button" class="btn btn-lava btn-s${s.voted ? " voted" : ""}" data-vote="${s.id}"${s.voted ? ' disabled title="You voted for this server today"' : ""}>${s.voted ? "Voted" : "Vote"}</button></div>
    </li>`;
  }
  async function castVote(btn) {
    if (!me()) { toast("Sign in to vote."); go("#/login?next=" + enc(location.hash)); return; }
    if (btn.disabled) return;
    btn.disabled = true;
    const label = btn.textContent;
    btn.classList.add("is-busy");
    try {
      const r = await api(`/servers/${btn.dataset.vote}/vote`, { body: {} });
      burstAt(btn, 30);
      const box = btn.closest("[data-votebox]");
      if (box) for (const n of $$("[data-vcount]", box)) n.textContent = fmt(r.votes.month);
      btn.textContent = "Voted";
      btn.classList.add("voted");
      toast(r.reward ? "Vote counted. Your reward is on its way in game." : r.needIgn ? "Vote counted. Add your in-game name in Settings to get the reward in game." : "Vote counted. Thanks!");
    } catch (err) {
      toast(err.message);
      if (err.code === "voted") { btn.textContent = "Voted"; btn.classList.add("voted"); } else { btn.disabled = false; btn.textContent = label; }
    } finally { btn.classList.remove("is-busy"); }
  }

  page(/^\/servers\/?$/, async (m, q, stale) => {
    const sort = q.get("sort") || "votes", tag = q.get("tag") || "", term = q.get("q") || "", ed = q.get("edition") || "", pg = Number(q.get("page")) || 1;
    const d = await api(`/servers?sort=${enc(sort)}&tag=${enc(tag)}&q=${enc(term)}&edition=${enc(ed)}&page=${pg}`);
    if (stale()) return;
    const link = over => {
      const v = { q: term, tag, edition: ed, sort: sort === "votes" ? "" : sort, ...over }, p = new URLSearchParams();
      for (const [k, val] of Object.entries(v)) if (val) p.set(k, val);
      return "#/servers" + (p.toString() ? "?" + p : "");
    };
    const monthName = new Date(d.month + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
    const pageBase = link({ page: "" }) + (link({ page: "" }).includes("?") ? "&" : "?") + "page=";
    show(`
      <section class="pagehead pagehead-servers"><div class="wrap">
        <p class="kicker">Vote once a day</p><h1>Server list</h1>
        <p class="pagehead-lede">Minecraft servers, ranked by players' votes. Vote for your favourites once a day; the ranking starts again every month. Running a server? List it for free, prove it's yours, and reward voters in game through NuVotifier.</p>
        <a class="btn btn-lava pagehead-act" href="#/servers/new">${icon("i-plus")}Add your server</a>
      </div></section>
      <div class="wrap">
        <form class="filters" data-sfilters>
          <label class="sr-only" for="sq">Find a server</label><input id="sq" name="q" type="search" value="${esc(term)}" placeholder="Find a server by name or address">
          <label class="fld-inline"><span>Sort</span><select name="sort"><option value="votes">Votes in ${esc(monthName)}</option><option value="players"${sort === "players" ? " selected" : ""}>Players online</option><option value="new"${sort === "new" ? " selected" : ""}>Newest</option></select></label>
          <label class="fld-inline"><span>Edition</span><select name="edition"><option value="">Java and Bedrock</option><option value="java"${ed === "java" ? " selected" : ""}>Java</option><option value="bedrock"${ed === "bedrock" ? " selected" : ""}>Bedrock</option></select></label>
        </form>
        <nav class="tagbar" aria-label="Filter by tag"><a href="${link({ tag: "", page: "" })}"${!tag ? ' aria-current="true"' : ""}>All</a>${d.tags.map(t => `<a href="${link({ tag: t, page: "" })}"${tag === t ? ' aria-current="true"' : ""}>${esc(STAG[t] || t)}</a>`).join("")}</nav>
        ${d.servers.length ? `<ol class="slist" data-stagger>${d.servers.map(serverRow).join("")}</ol>`
          : empty(term || tag || ed ? "No server matches that." : "No servers yet. Be the first on the list.", '<a class="btn btn-lava btn-s" href="#/servers/new">Add your server</a>')}
        ${pager(d.page, d.pages, pageBase)}
        <p class="fine slist-note">One vote per player and per network every 24 hours. Votes reset on the 1st of each month. Status comes from api.mcstatus.io and refreshes every few minutes.</p>
      </div>`, "Server list");
    let t = 0;
    const apply = f => go(link({ q: f.q.value.trim(), sort: f.sort.value === "votes" ? "" : f.sort.value, edition: f.edition.value, page: "" }));
    on("input", "[data-sfilters] input[name=q]", (e, i) => { clearTimeout(t); t = setTimeout(() => apply(i.form), 450); });
    on("change", "[data-sfilters] select", (e, s) => apply(s.form));
    on("submit", "[data-sfilters]", (e, f) => apply(f));
    on("click", "[data-vote]", (e, b) => castVote(b));
  });

  page(/^\/s\/(\d+)\/?$/, async (m, q, stale) => {
    const d = await api("/servers/" + m[1]);
    if (stale()) return;
    renderServer(d);
  });
  function renderServer(d) {
    const s = d.server, my = d.my, st = s.status, mg = d.manage;
    const addr = s.edition === "bedrock" ? s.host : javaAddr(s);
    const voted = my.nextVoteAt && my.nextVoteAt > Date.now();
    const canClaim = my.signedIn && !my.owner;
    const verifyPanel = (my.owner && !s.verified) || canClaim ? `<section class="panel" data-verifypanel>
        <header class="panel-h"><h2>${my.owner ? "Verify your server" : "Is this your server?"}</h2></header>
        <p class="fine">${my.owner ? "Prove it's yours: verified servers get a check mark and can reward voters in game." : "Prove it and the listing moves to your account, votes included."}</p>
        ${my.verifyCode ? `<ol class="steps-mini">
            <li>Put this code anywhere in the server's MOTD (<code>motd=</code> in server.properties): <button type="button" class="vcode" data-copy="${esc(my.verifyCode)}">${esc(my.verifyCode)}</button></li>
            <li>Reload or restart so the MOTD changes, then wait a minute.</li>
            <li><button type="button" class="btn btn-lava btn-s" data-vcheck>Check now</button></li></ol>
          <p class="fine">Take the code out again once you're verified.</p>`
          : '<p><button type="button" class="btn btn-ink btn-s" data-vstart>Get a verification code</button></p>'}
        ${errBox()}</section>` : "";
    const votifierPanel = mg && s.verified && (my.owner || me().role === "admin") ? `<form class="card form" data-votifier>
        <h2>Vote rewards</h2>
        <p class="fine">Install <b>NuVotifier</b> and a vote plugin. Every vote here goes to it with the service name <code>Welloby</code> and the voter's in-game name, and your plugin hands out the reward.</p>
        <div class="grid2">
          <label class="fld"><span>Votifier port</span><input name="port" type="number" min="1" max="65535" value="${mg.votifierPort || 8192}"></label>
          <label class="fld"><span>Token <small>from NuVotifier's config.yml</small></span><input name="token" type="password" autocomplete="off" placeholder="${mg.votifierSet ? "Saved. Paste a new one to change it" : "Paste the token"}"></label>
        </div>
        <p class="form-acts"><button class="btn btn-lava" type="submit">Save</button><button type="button" class="btn btn-line" data-vtest${mg.votifierSet ? "" : " disabled"}>Send a test vote</button>${mg.votifierSet ? '<button type="button" class="link danger" data-voff>Turn off</button>' : ""}</p>
        ${mg.votifierLast ? `<p class="vlast ${/^ok/.test(mg.votifierLast) ? "good" : "bad"}">Last vote sent: ${esc(mg.votifierLast)}${mg.votifierAt ? " \u00b7 " + ago(mg.votifierAt) : ""}</p>` : ""}
        ${errBox()}</form>` : "";
    show(`
      <section class="shero" style="--cc:${COLORS[s.color] || COLORS.lava}" data-votebox>
        <div class="clanhero-bg" aria-hidden="true"></div>
        <div class="wrap shero-in">
          <div class="shero-icon">${srvIcon(s, 128, "sicon-xl")}</div>
          <div class="shero-id">
            ${crumbs([["#/servers", "Server list"], [null, s.name]])}
            <h1>${esc(s.name)}</h1>
            <p class="motto">${esc(s.short)}</p>
            <div class="saddr">
              <button type="button" class="addr addr-big" data-copy="${esc(addr)}">${icon("i-copy")}<span>${s.edition === "bedrock" ? "Bedrock" : "Java"}</span><b>${esc(addr)}</b></button>
              ${s.bedrock && s.edition !== "bedrock" ? `<button type="button" class="addr addr-big" data-copy="${esc(s.bedrock.host)}">${icon("i-copy")}<span>Bedrock</span><b>${esc(s.bedrock.host)}</b><small>port ${s.bedrock.port}</small></button>` : ""}
              ${s.edition === "bedrock" ? `<span class="chip">Port ${s.port}</span>` : ""}
            </div>
            <ul class="clanfacts">
              <li class="slive">${liveBits(s)}</li>
              ${st && st.version ? `<li>${esc(st.version)}</li>` : s.version ? `<li>${esc(s.version)}</li>` : ""}
              <li>${esc(EDITION[s.edition] || s.edition)}</li>
              ${s.region ? `<li>${esc(REGION[s.region] || s.region)}</li>` : ""}
              ${s.verified ? '<li class="good">\u2713 Verified owner</li>' : '<li class="muted">Not verified</li>'}
              ${s.featured ? '<li class="join join-request">Featured</li>' : ""}
            </ul>
          </div>
          <div class="svote">
            <p class="svote-rank">#${d.rank}<small>this month</small></p>
            <p class="svote-n"><b data-vcount>${fmt(s.votes.month)}</b> votes this month<small>${fmt(s.votes.total)} in total</small></p>
            <button type="button" class="btn btn-lava btn-l" data-vote="${s.id}"${voted ? " disabled" : ""}>${voted ? "Voted" : `${icon("i-heart")}Vote`}</button>
            <p class="fine">${voted ? `You can vote again in ${plural(Math.max(1, Math.ceil((my.nextVoteAt - Date.now()) / 36e5)), "hour")}.`
              : my.signedIn ? `The vote counts for <b>${esc(me().name)}</b>${s.votifier ? " and pays out in game." : "."}` : "Sign in to vote. One vote a day."}</p>
          </div>
        </div>
      </section>
      <div class="wrap clanbody">
        <div class="clanmain">
          <section class="panel"><header class="panel-h"><h2>About</h2>${s.tags.length ? `<span>${s.tags.map(t => `<a class="chip" href="#/servers?tag=${enc(t)}">${esc(STAG[t] || t)}</a>`).join("")}</span>` : ""}</header>
            <div class="post-body">${s.about ? format(s.about) : '<p class="muted">The owner hasn\u2019t written a description yet.</p>'}</div></section>
          ${st && st.motd ? `<section class="panel"><header class="panel-h"><h2>Message of the day</h2></header><p class="motd">${esc(st.motd)}</p></section>` : ""}
          ${votifierPanel}
        </div>
        <aside class="clanside">
          <section class="panel"><header class="panel-h"><h2>Details</h2></header>
            <dl class="sdetails">
              ${s.website ? `<div><dt>Website</dt><dd><a href="${esc(s.website)}" target="_blank" rel="nofollow ugc noopener">${esc(s.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}</a></dd></div>` : ""}
              ${s.discord ? `<div><dt>Discord</dt><dd><a href="${esc(s.discord)}" target="_blank" rel="nofollow ugc noopener">${icon("i-discord")}Join their Discord</a></dd></div>` : ""}
              <div><dt>Listed by</dt><dd>${s.owner ? who(s.owner, 22, { tag: false, badges: false }) : "Nobody yet"}</dd></div>
              <div><dt>Listed</dt><dd>${when(s.created)}</dd></div>
              <div><dt>Status checked</dt><dd>${st ? when(st.at) : "not yet"}</dd></div>
            </dl>
          </section>
          ${my.canManage ? `<section class="panel panel-hot"><header class="panel-h"><h2>${my.owner ? "Your listing" : "Staff"}</h2></header>
            <p class="form-acts"><a class="btn btn-lava btn-s" href="#/s/${s.id}/edit">${icon("i-edit")}Edit</a><button type="button" class="btn btn-line btn-s btn-danger" data-sdelete>Remove listing</button></p>
            ${s.hidden ? '<p class="fine">Hidden from the list by the staff.</p>' : ""}</section>` : ""}
          ${verifyPanel}
          ${my.signedIn && !my.owner ? '<p class="sreport"><button type="button" class="link" data-sreport>Report this listing</button></p>' : ""}
        </aside>
      </div>`, s.name);
    const reload = () => route();
    on("click", "[data-vote]", (e, b) => castVote(b));
    on("click", "[data-vstart]", (e, b) => busy(b, async () => {
      try { await api(`/servers/${s.id}/verify`, { body: {} }); reload(); } catch (err) { formErr(b.closest("[data-verifypanel]"), err.message); }
    }));
    on("click", "[data-vcheck]", (e, b) => busy(b, async () => {
      const box = b.closest("[data-verifypanel]");
      formErr(box, "");
      try {
        const r = await api(`/servers/${s.id}/verify`, { body: { check: true } });
        toast(r.transferred ? "Verified. The listing is yours now." : "Verified. Your server has its check mark.");
        burstAt(b, 34); await WC.refreshMe(); reload();
      } catch (err) { formErr(box, err.message); }
    }));
    on("submit", "[data-votifier]", (e, f) => busy($("button[type=submit]", f), async () => {
      formErr(f, "");
      try { await api(`/servers/${s.id}/votifier`, { method: "PUT", body: { port: Number(f.port.value), token: f.token.value.trim() } }); toast("Saved. Send a test vote to check it."); reload(); }
      catch (err) { formErr(f, err.message); }
    }));
    on("click", "[data-vtest]", (e, b) => busy(b, async () => {
      const f = b.closest("form");
      try { const r = await api(`/servers/${s.id}/votifier`, { method: "PUT", body: { test: true } }); toast(r.result === "ok" ? "The test vote arrived." : "Test vote: " + r.result); reload(); }
      catch (err) { formErr(f, err.message); }
    }));
    on("click", "[data-voff]", (e, b) => twice(b, () => busy(b, async () => {
      try { await api(`/servers/${s.id}/votifier`, { method: "PUT", body: { off: true } }); toast("Vote rewards are off"); reload(); } catch (err) { toast(err.message); }
    }), "Turn off?"));
    on("click", "[data-sdelete]", (e, b) => twice(b, () => busy(b, async () => {
      try { await api(`/servers/${s.id}`, { method: "DELETE" }); toast(s.name + " is off the list"); go("#/servers"); } catch (err) { toast(err.message); }
    }), "Click again to remove"));
    on("click", "[data-sreport]", (e, b) => {
      const p = b.closest(".sreport");
      p.outerHTML = `<form class="report card" data-sreportform><label class="fld"><span>What's wrong with this listing?</span><input name="reason" maxlength="300" minlength="3" required placeholder="Fake player count, not their server, offline for weeks..."></label><button class="btn btn-ink btn-s" type="submit">Send to staff</button>${errBox()}</form>`;
      $("[data-sreportform] input", app).focus();
    });
    on("submit", "[data-sreportform]", (e, f) => busy($("button", f), async () => {
      try { await api(`/servers/${s.id}/report`, { body: { reason: f.reason.value } }); f.outerHTML = '<p class="report-done">Thanks. The staff will look at it.</p>'; } catch (err) { formErr(f, err.message); }
    }));
  }

  page(/^\/servers\/new$|^\/s\/(\d+)\/edit$/, async (m, q, stale) => {
    const editing = !!m[1];
    const u = me();
    if (!u) { show(`<section class="pagehead"><div class="wrap"><h1>Add your server</h1></div></section><div class="wrap narrow">${needSignIn("to add a server")}</div>`, "Add your server"); return; }
    let s = null;
    if (editing) {
      const d = await api("/servers/" + m[1]);
      if (stale()) return;
      if (!d.my.canManage) { show(`<section class="pagehead"><div class="wrap"><h1>Edit listing</h1></div></section><div class="wrap narrow">${empty("Only the owner can change this listing.", `<a class="btn btn-line btn-s" href="#/s/${m[1]}">Back</a>`)}</div>`, "Edit listing"); return; }
      s = d.server;
    }
    const v = s || { name: "", host: "", port: 25565, edition: "java", bedrock: null, version: "", tags: [], short: "", about: "", website: "", discord: "", region: "", color: "lava" };
    const sw = Object.entries(COLORS).map(([k, hex]) => `<label class="sw" title="${k}"><input type="radio" name="color" value="${k}"${k === v.color ? " checked" : ""}><i style="background:${hex}"></i><span class="sr-only">Color ${k}</span></label>`).join("");
    show(`
      <section class="pagehead"><div class="wrap">${crumbs(editing ? [["#/servers", "Server list"], ["#/s/" + s.id, s.name], [null, "Edit"]] : [["#/servers", "Server list"], [null, "Add your server"]])}
        <h1>${editing ? "Edit " + esc(s.name) : "Add your server"}</h1>
        <p class="pagehead-lede">${editing ? "Changing the address takes the verified mark away until you verify again." : "It goes on the list straight away. Verify it afterwards to get a check mark and vote rewards. You can list up to three servers."}</p></div></section>
      <div class="wrap narrow">
        <form class="card form sform" data-sform>
          <label class="fld"><span>Server name</span><input name="name" maxlength="40" minlength="3" required value="${esc(v.name)}"></label>
          <label class="fld"><span>One-line pitch <small>10 to 120 characters, shown in the list</small></span><input name="short" maxlength="120" minlength="10" required value="${esc(v.short)}" placeholder="What makes it worth joining?"></label>
          <fieldset class="fld"><legend>Edition</legend><div class="radios" role="radiogroup">${Object.entries(EDITION).map(([k, l]) => `<label><input type="radio" name="edition" value="${k}"${v.edition === k ? " checked" : ""}><span>${l}</span></label>`).join("")}</div></fieldset>
          <div class="grid2 saddr-fields">
            <label class="fld"><span data-hostlabel>${v.edition === "bedrock" ? "Bedrock address" : "Java address"}</span><input name="host" required maxlength="253" value="${esc(v.host)}" placeholder="play.example.com" spellcheck="false" autocapitalize="off"></label>
            <label class="fld"><span>Port</span><input name="port" type="number" min="1" max="65535" value="${v.port}"></label>
          </div>
          <div class="grid2" data-bedrockfields${v.edition === "both" ? "" : " hidden"}>
            <label class="fld"><span>Bedrock address <small>empty if it's the same</small></span><input name="bedrock_host" maxlength="253" value="${esc(v.bedrock && v.bedrock.host !== v.host ? v.bedrock.host : "")}" spellcheck="false" autocapitalize="off"></label>
            <label class="fld"><span>Bedrock port</span><input name="bedrock_port" type="number" min="1" max="65535" value="${v.bedrock ? v.bedrock.port : 19132}"></label>
          </div>
          <div class="grid2">
            <label class="fld"><span>Versions <small>optional</small></span><input name="version" maxlength="40" value="${esc(v.version)}" placeholder="1.8 to 1.21"></label>
            <label class="fld"><span>Region</span><select name="region"><option value="">Not saying</option>${Object.entries(REGION).map(([k, l]) => `<option value="${k}"${v.region === k ? " selected" : ""}>${l}</option>`).join("")}</select></label>
          </div>
          <fieldset class="fld"><legend>Tags <small>one to five</small></legend><div class="tagpick">${Object.entries(STAG).map(([k, l]) => `<label><input type="checkbox" name="tags" value="${k}"${v.tags.includes(k) ? " checked" : ""}><span>${l}</span></label>`).join("")}</div></fieldset>
          <label class="fld"><span>Description <small>optional, formatting works</small></span><textarea name="about" rows="7" maxlength="3000" placeholder="Rules, what's special, how to get started">${esc(v.about)}</textarea></label>
          <div class="grid2">
            <label class="fld"><span>Website <small>optional</small></span><input name="website" maxlength="200" value="${esc(v.website)}" placeholder="example.com"></label>
            <label class="fld"><span>Discord invite <small>optional</small></span><input name="discord" maxlength="200" value="${esc(v.discord)}" placeholder="https://discord.gg/..."></label>
          </div>
          <fieldset class="fld"><legend>Accent color</legend><div class="sws">${sw}</div></fieldset>
          ${errBox()}
          <p class="form-acts"><button class="btn btn-lava btn-l" type="submit">${editing ? "Save" : "Put it on the list"}</button>${editing ? `<a class="btn btn-line btn-l" href="#/s/${s.id}">Cancel</a>` : ""}</p>
        </form>
      </div>`, editing ? "Edit listing" : "Add your server");
    on("change", "[data-sform] input[name=edition]", (e, i) => {
      $("[data-bedrockfields]", app).hidden = i.value !== "both";
      $("[data-hostlabel]", app).textContent = i.value === "bedrock" ? "Bedrock address" : "Java address";
      const port = i.form.port;
      if (i.value === "bedrock" && port.value === "25565") port.value = "19132";
      if (i.value !== "bedrock" && port.value === "19132") port.value = "25565";
    });
    on("change", "[data-sform] input[name=tags]", (e, i) => {
      if ($$("[data-sform] input[name=tags]:checked", app).length > 5) { i.checked = false; toast("Five tags at most"); }
    });
    on("submit", "[data-sform]", (e, f) => busy($("button[type=submit]", f), async () => {
      formErr(f, "");
      const b = {
        name: f.name.value, short: f.short.value, edition: f.edition.value, host: f.host.value.trim(), port: Number(f.port.value),
        bedrock_host: f.bedrock_host.value.trim(), bedrock_port: Number(f.bedrock_port.value), version: f.version.value, region: f.region.value,
        tags: $$("input[name=tags]:checked", f).map(i => i.value), about: f.about.value, website: f.website.value, discord: f.discord.value, color: f.color.value,
      };
      try {
        if (editing) {
          const r = await api(`/servers/${s.id}`, { method: "PATCH", body: b });
          toast(r.reverify ? "Saved. Verify the new address again." : "Saved");
          go("#/s/" + s.id);
        } else {
          const r = await api("/servers", { body: b });
          toast("Your server is on the list");
          go("#/s/" + r.id);
        }
      } catch (err) {
        const dup = err.code && /^dup:(\d+)$/.exec(err.code);
        formErr(f, err.message);
        if (dup) $(".form-err", f).insertAdjacentHTML("beforeend", ` <a href="#/s/${dup[1]}">Open that listing</a>`);
      }
    }));
  });

  /* ======================================================== PLAYERS */
  page(/^\/players\/?$/, async (m, q, stale) => {
    const sort = q.get("sort") || "new", term = q.get("q") || "", pg = Number(q.get("page")) || 1;
    const d = await api(`/users?sort=${enc(sort)}&q=${enc(term)}&page=${pg}`);
    if (stale()) return;
    const base = p => "#/players?" + new URLSearchParams({ ...(term ? { q: term } : {}), ...(sort !== "new" ? { sort } : {}), page: p });
    show(`
      <section class="pagehead"><div class="wrap"><p class="kicker">Everyone who signed up</p><h1>Players</h1>
        <p class="pagehead-lede">${plural(d.total, "player")} on the record.</p></div></section>
      <div class="wrap">
        <form class="filters" data-filters>
          <label class="sr-only" for="pq">Find a player</label><input id="pq" name="q" type="search" value="${esc(term)}" placeholder="Find a player">
          <label class="fld-inline"><span>Sort</span><select name="sort">${[["new", "Newest"], ["posts", "Most posts"], ["rep", "Most reactions"], ["seen", "Recently active"], ["name", "A to Z"]].map(([k, l]) => `<option value="${k}"${sort === k ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        </form>
        ${d.users.length ? `<ul class="plist" data-stagger>${d.users.map(playerCard).join("")}</ul>` : empty("Nobody by that name.")}
        ${d.pages > 1 ? `<nav class="pager" aria-label="Pages">${Array.from({ length: d.pages }, (x, i) => i + 1).map(n => n === d.page ? `<span aria-current="page">${n}</span>` : `<a href="${base(n)}">${n}</a>`).join("")}</nav>` : ""}
      </div>`, "Players");
    let t = 0;
    const apply = f => { const p = new URLSearchParams(); if (f.q.value.trim()) p.set("q", f.q.value.trim()); if (f.sort.value !== "new") p.set("sort", f.sort.value); go("#/players" + (p.toString() ? "?" + p : "")); };
    on("input", "[data-filters] input[name=q]", (e, i) => { clearTimeout(t); t = setTimeout(() => apply(i.form), 450); });
    on("change", "[data-filters] select", (e, i) => apply(i.form));
    on("submit", "[data-filters]", (e, f) => apply(f));
  });

  page(/^\/u\/(.+)$/, async (m, q, stale) => {
    let name;
    try { name = decodeURIComponent(m[1]); } catch (e) { name = m[1]; }
    const d = await api("/users/" + enc(name));
    if (stale()) return;
    const u = d.user, mine = me() && me().id === u.id;
    const since = u.since ? new Date(u.since + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) : "";
    show(`
      <section class="pfhero"${u.clan ? ` style="--cc:${COLORS[u.clan.color] || COLORS.lava}"` : ""}>
        <div class="wrap pfhero-in">
          <div class="pf-face">${head(u, 176, "hd-xl")}<span class="pf-shadow" aria-hidden="true"></span></div>
          <div class="pf-id">
            ${crumbs([["#/players", "Players"], [null, u.name]])}
            <h1>${esc(u.name)}</h1>
            ${u.ign ? `<p class="pf-ign">In game <b>${esc(u.ign)}</b>${u.verified ? " <small>checked by the staff</small>" : ""}</p>` : ""}
            <p class="pf-badges">${badges(u) || ""}${u.role === "player" && !u.supporter && !u.verified ? '<span class="muted">Player</span>' : ""}</p>
            ${u.clan ? `<a class="pf-clan" href="#/c/${enc(u.clan.tag)}">${banner(u.clan.banner, "bnr-s")}<span><b>${esc(u.clan.name)}</b><small>${ROLE_NAMES[u.clan.role]} of [${esc(u.clan.tag)}]</small></span></a>` : '<p class="muted">No clan. A lone wolf, for now.</p>'}
            ${u.tags.length ? `<ul class="tags">${u.tags.map(t => `<li>${esc(TAG_NAMES[t] || t)}</li>`).join("")}</ul>` : ""}
            ${mine ? `<p><a class="btn btn-line btn-s" href="#/settings">${icon("i-edit")}Edit your profile</a></p>`
              : me() ? `<p><button type="button" class="btn btn-lava btn-s" data-dm="${esc(u.name)}">${icon("i-chat")}Message</button></p>`
              : `<p><a class="btn btn-line btn-s" href="#/login?next=${enc(location.hash)}">${icon("i-chat")}Sign in to message</a></p>`}
          </div>
          <dl class="pf-stats">
            <div><dt>Posts</dt><dd data-count="${u.posts}">${fmt(u.posts)}</dd></div>
            <div><dt>Threads</dt><dd data-count="${u.threads}">${fmt(u.threads)}</dd></div>
            <div><dt>Reactions</dt><dd data-count="${u.rep}">${fmt(u.rep)}</dd></div>
            <div><dt>${since ? "Playing since" : "Joined the board"}</dt><dd class="pf-date">${since || esc(new Date(u.created).toLocaleDateString("en-US", { month: "short", year: "numeric" }))}</dd></div>
          </dl>
        </div>
      </section>
      <div class="wrap pfbody">
        <section class="panel"><header class="panel-h"><h2>About</h2><span class="muted">Active ${esc(ago(u.seen) === "just now" ? "today" : ago(u.seen))}</span></header>
          <div class="post-body">${u.bio ? format(u.bio) : `<p class="muted">${mine ? 'Nothing here yet. <a href="#/settings">Write something.</a>' : "Nothing here yet."}</p>`}</div></section>
        <section class="panel"><header class="panel-h"><h2>Threads</h2></header>
          ${d.threads.length ? `<ul class="mini-list">${d.threads.map(t => `<li><a href="#/t/${t.id}">${esc(t.title)}</a><small>${esc(catOf(t.category).name)} \u00b7 ${plural(t.replies, "reply", "replies")} \u00b7 ${ago(t.created)}</small></li>`).join("")}</ul>` : '<p class="muted">No threads yet.</p>'}</section>
        <section class="panel"><header class="panel-h"><h2>Recent posts</h2></header>
          ${d.posts.length ? `<ul class="mini-list">${d.posts.map(p => `<li><a href="#/t/${p.thread.id}?p=${p.id}">${esc(plain(p.body, 140))}</a><small>in ${esc(p.thread.title)} \u00b7 ${ago(p.created)}</small></li>`).join("")}</ul>` : '<p class="muted">No posts yet.</p>'}</section>
      </div>`, u.name, () => countUp(app));
    on("click", "[data-dm]", (e, b) => busy(b, () => openChatWith(b.dataset.dm)));
  });

  /* ======================================================== MESSAGES
     The inbox, one chat at a time, and the count in the top bar. There are no sockets, so an open
     chat asks for news every few seconds while it's busy and less often as it goes quiet. */
  const setUnread = n => { if (WC.setUnread) WC.setUnread(n); };
  const checkUnread = () => { if (me()) api("/chats/unread").then(r => setUnread(r.unread)).catch(() => { /* next time */ }); };
  setInterval(() => { if (!document.hidden) checkUnread(); }, 45000);
  let chatKick = null;   // the open chat's "look now", for when the tab comes back into view
  document.addEventListener("visibilitychange", () => { if (!document.hidden && chatKick) chatKick(); });

  async function openChatWith(name) {
    try { const r = await api("/chats", { body: { to: name } }); go("#/messages/" + r.id); }
    catch (err) { toast(err.status === 401 ? "Sign in to send messages." : err.message); }
  }
  const many = n => (n > 99 ? "99+" : String(n));
  function chatPic(ch, size) {
    if (ch.kind === "dm") return head(ch.with, size);
    if (ch.kind === "clan" && ch.clan) return banner(ch.clan.banner, "bnr-s", ch.clan.name + " banner");
    return `<span class="grp-pic" style="--s:${size}px">${icon("i-users")}</span>`;
  }
  function chatRow(ch) {
    const last = ch.last;
    const said = last ? (last.mine ? "You: " : ch.kind !== "dm" ? last.by + ": " : "") + (last.text ? plain(last.text, 90) : "Message deleted") : "No messages yet";
    const kind = ch.kind === "group" ? '<span class="chip">Group</span>' : ch.kind === "clan" ? '<span class="chip">Clan</span>' : "";
    return `<li><a class="chatrow${ch.unread ? " is-unread" : ""}" href="#/messages/${ch.id}">
      <span class="chatrow-pic">${chatPic(ch, 44)}</span>
      <span class="chatrow-main"><span class="chatrow-name"><b>${esc(ch.title)}</b>${kind}${ch.muted ? '<span class="chip">Muted</span>' : ""}</span><small>${esc(said)}</small></span>
      <span class="chatrow-side">${ch.at ? `<time>${esc(ago(ch.at))}</time>` : ""}${ch.unread ? `<i class="acct-dot" aria-label="${ch.unread} unread">${many(ch.unread)}</i>` : ""}</span></a></li>`;
  }
  const noChats = '<li class="chats-none muted">No chats yet. Message a player above, or with the Message button on their profile.</li>';

  page(/^\/messages\/?$/, async (m, q, stale) => {
    if (!me()) { show(`<section class="pagehead"><div class="wrap"><h1>Messages</h1></div></section><div class="wrap narrow">${needSignIn("to message players")}</div>`, "Messages"); return; }
    const d = await api("/chats");
    if (stale()) return;
    setUnread(d.unread);
    show(`
      <section class="pagehead"><div class="wrap"><p class="kicker">Private</p><h1>Messages</h1>
        <p class="pagehead-lede">Chats with players, your groups and your clan. Only the people in a chat can read it.</p></div></section>
      <div class="wrap msgs">
        <div class="msgs-start">
          <form class="card form msg-new" data-newdm><h2>Message a player</h2>
            <div class="msg-new-row"><label class="sr-only" for="dmto">Nickname</label><input id="dmto" name="to" required maxlength="20" placeholder="Their nickname or in-game name" spellcheck="false" autocapitalize="off" autocomplete="off">
              <button class="btn btn-lava" type="submit">Start chat</button></div>${errBox()}</form>
          <details class="card form msg-new"${q.get("group") ? " open" : ""}><summary><h2>New group</h2><small>up to 50 people</small></summary>
            <form data-newgroup><label class="fld"><span>Group name</span><input name="title" required maxlength="40" placeholder="Base crew"></label>
              <label class="fld"><span>Players <small>nicknames, with commas between</small></span><input name="members" required placeholder="Steve, Alex" spellcheck="false" autocapitalize="off" autocomplete="off"></label>
              ${errBox()}<p class="form-acts"><button class="btn btn-ink" type="submit">Make the group</button></p></form></details>
        </div>
        <ul class="chats" data-chats>${d.chats.map(chatRow).join("") || noChats}</ul>
      </div>`, "Messages");
    on("submit", "[data-newdm]", (e, f) => busy($("button[type=submit]", f), async () => {
      formErr(f, "");
      try { const r = await api("/chats", { body: { to: f.to.value.trim() } }); go("#/messages/" + r.id); } catch (err) { formErr(f, err.message); }
    }));
    on("submit", "[data-newgroup]", (e, f) => busy($("button[type=submit]", f), async () => {
      formErr(f, "");
      const members = f.members.value.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
      try { const r = await api("/chats", { body: { title: f.title.value, members } }); go("#/messages/" + r.id); } catch (err) { formErr(f, err.message); }
    }));
    every(20000, async () => {
      try {
        const r = await api("/chats");
        const ul = $("[data-chats]", app);
        if (stale() || !ul) return;
        setUnread(r.unread);
        ul.innerHTML = r.chats.map(chatRow).join("") || noChats;
      } catch (e) { /* next time */ }
    });
  });

  page(/^\/messages\/(\d+|clan)$/, async (m, q, stale) => {
    if (!me()) { show(`<section class="pagehead"><div class="wrap"><h1>Messages</h1></div></section><div class="wrap narrow">${needSignIn("to read your messages")}</div>`, "Messages"); return; }
    if (m[1] === "clan") {
      let r = null;
      try { r = await api("/chats/clan"); } catch (err) { if (err.status !== 404) throw err; }
      if (stale()) return;
      if (r) location.replace("#/messages/" + r.id);
      else show(authCard("Clan chat", "You're not in a clan", "<p>Join a clan, or found your own, and its chat shows up here.</p>", [["#/clans", "Find a clan"], ["#/messages", "Messages"]]), "Clan chat");
      return;
    }
    const d = await api("/chats/" + m[1]);
    if (stale()) return;
    renderChat(d, stale);
  });

  function renderChat(d, stale) {
    const ch = d.chat, u = me(), msgs = d.messages.slice();
    let lastId = msgs.length ? msgs[msgs.length - 1].id : 0, since = d.now, seen = ch.seen || 0, quiet = Date.now(), timer = 0;
    const dayOf = t => new Date(t).toDateString();
    const dayName = t => {
      const x = new Date(t), now = new Date(), y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      if (x.toDateString() === now.toDateString()) return "Today";
      if (x.toDateString() === y.toDateString()) return "Yesterday";
      return x.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(x.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
    };
    const clock = t => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    function msgHTML(msg, prev) {
      const mine = msg.user.id === u.id;
      const cont = !!prev && prev.user.id === msg.user.id && msg.at - prev.at < 5 * 60e3 && dayOf(prev.at) === dayOf(msg.at);
      const day = !prev || dayOf(prev.at) !== dayOf(msg.at) ? `<li class="msg-day"><span>${esc(dayName(msg.at))}</span></li>` : "";
      const text = msg.deleted ? '<p class="msg-gone">Message deleted</p>'
        : msg.hidden ? `<p class="msg-gone">From a player you blocked. <button type="button" class="link" data-reveal>Show it</button></p><div class="msg-hid" hidden>${format(msg.body)}</div>`
        : format(msg.body);
      const acts = msg.deleted ? "" : mine ? '<button type="button" class="link" data-mdel>Delete</button>' : '<button type="button" class="link" data-mrep>Report</button>';
      const face = msg.user.deleted ? head(msg.user, 32) : `<a href="${WC.userHref(msg.user)}" tabindex="-1" aria-hidden="true">${head(msg.user, 32)}</a>`;
      return `${day}<li class="msg${mine ? " mine" : ""}${cont ? " cont" : ""}" id="m${msg.id}" data-mid="${msg.id}">
        ${mine ? "" : `<span class="msg-head">${cont ? "" : face}</span>`}
        <div class="msg-b">${!mine && !cont && ch.kind !== "dm" ? `<p class="msg-who">${msg.user.deleted ? "Deleted player" : `<a href="${WC.userHref(msg.user)}">${esc(msg.user.name)}</a>`}${ctag(msg.user.clan)}</p>` : ""}
          <div class="msg-text">${text}</div>
          <p class="msg-meta"><time datetime="${new Date(msg.at).toISOString()}" title="${esc(when(msg.at))}">${clock(msg.at)}</time>${acts}</p></div></li>`;
    }
    const listHTML = list => list.map((x, i) => msgHTML(x, list[i - 1])).join("");
    const sub = ch.kind === "dm" ? (ch.with.deleted ? "Deleted their account" : `<a href="${WC.userHref(ch.with)}">View profile</a>${ch.with.clan ? ctag(ch.with.clan) : ""}`)
      : ch.kind === "clan" ? (ch.clan ? `<a href="#/c/${enc(ch.clan.tag)}">[${esc(ch.clan.tag)}]</a> \u00b7 ${plural(ch.count, "member")}` : "")
      : `${plural(ch.count, "person", "people")}${ch.owner ? " \u00b7 you run it" : ""}`;
    const acts = [`<button type="button" class="btn btn-line btn-s" data-mute aria-pressed="${ch.muted}">${ch.muted ? "Unmute" : "Mute"}</button>`];
    if (ch.kind === "group") acts.unshift(`<button type="button" class="btn btn-line btn-s" data-people aria-expanded="false">${icon("i-users")}People</button>`), acts.push('<button type="button" class="btn btn-line btn-s btn-danger" data-leavechat>Leave</button>');
    if (ch.kind === "dm" && !ch.with.deleted) acts.push(`<button type="button" class="btn btn-line btn-s${ch.blocked ? "" : " btn-danger"}" data-block>${ch.blocked ? "Unblock" : "Block"}</button>`, '<button type="button" class="btn btn-line btn-s" data-hidechat>Hide chat</button>');
    const closed = ch.kind !== "dm" ? "" : ch.with.deleted ? "This player deleted their account, so the chat is closed."
      : ch.blocked ? `You blocked ${esc(ch.with.name)}. Unblock them to write again.` : ch.blockedBy ? `You can't message ${esc(ch.with.name)}.` : "";
    const people = ch.kind !== "group" ? "" : `<section class="card chat-people" data-peoplepanel hidden><h2>People <small>${ch.count}</small></h2>
      <ul class="chat-members">${ch.members.map(p => `<li>${who(p, 28, { badges: false })}${p.owner ? '<span class="chip">Runs it</span>' : ""}${ch.owner && p.id !== u.id ? `<button type="button" class="link danger" data-kick="${esc(p.name)}">Remove</button>` : ""}</li>`).join("")}</ul>
      ${ch.owner ? `<form class="msg-new-row" data-addmember><label class="sr-only" for="addm">Add a player</label><input id="addm" name="name" required maxlength="20" placeholder="Add a player by nickname" spellcheck="false" autocapitalize="off" autocomplete="off"><button class="btn btn-ink btn-s" type="submit">Add</button>${errBox()}</form>
        <form class="msg-new-row" data-rename><label class="sr-only" for="gname">Group name</label><input id="gname" name="title" required maxlength="40" value="${esc(ch.title)}"><button class="btn btn-line btn-s" type="submit">Rename</button>${errBox()}</form>` : ""}</section>`;
    show(`
      <div class="chatpage">
        <header class="chat-top"><div class="wrap chat-top-in">
          <a class="chat-back" href="#/messages" title="All messages" aria-label="Back to all messages">&larr;</a>
          <span class="chat-pic">${chatPic(ch, 40)}</span>
          <div class="chat-id"><h1>${esc(ch.title)}</h1><small>${sub}</small></div>
          <div class="chat-acts">${acts.join("")}</div>
        </div></header>
        <div class="chat-scroll" data-scroll><div class="wrap chat-log">
          ${people}
          ${d.more ? '<p class="chat-older"><button type="button" class="btn btn-line btn-s" data-older>Show older messages</button></p>' : ""}
          <ol class="msglist" data-list>${listHTML(msgs)}</ol>
          <p class="chat-empty muted" data-emptychat${msgs.length ? " hidden" : ""}>No messages yet. Say hello.</p>
          <p class="chat-newpill" data-newpill hidden><button type="button" class="btn btn-lava btn-s" data-jump>New messages</button></p>
        </div></div>
        ${closed ? `<div class="chat-send chat-closed"><div class="wrap"><p class="muted">${closed}</p></div></div>`
          : `<form class="chat-send" data-send><div class="wrap chat-send-in"><label class="sr-only" for="msgbody">Your message</label>
            <textarea id="msgbody" name="body" rows="1" maxlength="2000" required placeholder="Message ${esc(ch.kind === "clan" ? "your clan" : ch.title)}" data-composer></textarea>
            <button class="btn btn-lava" type="submit" aria-label="Send">${icon("i-send")}<span>Send</span></button></div></form>`}
      </div>`, ch.title);
    const box = $("[data-scroll]", app), list = $("[data-list]", app);
    const nearBottom = () => box.scrollHeight - box.scrollTop - box.clientHeight < 140;
    const toBottom = () => { box.scrollTop = box.scrollHeight; $("[data-newpill]", app).hidden = true; };
    function paintSeen() {
      for (const s of $$(".msg-seen", list)) s.remove();
      if (ch.kind !== "dm") return;
      const mine = msgs.filter(x => x.user.id === u.id && !x.deleted).pop();
      const meta = mine && seen >= mine.id && $(`#m${mine.id} .msg-meta`, list);
      if (meta) meta.insertAdjacentHTML("beforeend", '<span class="msg-seen">Seen</span>');
    }
    function add(news) {
      const fresh = news.filter(x => !msgs.some(y => y.id === x.id));
      if (!fresh.length) return false;
      list.insertAdjacentHTML("beforeend", fresh.map((x, i) => msgHTML(x, i ? fresh[i - 1] : msgs[msgs.length - 1])).join(""));
      msgs.push(...fresh);
      lastId = Math.max(lastId, ...fresh.map(x => x.id));
      $("[data-emptychat]", app).hidden = true;
      paintSeen();
      return true;
    }
    function gone(id) {
      const x = msgs.find(y => y.id === id);
      if (x) { x.deleted = true; x.body = ""; }
      const li = $("#m" + id, list);
      if (!li) return;
      $(".msg-text", li).innerHTML = '<p class="msg-gone">Message deleted</p>';
      for (const b of $$(".msg-meta .link", li)) b.remove();
      paintSeen();
    }
    const composer = $("[data-composer]", app), touch = matchMedia("(pointer: coarse)").matches;
    // drawing the page scrolled it to the top and focused the title; the chat starts at its newest message,
    // and on a computer the cursor waits in the message box
    requestAnimationFrame(() => { toBottom(); paintSeen(); if (composer && !touch) composer.focus({ preventScroll: true }); });
    checkUnread();

    function plan() {
      clearTimeout(timer);
      const idle = Date.now() - quiet;
      timer = setTimeout(poll, idle < 2 * 60e3 ? 4000 : idle < 10 * 60e3 ? 10000 : 30000);
      timers.push(timer);
    }
    async function poll() {
      if (stale()) { chatKick = null; return; }
      if (document.hidden) { plan(); return; }
      try {
        const r = await api(`/chats/${ch.id}?after=${lastId}&since=${since}`);
        if (stale()) return;
        since = r.now;
        const near = nearBottom();
        if (add(r.messages)) {
          quiet = Date.now();
          if (near) toBottom(); else $("[data-newpill]", app).hidden = false;
          checkUnread();
        }
        for (const id of r.gone || []) gone(id);
        if (typeof r.seen === "number" && r.seen !== seen) { seen = r.seen; paintSeen(); }
      } catch (err) {
        if (stale()) return;
        if (err.status === 404) {   // taken out of the group, or out of the clan
          const f = $("[data-send]", app);
          if (f) f.outerHTML = '<div class="chat-send chat-closed"><div class="wrap"><p class="muted">You\'re not in this chat any more.</p></div></div>';
          chatKick = null;
          return;
        }
      }
      plan();
    }
    chatKick = () => { if (stale()) { chatKick = null; return; } clearTimeout(timer); poll(); };
    plan();

    const grow = ta => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 160) + "px"; };
    on("input", "[data-composer]", (e, ta) => grow(ta));
    // Enter sends and Shift+Enter starts a new line; on phones Enter stays a new line and the button sends
    on("keydown", "[data-composer]", (e, ta) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !touch) { e.preventDefault(); ta.form.requestSubmit(); }
    });
    on("submit", "[data-send]", (e, f) => {
      const text = f.body.value.trim();
      if (!text) return;
      busy($("button[type=submit]", f), async () => {
        try {
          const r = await api(`/chats/${ch.id}/messages`, { body: { body: text } });
          f.body.value = ""; grow(f.body);
          add([r.message]);
          toBottom();
          quiet = Date.now();
          plan();
        } catch (err) { toast(err.message); }
        f.body.focus();
      });
    });
    on("click", "[data-jump]", () => toBottom());
    on("click", "[data-older]", (e, b) => busy(b, async () => {
      try {
        const r = await api(`/chats/${ch.id}?before=${msgs[0].id}`);
        const keep = box.scrollHeight - box.scrollTop;
        msgs.unshift(...r.messages);
        list.innerHTML = listHTML(msgs);
        box.scrollTop = box.scrollHeight - keep;
        if (!r.more) b.closest(".chat-older").remove();
        paintSeen();
      } catch (err) { toast(err.message); }
    }));
    on("click", "[data-reveal]", (e, b) => { const t = b.closest(".msg-text"); $(".msg-hid", t).hidden = false; b.parentElement.remove(); });
    on("click", "[data-mdel]", (e, b) => twice(b, () => busy(b, async () => {
      const id = Number(b.closest("[data-mid]").dataset.mid);
      try { await api(`/chats/${ch.id}/messages/${id}`, { method: "DELETE" }); gone(id); } catch (err) { toast(err.message); }
    }), "Delete it?"));
    on("click", "[data-mrep]", (e, b) => {
      const li = b.closest("[data-mid]");
      if ($("[data-mrepform]", li)) return;
      $(".msg-b", li).insertAdjacentHTML("beforeend", `<form class="report" data-mrepform><label class="fld"><span>What's wrong with this message?</span>
        <input name="reason" maxlength="300" minlength="3" required placeholder="What happened..."></label><button class="btn btn-ink btn-s" type="submit">Send to staff</button><button class="btn btn-line btn-s" type="button" data-cancelreport>Cancel</button>${errBox()}</form>`);
      $("[data-mrepform] input", li).focus();
    });
    on("click", "[data-cancelreport]", (e, b) => b.closest("form").remove());
    on("submit", "[data-mrepform]", (e, f) => busy($("button[type=submit]", f), async () => {
      try { await api(`/chats/${ch.id}/messages/${f.closest("[data-mid]").dataset.mid}/report`, { body: { reason: f.reason.value } }); f.outerHTML = '<p class="report-done">Thanks. The staff will look at it.</p>'; }
      catch (err) { formErr(f, err.message); }
    }));
    on("click", "[data-mute]", (e, b) => busy(b, async () => {
      try {
        await api(`/chats/${ch.id}`, { method: "PATCH", body: { muted: !ch.muted } });
        ch.muted = !ch.muted;
        b.textContent = ch.muted ? "Unmute" : "Mute"; b.setAttribute("aria-pressed", String(ch.muted));
        toast(ch.muted ? "Muted. It won't add to your unread count." : "Unmuted");
        checkUnread();
      } catch (err) { toast(err.message); }
    }));
    on("click", "[data-people]", (e, b) => { const p = $("[data-peoplepanel]", app); p.hidden = !p.hidden; b.setAttribute("aria-expanded", String(!p.hidden)); if (!p.hidden) box.scrollTop = 0; });
    on("click", "[data-leavechat]", (e, b) => twice(b, () => busy(b, async () => {
      try { await api(`/chats/${ch.id}/members/me`, { method: "DELETE" }); toast("You left " + ch.title); go("#/messages"); } catch (err) { toast(err.message); }
    }), "Leave the group?"));
    on("click", "[data-kick]", (e, b) => twice(b, () => busy(b, async () => {
      try { await api(`/chats/${ch.id}/members/${enc(b.dataset.kick)}`, { method: "DELETE" }); toast(b.dataset.kick + " is out of the group"); route(); } catch (err) { toast(err.message); }
    }), "Remove?"));
    on("submit", "[data-addmember]", (e, f) => busy($("button[type=submit]", f), async () => {
      formErr(f, "");
      try { const r = await api(`/chats/${ch.id}/members`, { body: { name: f.name.value.trim() } }); toast(r.user.name + " is in the group"); route(); } catch (err) { formErr(f, err.message); }
    }));
    on("submit", "[data-rename]", (e, f) => busy($("button[type=submit]", f), async () => {
      formErr(f, "");
      try { await api(`/chats/${ch.id}`, { method: "PATCH", body: { title: f.title.value } }); toast("Renamed"); route(); } catch (err) { formErr(f, err.message); }
    }));
    on("click", "[data-block]", (e, b) => {
      const act = () => busy(b, async () => {
        try {
          if (ch.blocked) await api("/blocks/" + enc(ch.with.name), { method: "DELETE" });
          else await api("/blocks", { body: { name: ch.with.name } });
          toast(ch.blocked ? ch.with.name + " is unblocked" : ch.with.name + " is blocked. They can't message you.");
          route();
        } catch (err) { toast(err.message); }
      });
      if (ch.blocked) act(); else twice(b, act, "Block them?");
    });
    on("click", "[data-hidechat]", (e, b) => busy(b, async () => {
      try { await api(`/chats/${ch.id}`, { method: "PATCH", body: { hidden: true } }); toast("Hidden. It comes back if they write again."); go("#/messages"); } catch (err) { toast(err.message); }
    }));
  }

  /* ======================================================== SUPPORTERS */
  page(/^\/supporters\/?$/, async (m, q, stale) => {
    const d = await api("/supporters");
    if (stale()) return;
    const pct = d.goal ? Math.min(100, (d.month.total / d.goal) * 100) : 0;
    const monthName = new Date(d.month.start).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
    const links = [["Ko-fi", DONATE.kofi], ["Buy Me a Coffee", DONATE.bmc], ["PayPal", DONATE.paypal]].filter(x => x[1]);
    show(`
      <section class="mast mast-sup">
        <div class="mast-bg" aria-hidden="true"></div>
        <div class="wrap mast-in">
          <p class="kicker">The people who keep the lights on</p>
          <h1>Supporters</h1>
          <p class="mast-lede">Welloby is free and sells nothing. Tips pay for hosting, upkeep and development, and they buy no perks or advantages in game. Supporters get a heart next to their name here, nothing more.</p>
          <div class="bigoal">
            <p><b>${money(d.month.total)}</b><span>of ${money(d.goal)} in ${esc(monthName)}${d.month.count ? `, from ${plural(d.month.count, "supporter")}` : ""}</span></p>
            <div class="bigoal-track" role="progressbar" aria-label="${esc(monthName)} goal" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><i style="--p:${pct.toFixed(1)}%"></i>${[25, 50, 75].map(s => `<em style="left:${s}%"></em>`).join("")}</div>
          </div>
          <p class="mast-acts">${links.map(([n, href], i) => `<a class="btn ${i ? "btn-line" : "btn-lava"} btn-l" href="${esc(href)}" target="_blank" rel="noopener" data-tip>${icon("i-heart")}${esc(n)}${icon("i-ext")}</a>`).join("")}</p>
          <p class="fine">Payments go through ${links.map(l => l[0]).join(" or ") || "the tip page"}, so this site never sees your card. Use your in-game name when you tip and you get the supporter heart automatically.</p>
        </div>
      </section>
      <div class="wrap supgrid">
        <section class="panel"><header class="panel-h"><h2>The wall</h2><span class="muted">${plural(d.all.count, "tip")} since the start</span></header>
          ${d.supporters.length ? `<ul class="wall" data-stagger>${d.supporters.map(s => `<li class="tip glow">
            <div class="tip-who">${s.user ? `<a href="${WC.userHref(s.user)}">${head(s.user, 40)}</a>` : '<i class="hd hd-anon" style="width:40px;height:40px"></i>'}<div><b>${s.user ? `<a href="${WC.userHref(s.user)}">${esc(s.name)}</a>` : esc(s.name)}</b><small>${money(s.amount, s.currency)} \u00b7 ${ago(s.at)}</small></div></div>
            ${s.message ? `<q>${esc(s.message)}</q>` : ""}</li>`).join("")}</ul>` : empty("No tips yet. You could be first.")}
        </section>
        <aside class="panel"><header class="panel-h"><h2>Top supporters</h2></header>
          ${d.top.length ? `<ol class="rank rank-sup">${d.top.map((s, i) => `<li>${s.user ? `<a href="${WC.userHref(s.user)}">` : "<span>"}<i class="rk">${i + 1}</i>${s.user ? head(s.user, 30) : '<i class="hd hd-anon"></i>'}<span><b>${esc(s.name)}</b><small>${money(s.amount)} \u00b7 ${plural(s.count, "tip")}</small></span>${s.user ? "</a>" : "</span>"}</li>`).join("")}</ol>` : '<p class="muted">Nobody yet.</p>'}
        </aside>
      </div>`, "Supporters", () => countUp(app));
  });

  /* ======================================================== ACCOUNTS */
  const nextHash = q => { const n = q.get("next"); return n && n.startsWith("#/") && !/^#\/(login|register|auth|forgot|reset|verify)/.test(n) ? n : null; };
  const health = () => WC.health() || {};
  const sess = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch (e) { /* private mode */ } },
  };
  /* one-time codes from emails and sign-ins come in the address; this drops them from it and the history */
  const forget = path => { try { history.replaceState(null, "", location.pathname + location.search + "#" + path); } catch (e) { /* ignore */ } };
  /* the providers' own marks, as their sign-in button guidelines ask */
  const BRANDS = {
    google: { name: "Google", svg: '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>' },
    discord: { name: "Discord", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>' },
    facebook: { name: "Facebook", svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/></svg>' },
  };
  const KEY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M11 12 20 3m-3.5 3.5 2.5 2.5m-5.5.5 2 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  const providers = () => (health().providers || []).filter(p => BRANDS[p]);
  const brandName = p => (BRANDS[p] || { name: "that site" }).name;

  function socialButtons(mode, label) {
    const ps = providers();
    if (!ps.length) return "";
    return `<div class="social-in">${ps.map(p => `<button type="button" class="btn-social is-${p}" data-social="${p}" data-mode="${mode}">${BRANDS[p].svg}<span>Continue with ${BRANDS[p].name}</span></button>`).join("")}</div>
      ${label ? `<p class="or-line"><span>${esc(label)}</span></p>` : ""}`;
  }
  /* the button sends the browser to the provider; it comes back to #/auth */
  function onSocial(next) {
    on("click", "[data-social]", (e, b) => busy(b, async () => {
      try {
        const r = await api("/auth/oauth/start", { body: { provider: b.dataset.social, mode: b.dataset.mode, back: location.origin + location.pathname } });
        sess.set("welloby.next", next || "");
        location.href = r.url;
        await new Promise(res => setTimeout(res, 5000));   // stays busy while the browser leaves
      } catch (err) { toast(err.message); }
    }));
  }
  /* a password box with a show/hide button */
  const pwBox = (name, ac, attrs) => `<span class="pw"><input name="${name}" type="password" autocomplete="${ac}" maxlength="200" ${attrs || ""}><button type="button" class="pw-eye" data-pweye aria-label="Show password" aria-pressed="false">${EYE}</button></span>`;
  /* a new password and the same again, with the strength bar and a match note */
  const newPwFields = (first, second, required = true, names = ["password", "password2"]) => `
    <label class="fld"><span>${first}</span>${pwBox(names[0], "new-password", (required ? "required " : "") + 'minlength="8" data-pw')}
      <span class="pwmeter" aria-hidden="true"><i data-pwbar></i></span><small class="fld-note" data-pwnote aria-live="polite"></small></label>
    <label class="fld"><span>${second}</span>${pwBox(names[1], "new-password", (required ? "required " : "") + 'minlength="8" data-pw2')}
      <small class="fld-note" data-pw2note aria-live="polite"></small></label>`;
  function pwHandlers() {
    on("click", "[data-pweye]", (e, b) => {
      const i = b.parentElement.querySelector("input"), reveal = i.type === "password";
      i.type = reveal ? "text" : "password";
      b.setAttribute("aria-pressed", String(reveal));
      b.setAttribute("aria-label", reveal ? "Hide password" : "Show password");
    });
    const match = f => {
      const a = $("[data-pw]", f), b = $("[data-pw2]", f), n = $("[data-pw2note]", f);
      if (!a || !b || !n) return;
      if (!b.value) { n.textContent = ""; n.className = "fld-note"; return; }
      const same = a.value === b.value;
      n.textContent = same ? "They match." : "They don't match yet.";
      n.className = "fld-note " + (same ? "good" : "bad");
    };
    on("input", "[data-pw]", (e, i) => {
      const v = i.value, f = i.form;
      let s = 0;
      if (v.length >= 8) s++; if (v.length >= 12) s++; if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++; if (/[\d\W_]/.test(v)) s++;
      if (/^(password|12345678|qwerty|minecraft)/i.test(v)) s = 1;
      $("[data-pwbar]", f).style.setProperty("--s", s);
      $("[data-pwnote]", f).textContent = v ? ["Too short", "Weak", "Okay", "Good", "Strong"][s] : "";
      match(f);
    });
    on("input", "[data-pw2]", (e, i) => match(i.form));
  }
  /* The nickname is the name on the site and what you sign in with; the in-game name is optional
     and is where vote rewards go. Kept in step with NICK_RE and NAME_RE in worker.js. */
  const NICK_OK = /^[\p{L}\p{N}_.-]{3,20}$/u, IGN_OK = /^\.?[A-Za-z0-9_](?:[A-Za-z0-9_ ]{1,14})[A-Za-z0-9_]$/;
  const nickField = v => `<label class="fld"><span>Nickname <small>your name on the site, and what you sign in with</small></span>
      <input name="name" value="${esc(v || "")}" autocomplete="username" required minlength="3" maxlength="20" spellcheck="false" autocapitalize="off" data-name>
      <small class="fld-note" data-namenote aria-live="polite"></small></label>`;
  const ignField = v => `<label class="fld"><span>In-game name <small>optional, add it later if you like</small></span>
      <input name="ign" value="${esc(v || "")}" maxlength="17" spellcheck="false" autocapitalize="off" autocomplete="off" data-ign>
      <small class="fld-note" data-ignnote aria-live="polite">Your Minecraft name, so vote rewards reach you and players know who you are in game.</small></label>`;
  /* live "is this nickname free" note and the block face that goes with it */
  function nameChecker() {
    let nameT = 0;
    on("input", "[data-name]", (e, i) => {
      const v = i.value.trim(), note = $("[data-namenote]", app), face = $("[data-face]", app);
      if (face) face.innerHTML = head({ name: v || "?" }, 120, "hd-xl");
      clearTimeout(nameT);
      note.textContent = ""; note.className = "fld-note";
      if (!v) return;
      if (!NICK_OK.test(v)) { note.textContent = "3 to 20 letters, numbers, _ . or -, no spaces."; return; }
      nameT = setTimeout(async () => {
        try { await api("/users/" + enc(v)); note.textContent = "That nickname is taken."; note.className = "fld-note bad"; }
        catch (err) { if (err.status === 404) { note.textContent = "Free. It's yours if you want it."; note.className = "fld-note good"; } }
      }, 350);
    });
    on("input", "[data-ign]", (e, i) => {
      const v = i.value.trim(), note = $("[data-ignnote]", i.form);
      if (!v) { note.textContent = "Your Minecraft name, so vote rewards reach you and players know who you are in game."; note.className = "fld-note"; return; }
      const ok = IGN_OK.test(v) && !/ {2}/.test(v);
      note.textContent = ok ? "Looks like a Minecraft name." : "Minecraft names are 3 to 16 letters, numbers or underscores.";
      note.className = "fld-note " + (ok ? "good" : "bad");
    });
  }
  /* the terms tick box on both sign-up forms (worded by the advertising session, 20 Nov 2026) */
  const termsBox = () => `<label class="fld-check"><input type="checkbox" name="terms" required><span>I agree to the <a href="terms.html" target="_blank" rel="noopener">Welloby terms</a>, including that staff can ban anyone for any reason and that Welloby isn't responsible for what I lose.</span></label>`;
  /* a one-message card on the sign-in backdrop */
  const authCard = (kicker, title, html, links) => `<section class="authpage"><div class="authbg" aria-hidden="true"></div>
    <div class="authcard notch"><p class="kicker">${esc(kicker)}</p><h1>${esc(title)}</h1><div class="authmsg">${html}</div>
    ${links && links.length ? `<p class="form-acts">${links.map(([h, l], i) => `<a class="btn ${i ? "btn-line" : "btn-lava"}" href="${h}">${esc(l)}</a>`).join("")}</p>` : ""}</div></section>`;
  const toWelcome = (mailSent, next) => go("#/welcome?" + new URLSearchParams(Object.assign({ mail: mailSent ? "1" : "0" }, next ? { next } : {})));

  page(/^\/login$/, async (m, q) => {
    if (me()) { go(nextHash(q) || "#/"); return; }
    const next = nextHash(q);
    show(`
      <section class="authpage"><div class="authbg" aria-hidden="true"></div>
        <form class="authcard notch" data-login>
          <p class="kicker">Welcome back</p><h1>Sign in</h1>
          ${socialButtons("login", "or with your name or email")}
          <label class="fld"><span>Nickname or email</span><input name="name" autocomplete="username" required maxlength="254" spellcheck="false" autocapitalize="off"></label>
          <label class="fld"><span>Password</span>${pwBox("password", "current-password", "required")}</label>
          <p class="fld-aside"><a href="#/forgot">Forgot your password?</a></p>
          ${errBox()}
          <button class="btn btn-lava btn-l" type="submit">Sign in</button>
          <p class="authalt">New here? <a href="#/register${next ? "?next=" + enc(next) : ""}">Create an account</a></p>
        </form>
      </section>`, "Sign in", () => $("input[name=name]", app).focus());
    onSocial(next);
    pwHandlers();
    on("submit", "[data-login]", (e, f) => busy($("button[type=submit]", f), async () => {
      formErr(f, "");
      try {
        const r = await api("/auth/login", { body: { name: f.name.value.trim(), password: f.password.value } });
        WC.setSession(r.token, r.user);
        toast("Signed in as " + r.user.name);
        go(next || "#/");
      } catch (err) { formErr(f, err.message); f.password.select(); }
    }));
  });

  let tsLoading = null;
  function turnstile(box, siteKey, onToken) {
    if (!siteKey || !box) return;
    const render = () => window.turnstile && window.turnstile.render(box, { sitekey: siteKey, theme: "dark", callback: onToken, "expired-callback": () => onToken("") });
    if (window.turnstile) { render(); return; }
    if (!tsLoading) {
      tsLoading = new Promise(res => {
        const s = document.createElement("script");
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; s.async = true; s.onload = res; document.head.append(s);
      });
    }
    tsLoading.then(render);
  }
  page(/^\/register$/, async (m, q) => {
    if (me()) { go("#/"); return; }
    const site = health().turnstile || "";
    const next = nextHash(q);
    let tsToken = "";
    show(`
      <section class="authpage"><div class="authbg" aria-hidden="true"></div>
        <form class="authcard authcard-wide notch" data-register>
          <div class="authface"><div class="authface-head" data-face>${head({ name: "?" }, 120, "hd-xl")}</div><p class="muted">Your face is made from your name.</p></div>
          <div class="authform">
            <p class="kicker">Free, takes a minute</p><h1>Create your account</h1>
            ${socialButtons("login", "or sign up with email")}
            ${nickField("")}
            <label class="fld"><span>Email <small>Gmail or any address. Only for getting back in, never shown to anyone</small></span>
              <input name="email" type="email" inputmode="email" autocomplete="email" required maxlength="254" spellcheck="false" autocapitalize="off"></label>
            ${ignField("")}
            ${newPwFields("Password <small>at least 8 characters, not your in-game one</small>", "Type the password again")}
            <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
            ${site ? '<div class="ts" data-ts></div>' : ""}
            ${termsBox()}
            ${errBox()}
            <button class="btn btn-lava btn-l" type="submit">Create account</button>
            <p class="authalt">Already have an account? <a href="#/login${next ? "?next=" + enc(next) : ""}">Sign in</a></p>
            <p class="fine">Nicknames are first come, first served. We keep your nickname, in-game name, email, a scrambled copy of your password and what you post. <a href="privacy.html">How we handle it</a>.</p>
          </div>
        </form>
      </section>`, "Create your account", () => { $("[data-name]", app).focus(); turnstile($("[data-ts]", app), site, t => { tsToken = t; }); });
    onSocial(next);
    pwHandlers();
    nameChecker();
    on("submit", "[data-register]", (e, f) => busy($("button[type=submit]", f), async () => {
      formErr(f, "");
      if (f.password.value !== f.password2.value) { formErr(f, "The two passwords don't match."); f.password2.focus(); return; }
      if (!f.terms.checked) { formErr(f, "Tick the box to accept the terms first."); return; }
      try {
        const r = await api("/auth/register", { body: { name: f.name.value.trim(), email: f.email.value.trim(), ign: f.ign.value.trim(), password: f.password.value, password2: f.password2.value, website: f.website.value, turnstile: tsToken } });
        WC.acceptTerms();
        WC.setSession(r.token, r.user);
        toWelcome(r.mailSent, next);
      } catch (err) { formErr(f, err.message); if (window.turnstile && site) window.turnstile.reset(); }
    }));
  });

  /* back from Google, Discord or Facebook: sign in, finish a new account, or say what went wrong */
  page(/^\/auth$/, async (m, q, stale) => {
    const fresh = q.get("t"), e = q.get("e"), linked = q.get("linked"), p = q.get("p");
    if (fresh || e || linked) forget("/auth");
    if (fresh) sess.set("welloby.signup", fresh);
    if (linked) {
      sess.set("welloby.signup", "");
      await WC.refreshMe();
      toast(brandName(linked) + " is connected. You can sign in with it now.");
      go("#/settings");
      return;
    }
    const next = sess.get("welloby.next") || "";
    const nextOk = next.startsWith("#/") ? next : "";
    const back = me() ? [["#/settings", "Settings"], ["#/", "Community"]] : [["#/login", "Sign in"], ["#/register", "Create an account"]];
    if (e) {
      sess.set("welloby.signup", "");
      const pn = brandName(p);
      const why = {
        expired: "That sign-in took too long or was already used. Try the button again.",
        cancelled: `You cancelled at ${pn}, so nothing changed.`,
        failed: `${pn} didn't let us finish. Try again in a minute.`,
        taken: `That ${pn} account is already connected to a different Welloby account.`,
        other: `Your Welloby account already has a different ${pn} account connected. Disconnect it in Settings first.`,
        emailtaken: `There's already a Welloby account with the email from your ${pn} account. Sign in to it with your name or email and password, then connect ${pn} in Settings.`,
        banned: "That Welloby account is banned.",
      };
      show(authCard("Sign-in", "That didn't work", `<p>${esc(why[e] || why.failed)}</p>`, back), "Sign in");
      return;
    }
    const t = fresh || sess.get("welloby.signup") || "";
    if (!t) { go(me() ? "#/settings" : "#/login"); return; }
    let r;
    try { r = await api("/auth/ticket", { body: { t } }); }
    catch (err) {
      sess.set("welloby.signup", "");
      if (!stale()) show(authCard("Sign-in", "That didn't work", `<p>${esc(err.message)}</p>`, back), "Sign in");
      return;
    }
    if (stale()) return;
    if (r.token) {
      sess.set("welloby.signup", ""); sess.set("welloby.next", "");
      WC.setSession(r.token, r.user);
      toast("Signed in as " + r.user.name);
      go(nextOk || "#/");
      return;
    }
    const s = r.signup || {};
    const pn = esc(s.providerName || brandName(s.provider));
    show(`
      <section class="authpage"><div class="authbg" aria-hidden="true"></div>
        <form class="authcard authcard-wide notch" data-finish>
          <div class="authface"><div class="authface-head" data-face>${head({ name: s.suggest || "?" }, 120, "hd-xl")}</div><p class="muted">Your face is made from your name.</p></div>
          <div class="authform">
            <p class="kicker">Signed in with ${pn}</p><h1>Pick a nickname</h1>
            <p class="authlede">${s.email ? `Your account will use <b>${esc(s.email)}</b>${s.emailVerified ? "" : ", and we'll send a link to confirm it"}.` : `${pn} didn't share an email, so add one. It's how you get back in if you ever lose access.`} Last step: your name on the site.</p>
            ${nickField(s.suggest || "")}
            ${s.email ? "" : `<label class="fld"><span>Email</span><input name="email" type="email" inputmode="email" autocomplete="email" required maxlength="254" spellcheck="false" autocapitalize="off"></label>`}
            ${ignField("")}
            <details class="pw-opt"><summary>Add a password too <small>optional, so you can also sign in with your nickname</small></summary>
              ${newPwFields("Password <small>at least 8 characters</small>", "Type it again", false)}</details>
            ${termsBox()}
            ${errBox()}
            <button class="btn btn-lava btn-l" type="submit">Create account</button>
            <p class="fine">We keep your name, your email, which ${pn} account signs you in, and what you post. Never your ${pn} password. <a href="privacy.html">How we handle it</a>.</p>
          </div>
        </form>
      </section>`, "Pick a nickname", () => $("[data-name]", app).focus());
    pwHandlers();
    nameChecker();
    on("submit", "[data-finish]", (ev, f) => busy($("button[type=submit]", f), async () => {
      formErr(f, "");
      const pw = f.password.value;
      if (pw && pw !== f.password2.value) { formErr(f, "The two passwords don't match."); return; }
      if (!f.terms.checked) { formErr(f, "Tick the box to accept the terms first."); return; }
      const out = { name: f.name.value.trim(), ign: f.ign.value.trim(), social: t };
      if (f.email) out.email = f.email.value.trim();
      if (pw) { out.password = pw; out.password2 = f.password2.value; }
      try {
        const r2 = await api("/auth/register", { body: out });
        sess.set("welloby.signup", ""); sess.set("welloby.next", "");
        WC.acceptTerms();
        WC.setSession(r2.token, r2.user);
        toWelcome(r2.mailSent, nextOk);
      } catch (err) { formErr(f, err.message); }
    }));
  });

  page(/^\/forgot$/, async (m, q) => {
    const off = health().mail === false;
    show(`
      <section class="authpage"><div class="authbg" aria-hidden="true"></div>
        <form class="authcard notch" data-forgot>
          <p class="kicker">Locked out?</p><h1>Reset your password</h1>
          ${off ? '<p class="authlede">Reset emails aren\'t switched on yet. Ask an admin on <a href="https://discord.gg/cwHKDtXQWD" target="_blank" rel="noopener">Discord</a> for a temporary password.</p>'
            : `<p class="authlede">Enter your nickname or email. If the account has a confirmed email, we'll send a link to choose a new password.</p>
          <label class="fld"><span>Nickname or email</span><input name="login" required maxlength="254" autocomplete="username" spellcheck="false" autocapitalize="off"></label>
          ${errBox()}
          <button class="btn btn-lava btn-l" type="submit">Send the link</button>`}
          <p class="authalt"><a href="#/login">Back to sign in</a></p>
          ${off ? "" : '<p class="fine">No confirmed email on the account? Ask an admin on Discord for a temporary password.</p>'}
        </form>
      </section>`, "Reset your password", () => { const i = $("input[name=login]", app); if (i) i.focus(); });
    on("submit", "[data-forgot]", (e, f) => busy($("button[type=submit]", f), async () => {
      formErr(f, "");
      try {
        const r = await api("/auth/forgot", { body: { login: f.login.value.trim() } });
        show(authCard("Check your email", "Link on its way", `<p>${esc(r.message)}</p>`, [["#/login", "Back to sign in"]]), "Reset your password");
      } catch (err) { formErr(f, err.message); }
    }));
  });

  page(/^\/reset$/, async (m, q) => {
    const fresh = q.get("t");
    if (fresh) { sess.set("welloby.reset", fresh); forget("/reset"); }
    const t = fresh || sess.get("welloby.reset") || "";
    if (!t) { show(authCard("Reset your password", "That link isn't complete", "<p>Open the link from the email again, or ask for a new one.</p>", [["#/forgot", "Send a new link"], ["#/login", "Sign in"]]), "Reset your password"); return; }
    show(`
      <section class="authpage"><div class="authbg" aria-hidden="true"></div>
        <form class="authcard notch" data-reset>
          <p class="kicker">Almost back in</p><h1>New password</h1>
          ${newPwFields("New password <small>at least 8 characters</small>", "Type it again")}
          ${errBox()}
          <button class="btn btn-lava btn-l" type="submit">Save and sign in</button>
          <p class="fine">This signs you out on every other device.</p>
        </form>
      </section>`, "New password", () => $("input[name=password]", app).focus());
    pwHandlers();
    on("submit", "[data-reset]", (e, f) => busy($("button[type=submit]", f), async () => {
      formErr(f, "");
      if (f.password.value !== f.password2.value) { formErr(f, "The two passwords don't match."); return; }
      try {
        const r = await api("/auth/reset", { body: { t, password: f.password.value, password2: f.password2.value } });
        sess.set("welloby.reset", "");
        if (r.token) { WC.setSession(r.token, r.user); toast("Password changed. You're signed in."); go("#/"); }
        else show(authCard("Password changed", "Done", "<p>The password is changed, but this account is banned, so it can't sign in.</p>", [["#/", "Community"]]), "Password changed");
      } catch (err) {
        if (err.code === "token") {
          sess.set("welloby.reset", "");
          show(authCard("Reset your password", "That link has run out", `<p>${esc(err.message)}</p>`, [["#/forgot", "Send a new link"]]), "Reset your password");
        } else formErr(f, err.message);
      }
    }));
  });

  page(/^\/verify$/, async (m, q, stale) => {
    const t = q.get("t");
    if (t) forget("/verify");
    const out = me() ? [["#/settings", "Back to Settings"], ["#/", "Community"]] : [["#/login", "Sign in"], ["#/", "Community"]];
    if (!t) { show(authCard("Confirm your email", "Open the link again", "<p>This page needs the link from the email. Open it again, or send a new one from Settings.</p>", out), "Confirm your email"); return; }
    try {
      const r = await api("/auth/verify", { body: { t } });
      if (stale()) return;
      if (me()) await WC.refreshMe();
      show(authCard("All set", "Email confirmed", `<p><b>${esc(r.email)}</b> is ${r.field === "recovery" ? "your recovery email now" : "confirmed"}. If you ever forget your password, a reset link can go there.</p>`, out),
        "Email confirmed", () => setTimeout(() => burstAt($("h1", app), 30), 200));
    } catch (err) {
      if (!stale()) show(authCard("Confirm your email", "That link didn't work", `<p>${esc(err.message)}</p>`, out), "Confirm your email");
    }
  });

  page(/^\/welcome$/, async (m, q) => {
    const u = me();
    if (!u) { go("#/register"); return; }
    store.set(startKey(u), "on");
    const a = u.account || {};
    const mailNote = a.email && !a.emailVerified
      ? `<p class="mail-note">${q.get("mail") === "1" ? `We sent a link to <b>${esc(a.email)}</b>. Open it to confirm your email; it's how you get back in if you ever forget your password.` : `Your email isn't confirmed yet. You can send the link from <a href="#/settings">Settings</a>.`}</p>` : "";
    show(`
      <section class="authpage welcome"><div class="authbg" aria-hidden="true"></div>
        <div class="welcomecard">
          <div class="welcome-face" data-face>${head(u, 150, "hd-xl")}</div>
          <p class="kicker">It's official</p><h1>Welcome, ${esc(u.name)}</h1>
          <p class="mast-lede">Your name is on the record. Here's what to do next.</p>
          ${mailNote}
          <ul class="next" data-stagger>
            <li><a href="#/settings" class="glow">${icon("i-edit")}<b>Set up your profile</b><span>Bio, playstyle, when you started, and a new face if you don't like this one.</span></a></li>
            <li><a href="#/clans" class="glow">${icon("i-users")}<b>Find a clan</b><span>Or found your own and design its banner.</span></a></li>
            <li><a href="#/new/general" class="glow">${icon("i-chat")}<b>Say hi on the board</b><span>Introduce yourself, or complain about the skeleton that killed you.</span></a></li>
          </ul>
          <p class="muted">These three stay at the top of the community pages until they're done, so there's no need to come back here.</p>
          ${nextHash(q) ? `<p><a class="btn btn-lava" href="${esc(nextHash(q))}">Back to where you were</a></p>` : ""}
        </div>
      </section>`, "Welcome", () => setTimeout(() => burstAt($("[data-face]", app), 40), 250));
  });

  page(/^\/settings$/, async (m, q, stale) => {
    const u0 = me();
    if (!u0) { show(`<section class="pagehead"><div class="wrap"><h1>Settings</h1></div></section><div class="wrap narrow">${needSignIn("to change your settings")}</div>`, "Settings"); return; }
    const u = await WC.refreshMe();
    if (stale() || !u) return;
    const a = Object.assign({ email: "", emailVerified: false, recovery: "", recoveryVerified: false, hasPassword: true, linked: [] }, u.account || {});
    const mailOn = health().mail !== false;
    const ps = providers();
    let avatar = u.avatar || 0;
    const months = [];
    for (let d = new Date(Date.UTC(2026, 8, 1)); d <= new Date(); d.setUTCMonth(d.getUTCMonth() + 1)) months.push(d.toISOString().slice(0, 7));
    const chip = ok => ok ? '<span class="chip chip-ok">Confirmed</span>' : '<span class="chip chip-warn">Not confirmed</span>';
    const resend = field => mailOn ? ` <button type="button" class="link" data-resend="${field}">Send the link again</button>` : " Confirmation emails aren't switched on yet.";
    const rows = [...new Set([...ps, ...a.linked.map(l => l.provider)])].filter(p => BRANDS[p]);
    const linkedRow = p => {
      const l = a.linked.find(x => x.provider === p);
      return `<li><span class="lk-ico is-${p}">${BRANDS[p].svg}</span><div><b>${BRANDS[p].name}</b><small>${l ? "Connected" + (l.name ? " as " + esc(l.name) : "") : "Not connected"}</small></div>
        ${l ? `<button type="button" class="link danger" data-unlink="${p}">Disconnect</button>` : ps.includes(p) ? `<button type="button" class="btn btn-line btn-s" data-social="${p}" data-mode="link">Connect</button>` : ""}</li>`;
    };
    const via = a.linked.map(l => brandName(l.provider)).join(" or ") || "another site";
    show(`
      <section class="pagehead"><div class="wrap"><p class="kicker">${esc(u.name)}</p><h1>Settings</h1></div></section>
      <div class="wrap settings">
        <div class="settings-main">
          <form class="card form" data-profile>
            <h2>Profile</h2>
            <div class="facepick"><div data-face>${head(u, 112, "hd-xl")}</div><div><p>Your face is made from your name. Roll a new one until it looks like you.</p>
              <p><button type="button" class="btn btn-ink btn-s" data-reroll>${icon("i-dice")}New face</button> <button type="button" class="btn btn-line btn-s" data-original>Original</button></p></div></div>
            <label class="fld"><span>In-game name <small>optional; vote rewards go here</small></span>
              <input name="ign" value="${esc(u.ign || "")}" maxlength="17" spellcheck="false" autocapitalize="off" autocomplete="off" data-ign>
              <small class="fld-note" data-ignnote aria-live="polite">${u.ign ? (u.verified ? "Checked by the staff." : "The staff haven't checked it yet. Changing it means they check again.") : "Your Minecraft name, so vote rewards reach you and players know who you are in game."}</small></label>
            <label class="fld"><span>Bio <small>500 characters, formatting works</small></span><textarea name="bio" rows="4" maxlength="500">${esc(u.bio)}</textarea></label>
            <fieldset class="fld"><legend>Playstyle <small>pick up to three</small></legend><div class="tagpick">${Object.entries(TAG_NAMES).map(([k, l]) => `<label><input type="checkbox" name="tags" value="${k}"${u.tags.includes(k) ? " checked" : ""}><span>${l}</span></label>`).join("")}</div></fieldset>
            <label class="fld"><span>Playing since</span><select name="since"><option value="">Not saying</option>${months.map(mo => `<option value="${mo}"${u.since === mo ? " selected" : ""}>${new Date(mo + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</option>`).join("")}</select></label>
            ${errBox()}
            <p class="form-acts"><button class="btn btn-lava" type="submit">Save profile</button><a class="btn btn-line" href="${WC.userHref(u)}">View profile</a></p>
          </form>
          <form class="card form" data-email id="email"><h2>Email</h2>
            ${a.email ? `<p class="acct-line"><b>${esc(a.email)}</b>${chip(a.emailVerified)}</p>${a.emailVerified ? "" : `<p class="fine">Open the link we sent to confirm it.${resend("email")}</p>`}`
              : '<p class="mail-note">Add an email so you can get back in if you ever forget your password.</p>'}
            <label class="fld"><span>${a.email ? "Change it to" : "Your email"}</span><input name="email" type="email" inputmode="email" autocomplete="email" required maxlength="254" spellcheck="false" autocapitalize="off"></label>
            ${a.hasPassword ? '<label class="fld"><span>Your password <small>to show it\'s you</small></span><input name="password" type="password" autocomplete="current-password" required maxlength="200"></label>' : ""}
            ${errBox()}<p class="form-acts"><button class="btn btn-ink" type="submit">${a.email ? "Change email" : "Add email"}</button></p>
            <p class="fine">Only you see it. Password reset links go here.</p></form>
          <form class="card form" data-recovery><h2>Recovery email <small class="h-aside">optional</small></h2>
            ${a.recovery ? `<p class="acct-line"><b>${esc(a.recovery)}</b>${chip(a.recoveryVerified)}</p>${a.recoveryVerified ? "" : `<p class="fine">Open the link we sent to confirm it.${resend("recovery")}</p>`}`
              : '<p class="fine">A second address for reset links, in case you lose access to the first one.</p>'}
            <label class="fld"><span>${a.recovery ? "Change it to" : "Recovery email"}</span><input name="email" type="email" inputmode="email" autocomplete="email" required maxlength="254" spellcheck="false" autocapitalize="off"></label>
            ${errBox()}<p class="form-acts"><button class="btn btn-ink" type="submit">Save recovery email</button>${a.recovery ? '<button type="button" class="btn btn-line" data-recovery-off>Remove it</button>' : ""}</p></form>
        </div>
        <div class="settings-side">
          <div class="card form"><h2>Sign-in methods</h2>
            <ul class="linked">
              <li><span class="lk-ico is-pass">${KEY_ICON}</span><div><b>Password</b><small>${a.hasPassword ? "Set. Sign in with your name or email." : "Not set yet. Add one below."}</small></div></li>
              ${rows.map(linkedRow).join("")}
            </ul>
            <p class="fine">${ps.length ? "Connect one and you can sign in with a single click. The other site never sees your Welloby password." : "Signing in with Google, Discord or Facebook isn't switched on yet."}</p>
          </div>
          <form class="card form" data-password><h2>${a.hasPassword ? "Change password" : "Set a password"}</h2>
            ${a.hasPassword ? `<label class="fld"><span>Current password</span>${pwBox("current", "current-password", "required")}</label>`
              : `<p class="fine">You sign in with ${esc(via)}. A password lets you sign in with your name or email too.</p>`}
            ${newPwFields("New password <small>at least 8 characters</small>", "Type it again", true, ["next", "next2"])}
            ${errBox()}<p class="form-acts"><button class="btn btn-ink" type="submit">${a.hasPassword ? "Change password" : "Set password"}</button></p>
            ${a.hasPassword ? '<p class="fine">Changing it signs you out everywhere else.</p>' : ""}</form>
          <form class="card form" data-dmprefs id="messages"><h2>Messages</h2>
            <fieldset class="fld"><legend>Who can start a chat with you</legend>
              ${[["all", "Everyone"], ["clan", "Only my clan"], ["none", "Nobody"]].map(([v, l]) => `<label class="check"><input type="radio" name="dmFrom" value="${v}"${(a.dmFrom || "all") === v ? " checked" : ""}><span>${l}</span></label>`).join("")}</fieldset>
            <p class="fine">Chats you already have keep working, and the staff can always reach you. To stop one player, block them from your chat with them.</p>
            ${errBox()}<p class="form-acts"><button class="btn btn-ink" type="submit">Save</button></p>
            <h3 class="mini">Blocked players</h3><div data-blocks><p class="muted">Loading...</p></div></form>
          <div class="card form"><h2>Sessions</h2><p class="fine">Signed in on a computer that isn't yours?</p><p class="form-acts"><button type="button" class="btn btn-line" data-everywhere>Sign out everywhere</button></p></div>
          <form class="card form danger-zone" data-delete><h2>Delete account</h2>
            <p class="fine">Your name, email, profile, sign-ins and clan role go, and you leave your group chats. Your posts and messages stay up as "Deleted player" so threads and chats still make sense. If you lead a clan, the next officer takes over.</p>
            ${a.hasPassword ? '<label class="fld"><span>Type your password to confirm</span><input name="password" type="password" autocomplete="current-password" required></label>'
              : `<label class="fld"><span>Type your nickname, ${esc(u.name)}, to confirm</span><input name="confirm" autocomplete="off" required spellcheck="false" autocapitalize="off"></label>`}
            ${errBox()}<p class="form-acts"><button class="btn btn-line btn-danger" type="submit">Delete my account</button></p></form>
        </div>
      </div>`, "Settings");
    const paintBlocks = list => {
      const box = $("[data-blocks]", app);
      if (box) box.innerHTML = list.length ? `<ul class="chat-members">${list.map(p => `<li>${who(p, 24, { badges: false })}<button type="button" class="link" data-unblock="${esc(p.name)}">Unblock</button></li>`).join("")}</ul>`
        : '<p class="muted">Nobody. Block someone from your chat with them.</p>';
    };
    api("/blocks").then(r => { if (!stale()) paintBlocks(r.blocked); }).catch(() => paintBlocks([]));
    on("submit", "[data-dmprefs]", (e, f) => busy($("button[type=submit]", f), async () => {
      formErr(f, "");
      try {
        const r = await api("/me", { method: "PATCH", body: { dmFrom: (f.querySelector("input[name=dmFrom]:checked") || {}).value || "all" } });
        WC.setSession(store.get("welloby.session"), r.user);
        toast("Saved");
      } catch (err) { formErr(f, err.message); }
    }));
    on("click", "[data-unblock]", (e, b) => busy(b, async () => {
      try { await api("/blocks/" + enc(b.dataset.unblock), { method: "DELETE" }); toast(b.dataset.unblock + " is unblocked"); paintBlocks((await api("/blocks")).blocked); }
      catch (err) { toast(err.message); }
    }));
    const paintFace = () => { $("[data-face]", app).innerHTML = head({ name: u.name, avatar }, 112, "hd-xl"); };
    const redraw = r => { if (r && r.user) WC.setSession(store.get("welloby.session"), r.user); route(); };
    pwHandlers();
    nameChecker();
    onSocial("#/settings");
    on("click", "[data-reroll]", () => { avatar = (avatar + 1 + ((Math.random() * 50) | 0)) % 99999; paintFace(); });
    on("click", "[data-original]", () => { avatar = 0; paintFace(); });
    on("change", "[data-profile] input[name=tags]", (e, i) => {
      const on_ = $$("[data-profile] input[name=tags]:checked", app);
      if (on_.length > 3) { i.checked = false; toast("Three is the limit"); }
    });
    on("submit", "[data-profile]", (e, f) => busy($("button[type=submit]", f), async () => {
      formErr(f, "");
      try {
        const r = await api("/me", { method: "PATCH", body: { bio: f.bio.value, tags: $$("input[name=tags]:checked", f).map(i => i.value), since: f.since.value, avatar, ign: f.ign.value.trim() } });
        WC.setSession(store.get("welloby.session"), r.user);
        toast("Profile saved");
        if ((r.user.ign || "") !== (u.ign || "")) route();
      } catch (err) { formErr(f, err.message); }
    }));
    on("submit", "[data-email]", (e, f) => busy($("button[type=submit]", f), async () => {
      formErr(f, "");
      try {
        const r = await api("/me/email", { method: "PUT", body: { email: f.email.value.trim(), password: f.password ? f.password.value : "" } });
        toast(r.mailSent ? "Saved. Check your inbox to confirm it." : "Email saved");
        redraw(r);
      } catch (err) { formErr(f, err.message); }
    }));
    on("submit", "[data-recovery]", (e, f) => busy($("button[type=submit]", f), async () => {
      formErr(f, "");
      try {
        const r = await api("/me/recovery", { method: "PUT", body: { email: f.email.value.trim() } });
        toast(r.mailSent ? "Saved. Check that inbox to confirm it." : "Recovery email saved");
        redraw(r);
      } catch (err) { formErr(f, err.message); }
    }));
    on("click", "[data-recovery-off]", (e, b) => twice(b, () => busy(b, async () => {
      try { redraw(await api("/me/recovery", { method: "DELETE" })); toast("Recovery email removed"); } catch (err) { toast(err.message); }
    }), "Click again to remove it"));
    on("click", "[data-resend]", (e, b) => busy(b, async () => {
      try { await api("/me/email/resend", { body: { field: b.dataset.resend } }); toast("Sent. Check your inbox, and the spam folder."); } catch (err) { toast(err.message); }
    }));
    on("click", "[data-unlink]", (e, b) => twice(b, () => busy(b, async () => {
      try { redraw(await api("/me/identities/" + enc(b.dataset.unlink), { method: "DELETE" })); toast(brandName(b.dataset.unlink) + " disconnected"); } catch (err) { toast(err.message); }
    }), "Click again to disconnect"));
    on("submit", "[data-password]", (e, f) => busy($("button[type=submit]", f), async () => {
      formErr(f, "");
      if (f.next.value !== f.next2.value) { formErr(f, "The two passwords don't match."); return; }
      try {
        const r = await api("/me/password", { body: { current: f.current ? f.current.value : "", next: f.next.value, next2: f.next2.value } });
        toast(a.hasPassword ? "Password changed" : "Password set. You can sign in with it now.");
        redraw(r);
      } catch (err) { formErr(f, err.message); }
    }));
    on("click", "[data-everywhere]", (e, b) => twice(b, () => busy(b, async () => { await WC.signOut(true); toast("Signed out everywhere"); go("#/"); }), "Click again to sign out everywhere"));
    on("submit", "[data-delete]", (e, f) => {
      const b = $("button[type=submit]", f);
      twice(b, () => busy(b, async () => {
        formErr(f, "");
        try {
          await api("/me", { method: "DELETE", body: f.password ? { password: f.password.value } : { confirm: f.confirm.value } });
          WC.setSession(null, null); toast("Your account is deleted"); go("#/");
        } catch (err) { formErr(f, err.message); }
      }), "Click again to delete forever");
    });
  });

  /* ======================================================== STAFF DESK */
  page(/^\/admin(?:\/([a-z]+))?$/, async (m, q, stale) => {
    const u = me();
    if (!u || u.role === "player") { show(`<section class="pagehead"><div class="wrap"><h1>Staff desk</h1></div></section><div class="wrap narrow">${empty("This page is for the server staff.")}</div>`, "Staff desk"); return; }
    const tab = m[1] || "reports", admin = u.role === "admin";
    const tabs = [["reports", "Reports"], ["players", "Players"], ["servers", "Servers"], ["supporters", "Supporters"], ["log", "Log"]];
    const dots = { reports: (u.reports || 0) - (u.serverReports || 0), servers: u.serverReports || 0 };
    let body = "";
    if (tab === "reports") {
      const [d, dm] = await Promise.all([api("/admin/reports"), api("/admin/chat-reports").catch(() => ({ reports: [] }))]);
      if (stale()) return;
      const posts = d.reports.length ? `<h2 class="staff-h">Reported posts</h2><ul class="reports">${d.reports.map(r => `<li class="card" data-rep="${r.id}">
        <p class="rep-top"><b>${esc(r.reason)}</b><small>reported by ${esc(r.by || "someone")} \u00b7 ${ago(r.created)}</small></p>
        <div class="rep-post">${head(r.author, 32)}<div><p><a href="${WC.userHref(r.author)}">${esc(r.author.name)}</a> in <a href="#/t/${r.post.thread}?p=${r.post.id}">${esc(r.post.title)}</a></p><div class="post-body">${format(r.post.body)}</div></div></div>
        <p class="form-acts"><button type="button" class="btn btn-line btn-s btn-danger" data-repact="delete">Remove the post</button><button type="button" class="btn btn-line btn-s" data-repact="dismiss">It's fine</button></p></li>`).join("")}</ul>` : "";
      const where = { dm: "a private chat", group: "a group chat", clan: "a clan chat" };
      const chats = dm.reports.length ? `<h2 class="staff-h">Reported messages</h2><p class="fine">You see the reported message as it was when it was reported, and nothing else from the chat.</p>
        <ul class="reports">${dm.reports.map(r => `<li class="card" data-crep="${r.id}">
        <p class="rep-top"><b>${esc(r.reason)}</b><small>reported by ${esc(r.by || "someone")} \u00b7 ${ago(r.created)}</small></p>
        <div class="rep-post">${head(r.author || { deleted: true }, 32)}<div><p>${r.author ? `<a href="${WC.userHref(r.author)}">${esc(r.author.name)}</a>` : "Deleted player"} in ${where[r.message.chat] || "a chat that's gone now"}${r.message.deleted ? " \u00b7 already deleted" : ""}</p><div class="post-body">${format(r.message.body)}</div></div></div>
        <p class="form-acts">${r.message.deleted ? "" : '<button type="button" class="btn btn-line btn-s btn-danger" data-crepact="delete">Delete the message</button>'}<button type="button" class="btn btn-line btn-s" data-crepact="dismiss">${r.message.deleted ? "Close the report" : "It's fine"}</button></p></li>`).join("")}</ul>` : "";
      body = posts + chats || empty("No open reports. Quiet day.");
    } else if (tab === "players") {
      const term = q.get("q") || "";
      const d = await api("/admin/users?q=" + enc(term));
      if (stale()) return;
      body = `<form class="filters" data-asearch><label class="sr-only" for="aq">Find a player</label><input id="aq" name="q" type="search" value="${esc(term)}" placeholder="Find a player"><button class="btn btn-ink btn-s" type="submit">Find</button></form>
        <p class="fine">Temporary passwords appear once. Copy them and send them to the player privately.</p>
        <ul class="ausers">${d.users.map(p => `<li class="card${p.banned ? " is-banned" : ""}" data-uid="${p.id}" data-uname="${esc(p.name)}" data-uign="${esc(p.ign || "")}">
          <div class="au-id">${head(p, 36)}<div><a href="${WC.userHref(p)}"><b>${esc(p.name)}</b></a>${badges(p, true)}<small>${p.ign ? "in game " + esc(p.ign) : "no in-game name"} \u00b7 ${esc(p.role)} \u00b7 joined ${ago(p.created)} \u00b7 ${plural(p.posts, "post")}${p.banned ? ` \u00b7 <b class="war">banned</b>${p.banReason ? ": " + esc(p.banReason) : ""}` : ""}</small></div></div>
          <div class="au-acts">
            ${p.ign ? `<button type="button" class="link" data-uact="verify" data-v="${p.verified ? 0 : 1}">${p.verified ? "Unverify" : "Verify in-game name"}</button>` : ""}
            ${p.id !== u.id ? (p.banned ? '<button type="button" class="link" data-uact="unban">Unban</button>' : '<button type="button" class="link danger" data-uact="ban">Ban</button>') : ""}
            ${admin && p.id !== u.id ? `<label class="fld-inline"><span class="sr-only">Role</span><select data-role>${["player", "mod", "admin"].map(r => `<option${r === p.role ? " selected" : ""}>${r}</option>`).join("")}</select></label>
              <button type="button" class="link" data-uact="rename">Rename</button><button type="button" class="link" data-uact="ign">In-game name</button><button type="button" class="link" data-uact="reset">Reset password</button>` : ""}
          </div><div class="au-out" data-out></div></li>`).join("")}</ul>`;
    } else if (tab === "supporters") {
      const d = await api("/admin/supporters");
      if (stale()) return;
      body = `${admin ? `<div class="grid2">
        <form class="card form" data-goal><h2>Monthly goal</h2><label class="fld"><span>Dollars</span><input name="goal" type="number" min="1" max="1000000" value="${d.goal}"></label>${errBox()}<p class="form-acts"><button class="btn btn-ink" type="submit">Save goal</button></p></form>
        <form class="card form" data-addsup><h2>Add a tip by hand</h2><p class="fine">For tips that didn't come through Ko-fi or Buy Me a Coffee.</p>
          <div class="grid2"><label class="fld"><span>Name shown</span><input name="name" required maxlength="60"></label><label class="fld"><span>Amount</span><input name="amount" type="number" min="0.01" step="0.01" required></label></div>
          <div class="grid2"><label class="fld"><span>Link to player <small>optional</small></span><input name="user" maxlength="17"></label><label class="fld"><span>Date <small>optional</small></span><input name="date" type="date"></label></div>
          <label class="fld"><span>Message <small>optional</small></span><input name="message" maxlength="500"></label>
          <label class="check"><input type="checkbox" name="public" checked><span>Show name and message publicly</span></label>${errBox()}
          <p class="form-acts"><button class="btn btn-lava" type="submit">Add</button></p></form></div>` : ""}
        <ul class="asups">${d.supporters.map(s => `<li class="card" data-sid="${s.id}"><div><b>${esc(s.name)}</b>${s.public ? "" : ' <span class="chip">private</span>'}<small>${money(s.amount, s.currency)} \u00b7 ${esc(s.source)} \u00b7 ${ago(s.at)}${s.user ? ` \u00b7 linked to <a href="#/u/${enc(s.user)}">${esc(s.user)}</a>` : ""}</small>${s.message ? `<q>${esc(s.message)}</q>` : ""}</div>
          ${admin ? `<div class="au-acts"><button type="button" class="link" data-link>${s.user ? "Change link" : "Link to player"}</button><button type="button" class="link danger" data-delsup>Remove</button></div>` : ""}</li>`).join("") || "<li class='muted'>No tips recorded yet.</li>"}</ul>`;
    } else if (tab === "servers") {
      const d = await api("/admin/servers");
      if (stale()) return;
      body = `${d.reports.length ? `<h2 class="staff-h">Open reports</h2><ul class="reports">${d.reports.map(r => `<li class="card" data-srep="${r.id}">
          <p class="rep-top"><b>${esc(r.reason)}</b><small>reported by ${esc(r.by || "someone")} \u00b7 ${ago(r.created)}</small></p>
          <p>About ${r.server.name ? `<a href="#/s/${r.server.id}">${esc(r.server.name)}</a>` : "a listing that's gone now"}</p>
          <p class="form-acts"><button type="button" class="btn btn-line btn-s" data-srepdone>Close the report</button></p></li>`).join("")}</ul>` : ""}
        <h2 class="staff-h">Listed servers</h2>
        <p class="fine">Hidden servers stay reachable by their link but drop off the list. Only admins can feature a server; featured ones sit at the top.</p>
        <ul class="ausers asrv">${d.servers.map(s => `<li class="card${s.hidden ? " is-banned" : ""}" data-srv="${s.id}">
          <div class="au-id">${srvIcon(s, 36)}<div><a href="#/s/${s.id}"><b>${esc(s.name)}</b></a>${s.verified ? '<span class="bdg bdg-ver" title="Verified owner">\u2713</span>' : ""}${s.featured ? '<span class="chip chip-feat">Featured</span>' : ""}
            <small>${esc(s.edition === "bedrock" ? s.host : javaAddr(s))} \u00b7 ${plural(s.votes.month, "vote")} this month \u00b7 ${s.owner ? "by " + esc(s.owner.name) : "no owner"} \u00b7 listed ${ago(s.created)}${s.hidden ? ' \u00b7 <b class="war">hidden</b>' : ""}</small></div></div>
          <div class="au-acts">
            ${admin ? `<button type="button" class="link" data-sact="${s.featured ? "unfeature" : "feature"}">${s.featured ? "Unfeature" : "Feature"}</button>` : ""}
            <button type="button" class="link" data-sact="${s.verified ? "unverify" : "verify"}">${s.verified ? "Take the check mark away" : "Mark as verified"}</button>
            <button type="button" class="link${s.hidden ? "" : " danger"}" data-sact="${s.hidden ? "unhide" : "hide"}">${s.hidden ? "Show on the list" : "Hide from the list"}</button>
          </div></li>`).join("") || "<li class='muted'>No servers listed yet.</li>"}</ul>`;
    } else if (tab === "log") {
      const d = await api("/admin/log");
      if (stale()) return;
      body = d.log.length ? `<table class="log"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Target</th></tr></thead><tbody>${d.log.map(l => `<tr><td>${when(l.at)}</td><td>${esc(l.by || "?")}</td><td>${esc(l.action)}</td><td>${esc(l.target)}${l.detail ? `<small>${esc(l.detail)}</small>` : ""}</td></tr>`).join("")}</tbody></table>` : empty("Nothing logged yet.");
    }
    show(`
      <section class="pagehead"><div class="wrap"><p class="kicker">${esc(u.role === "admin" ? "Admin" : "Moderator")}</p><h1>Staff desk</h1>
        <nav class="tabsnav" aria-label="Staff desk">${tabs.map(([k, l]) => `<a href="#/admin/${k}"${k === tab ? ' aria-current="page"' : ""}>${l}${dots[k] > 0 ? ` <i class="acct-dot">${dots[k]}</i>` : ""}</a>`).join("")}</nav></div></section>
      <div class="wrap staff">${body}</div>`, "Staff desk");
    on("click", "[data-sact]", (e, b) => busy(b, async () => {
      try { await api(`/admin/servers/${b.closest("[data-srv]").dataset.srv}`, { body: { action: b.dataset.sact } }); toast("Done"); route(); } catch (err) { toast(err.message); }
    }));
    on("click", "[data-srepdone]", (e, b) => busy(b, async () => {
      try { await api(`/admin/server-reports/${b.closest("[data-srep]").dataset.srep}`, { body: {} }); toast("Report closed"); await WC.refreshMe(); route(); } catch (err) { toast(err.message); }
    }));
    on("click", "[data-repact]", (e, b) => busy(b, async () => {
      const id = b.closest("[data-rep]").dataset.rep;
      try { await api(`/admin/reports/${id}`, { body: { action: b.dataset.repact } }); toast(b.dataset.repact === "delete" ? "Post removed" : "Report closed"); await WC.refreshMe(); route(); }
      catch (err) { toast(err.message); }
    }));
    on("click", "[data-crepact]", (e, b) => busy(b, async () => {
      const id = b.closest("[data-crep]").dataset.crep;
      try { await api(`/admin/chat-reports/${id}`, { body: { action: b.dataset.crepact } }); toast(b.dataset.crepact === "delete" ? "Message deleted" : "Report closed"); await WC.refreshMe(); route(); }
      catch (err) { toast(err.message); }
    }));
    on("submit", "[data-asearch]", (e, f) => go("#/admin/players" + (f.q.value.trim() ? "?q=" + enc(f.q.value.trim()) : "")));
    on("click", "[data-uact]", (e, b) => {
      const li = b.closest("[data-uid]"), id = li.dataset.uid, name = li.dataset.uname, out = $("[data-out]", li), act = b.dataset.uact;
      const send = body => busy(b, async () => {
        try { const r = await api(`/admin/users/${id}`, { body }); if (r.password) { out.innerHTML = `<p class="temp">Temporary password for ${esc(name)}: <code>${esc(r.password)}</code> <button type="button" class="link" data-copy="${esc(r.password)}" data-copy-label="the temporary password">Copy</button></p>`; } else { toast("Done"); route(); } }
        catch (err) { toast(err.message); }
      });
      if (act === "ban") {
        out.innerHTML = `<form class="inline" data-banform><label class="fld"><span>Reason the player will see</span><input name="reason" maxlength="200" required placeholder="Reason..."></label><button class="btn btn-ink btn-s" type="submit">Ban ${esc(name)}</button></form>`;
        $("input", out).focus();
      } else if (act === "rename") {
        out.innerHTML = `<form class="inline" data-renamef><label class="fld"><span>New nickname</span><input name="name" maxlength="20" required value="${esc(name)}"></label><button class="btn btn-ink btn-s" type="submit">Rename</button></form>`;
      } else if (act === "ign") {
        out.innerHTML = `<form class="inline" data-ignf><label class="fld"><span>In-game name <small>empty clears it</small></span><input name="ign" maxlength="17" value="${esc(li.dataset.uign || "")}"></label><button class="btn btn-ink btn-s" type="submit">Save</button></form>`;
        $("input", out).focus();
      } else if (act === "reset") twice(b, () => send({ action: "reset" }), "Reset? Click again");
      else if (act === "verify") send({ action: "verify", value: b.dataset.v === "1" });
      else send({ action: act });
    });
    on("submit", "[data-banform]", (e, f) => busy($("button", f), async () => {
      try { await api(`/admin/users/${f.closest("[data-uid]").dataset.uid}`, { body: { action: "ban", reason: f.reason.value } }); toast("Banned"); route(); } catch (err) { toast(err.message); }
    }));
    on("submit", "[data-renamef]", (e, f) => busy($("button", f), async () => {
      try { await api(`/admin/users/${f.closest("[data-uid]").dataset.uid}`, { body: { action: "rename", name: f.name.value } }); toast("Renamed"); route(); } catch (err) { toast(err.message); }
    }));
    on("submit", "[data-ignf]", (e, f) => busy($("button", f), async () => {
      try { await api(`/admin/users/${f.closest("[data-uid]").dataset.uid}`, { body: { action: "ign", ign: f.ign.value.trim() } }); toast(f.ign.value.trim() ? "In-game name saved" : "In-game name cleared"); route(); } catch (err) { toast(err.message); }
    }));
    on("change", "[data-role]", async (e, s) => {
      try { await api(`/admin/users/${s.closest("[data-uid]").dataset.uid}`, { body: { action: "role", role: s.value } }); toast("Role changed to " + s.value); } catch (err) { toast(err.message); route(); }
    });
    on("submit", "[data-goal]", (e, f) => busy($("button", f), async () => { try { await api("/admin/settings", { method: "PUT", body: { goal: Number(f.goal.value) } }); toast("Goal saved"); } catch (err) { formErr(f, err.message); } }));
    on("submit", "[data-addsup]", (e, f) => busy($("button", f), async () => {
      try { await api("/admin/supporters", { body: { name: f.name.value, amount: Number(f.amount.value), user: f.user.value.trim(), date: f.date.value, message: f.message.value, public: f.public.checked } }); toast("Added"); route(); }
      catch (err) { formErr(f, err.message); }
    }));
    on("click", "[data-link]", (e, b) => {
      const li = b.closest("[data-sid]");
      if ($("form", li)) return;
      li.insertAdjacentHTML("beforeend", `<form class="inline" data-linkf><label class="fld"><span>Player name, or leave empty to unlink</span><input name="user" maxlength="17"></label><button class="btn btn-ink btn-s" type="submit">Save</button></form>`);
    });
    on("submit", "[data-linkf]", (e, f) => busy($("button", f), async () => {
      try { await api(`/admin/supporters/${f.closest("[data-sid]").dataset.sid}`, { method: "PATCH", body: { user: f.user.value.trim() } }); toast("Saved"); route(); } catch (err) { toast(err.message); }
    }));
    on("click", "[data-delsup]", (e, b) => twice(b, () => busy(b, async () => {
      try { await api(`/admin/supporters/${b.closest("[data-sid]").dataset.sid}`, { method: "DELETE" }); toast("Removed"); route(); } catch (err) { toast(err.message); }
    }), "Remove?"));
  });

  /* ---------- states ---------- */
  function offline() {
    show(`<section class="authpage"><div class="authbg" aria-hidden="true"></div><div class="authcard notch">
      <p class="kicker">Community</p><h1>The board is getting set up</h1>
      <p>Accounts, clans and the board open here soon. Until then, everything happens on Discord.</p>
      <p class="form-acts"><a class="btn btn-lava" href="https://discord.gg/cwHKDtXQWD" target="_blank" rel="noopener">Open the Discord</a><a class="btn btn-line" href="index.html">Back to the server page</a></p></div></section>`, "Community");
  }
  function notFound() {
    show(`<section class="pagehead"><div class="wrap"><h1>Nothing here</h1></div></section><div class="wrap narrow">${empty("That page doesn't exist.", '<a class="btn btn-lava btn-s" href="#/">Back to the community</a>')}</div>`, "Not found");
  }
  function failed(e) {
    const gone = e && e.status === 404;
    show(`<section class="pagehead"><div class="wrap"><h1>${gone ? "Not found" : "That didn't load"}</h1></div></section>
      <div class="wrap narrow">${empty(esc(e && e.message ? e.message : "Something went wrong."), gone ? '<a class="btn btn-lava btn-s" href="#/">Back to the community</a>' : '<button type="button" class="btn btn-lava btn-s" data-retry>Try again</button>')}</div>`, gone ? "Not found" : "Error");
    on("click", "[data-retry]", () => route());
  }

  /* quick-jump palette entries for this page */
  addEventListener("DOMContentLoaded", () => window.wellobyPalette && window.wellobyPalette.add([
      { g: "Community", t: "Start a thread", s: "Post on the board", k: "new thread post write forum", run: () => go("#/new") },
      { g: "Community", t: "Found a clan", s: "Design a banner, recruit a crew", k: "clan create new banner", run: () => go("#/clans/new") },
      { g: "Community", t: "Find a player", s: "Everyone who signed up", k: "players profile user search", run: () => go("#/players") },
      { g: "Community", t: "Server list", s: "Find a server and vote once a day", k: "servers server list vote voting", run: () => go("#/servers") },
      { g: "Community", t: "Add your server", s: "List it, verify it, reward voters", k: "add server list my server votifier", run: () => go("#/servers/new") },
      { g: "Community", t: "Search the board", s: "Threads and posts", k: "search forum find", run: () => go("#/search") },
      { g: "Community", t: "Your settings", s: "Profile, email, password, sign-in methods", k: "settings profile account password email recovery google discord facebook", run: () => go("#/settings") },
    ]));
  route();
})();
