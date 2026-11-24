/* Welloby: the live player count and the search (Ctrl K, "/" or the menu's Search row).
   The name is older than the content: the page no longer moves by itself (no reveals, tilts, sparks or scrolling
   text), and every section shows without this file. */
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;
  const fmt = n => Math.round(n).toLocaleString("en-US");

  /* ---------- Back to top, on the pages that have one ---------- */
  const toTop = $("[data-to-top]");
  if (toTop) {
    const place = () => {
      const show = scrollY > innerHeight * 1.2;
      if (show && toTop.hidden) toTop.hidden = false;
      toTop.dataset.show = show ? "1" : "0";
    };
    addEventListener("scroll", place, { passive: true });
    place();
    toTop.addEventListener("click", () => {
      scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
      const b = $(".bar-brand"); if (b) b.focus({ preventScroll: true });
    });
  }

  /* ---------- live player count (the server's own number, as it reports it) ---------- */
  const playerEls = $$("[data-players]");
  addEventListener("welloby:status", e => {
    const d = e.detail || {};
    for (const el of playerEls) {
      if (d.state === "online" && d.players) {
        const n = d.players.online;
        el.textContent = n === 1 ? "1 playing" : fmt(n) + " playing";
        el.hidden = false;
      } else el.hidden = true;
    }
  });

  /* ---------- search ---------- */
  /* a section of this page, or the page that has it now (the map, the games and the planner moved to map.html) */
  const go = (id, page, then) => () => {
    const el = document.getElementById(id);
    if (!el || (page && !document.body.matches(".page-" + page.replace(".html", "")))) { location.href = (page || "index.html") + "#" + id; return; }
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    if (then) setTimeout(then, reduced ? 0 : 450);
  };
  const toast = t => dispatchEvent(new CustomEvent("welloby:toast", { detail: t }));
  const copy = text => () => {
    const b = document.querySelector('[data-copy="' + text + '"]');
    if (b) b.click(); else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast("Copied " + text + "."));
  };
  const open1 = url => () => window.open(url, "_blank", "noopener");
  const items = [
    { g: "Do", t: "Copy the Java address", s: "mc.welloby.com", k: "ip copy server join java", run: copy("mc.welloby.com") },
    { g: "Do", t: "Copy the Bedrock address", s: "bedrock.welloby.com, port 25620", k: "ip copy bedrock phone console port", run: copy("bedrock.welloby.com") },
    { g: "Do", t: "Ask kevzy", s: "The help bot answers right here", k: "help bot question support chat", run: () => window.kevzy && window.kevzy.open(), need: () => !!window.kevzy },
    { g: "Do", t: "Play Spawn Guessr", s: "Find real spots from the 3D map", k: "game play guess arcade mini", run: go("games", "map.html", () => window.wellobyGames && window.wellobyGames.open("guessr")) },
    { g: "Do", t: "Play Elytra Dive", s: "Fly under the Nether roof", k: "game play elytra fly arcade mini", run: go("games", "map.html", () => window.wellobyGames && window.wellobyGames.open("elytra")) },
    { g: "Do", t: "Open the 3D map", s: "The world around spawn", k: "map spawn random roll 3d world", run: go("map", "map.html") },
    { g: "Do", t: "Vote for Welloby", s: "Once a day, small reward in the game", k: "vote list reward", run: () => { location.href = "servers.html#/s/1"; } },
    { g: "Do", t: "Open the Discord", s: "Chat, reports, ban appeals", k: "discord chat community appeal report", run: open1("https://discord.gg/cwHKDtXQWD") },
    /* F56: the website's own words: accounts, clans and the website password */
    { g: "Do", t: "Create a website account", s: "Free. For the Community and the Server list", k: "account sign up register join website profile", run: () => { location.href = "community.html#/register"; } },
    { g: "Do", t: "Find or start a clan", s: "Clans are in the Community", k: "clan clans team teams faction join make start", run: () => { location.href = "community.html#/clans"; } },
    { g: "Do", t: "Forgot your website password?", s: "Get a link to make a new one", k: "password reset forgot lost website account sign in login", run: () => { location.href = "community.html#/forgot"; } },
    { g: "Do", t: "All questions", s: "Every answer on one page", k: "faq questions answers help", run: () => { location.href = "faq.html"; } },
  ];
  /* every official account and every creator, from the site settings */
  const W = window.WELLOBY || {}, L = W.links || {};
  const SOCIAL = { tiktok: "TikTok", instagram: "Instagram", telegram: "Telegram", youtube: "YouTube", x: "X" };
  Object.entries(SOCIAL).forEach(([k, label]) => {
    if (L[k]) items.push({ g: "Follow", t: "Welloby on " + label, s: L[k].replace(/^https?:\/\/(www\.)?/, ""), k: "follow social " + k + " " + label, run: open1(L[k]) });
  });
  (W.creators || []).forEach(c => (c.links || []).forEach(l => items.push({ g: "Follow", t: c.name + " on " + (SOCIAL[l.platform] || l.platform), s: c.about || "", k: "creator streamer video " + c.name + " " + (c.clan || "") + " " + l.platform, run: open1(l.url) })));
  $$(".menu-list a, .menu-more a").forEach(a => items.push({ g: "Go to", t: a.textContent.trim(), s: "", k: "section page", run: () => {
    const h = a.getAttribute("href") || "";
    if (h.startsWith("#") && !h.startsWith("#/") && document.getElementById(h.slice(1))) go(h.slice(1))();
    else location.href = a.href;
  } }));
  /* the answers on this page: the home page's top questions, or all of them on faq.html */
  $$("#faq details").forEach(d => {
    const q = $("summary", d), p = $("p", d);
    if (!q) return;
    items.push({ g: "Answers", t: q.textContent.trim(), s: p ? p.textContent.trim().slice(0, 90) : "", k: d.textContent, run: () => { d.open = true; d.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" }); } });
  });

  let dlg = null, list = null, input = null, shown = [], sel = 0, lastFocus = null;
  function build() {
    dlg = document.createElement("dialog");
    dlg.className = "cmdk";
    dlg.setAttribute("aria-label", "Search the site");
    dlg.innerHTML = '<div class="cmdk-box"><label class="cmdk-in"><svg class="i" aria-hidden="true"><use href="#i-search"/></svg><span class="sr-only">Search</span>' +
      '<input type="text" autocomplete="off" spellcheck="false" enterkeyhint="go" placeholder="Search: a section, an answer, the address" role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-autocomplete="list"><kbd>Esc</kbd></label>' +
      '<ul class="cmdk-list" id="cmdk-list" role="listbox"></ul><p class="cmdk-foot"><span><kbd>&uarr;</kbd><kbd>&darr;</kbd> move</span><span><kbd>Enter</kbd> go</span><span><kbd>Esc</kbd> close</span></p></div>';
    document.body.append(dlg);
    list = $(".cmdk-list", dlg); input = $("input", dlg);
    input.addEventListener("input", () => { sel = 0; render(); });
    input.addEventListener("keydown", e => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % Math.max(1, shown.length);
        paintSel();
      } else if (e.key === "Enter") { e.preventDefault(); pick(sel); }
    });
    list.addEventListener("click", e => { const li = e.target.closest("[data-n]"); if (li) pick(+li.dataset.n); });
    list.addEventListener("pointermove", e => { const li = e.target.closest("[data-n]"); if (li && +li.dataset.n !== sel) { sel = +li.dataset.n; paintSel(); } });
    dlg.addEventListener("click", e => { if (e.target === dlg) close(); });
    dlg.addEventListener("close", () => { root.classList.remove("cmdk-on"); if (lastFocus && lastFocus.focus && lastFocus.getClientRects().length) lastFocus.focus({ preventScroll: true }); });
  }
  function score(it, q) {
    if (!q) return it.g === "Answers" ? 0 : 1;
    const t = it.t.toLowerCase(), all = (it.t + " " + it.s + " " + it.k).toLowerCase();
    let s = 0;
    for (const w of q.split(/\s+/).filter(Boolean)) {
      if (t.startsWith(w)) s += 6; else if (t.includes(w)) s += 4; else if (all.includes(w)) s += 1; else return 0;
    }
    return s;
  }
  const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  function render() {
    const q = input.value.trim().toLowerCase();
    shown = items.filter(it => !it.need || it.need()).map(it => ({ it, s: score(it, q) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 12).map(x => x.it);
    if (!q) shown.sort((a, b) => (a.g === "Do" ? 0 : 1) - (b.g === "Do" ? 0 : 1));
    let html = "", lastG = "";
    shown.forEach((it, n) => {
      if (it.g !== lastG) { html += '<li class="cmdk-g" role="presentation">' + it.g + "</li>"; lastG = it.g; }
      html += '<li role="option" id="cmdk-o' + n + '" data-n="' + n + '"><b>' + esc(it.t) + "</b>" + (it.s ? "<small>" + esc(it.s) + "</small>" : "") + "</li>";
    });
    if (!shown.length) html = '<li class="cmdk-none" role="presentation">' + (window.kevzy ? "Nothing found. Press Enter to ask kevzy, the help bot." : "Nothing found. Try other words, or ask on Discord.") + "</li>";
    list.innerHTML = html;
    paintSel();
  }
  function paintSel() {
    $$("[data-n]", list).forEach(li => li.setAttribute("aria-selected", String(+li.dataset.n === sel)));
    const cur = $('[data-n="' + sel + '"]', list);
    if (cur) { input.setAttribute("aria-activedescendant", cur.id); cur.scrollIntoView({ block: "nearest" }); }
    else input.removeAttribute("aria-activedescendant");
  }
  function pick(n) {
    const it = shown[n];
    const q = input.value.trim();
    close();
    if (it) it.run();
    else if (q && window.kevzy) window.kevzy.open(q);
  }
  function open() {
    if (!dlg) build();
    if (dlg.open) return;
    lastFocus = document.activeElement;
    input.value = ""; sel = 0; render();
    root.classList.add("cmdk-on");
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
    input.focus();
  }
  function close() { if (dlg && dlg.open) { if (dlg.close) dlg.close(); else { dlg.removeAttribute("open"); root.classList.remove("cmdk-on"); } } }
  $$("[data-cmd-open]").forEach(b => b.addEventListener("click", open));
  /* other scripts (the community page) add their own entries */
  window.wellobyPalette = { add: list => { for (const it of list || []) items.push(it); }, open };
  document.addEventListener("keydown", e => {
    const t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey) && !e.altKey) { e.preventDefault(); dlg && dlg.open ? close() : open(); }
    else if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !(t && t.closest && t.closest("canvas, .mapx, .cab"))) { e.preventDefault(); open(); }
  });
})();
