/* Welloby motion layer: scroll progress, reveals, hero parallax, tilt and glow cards,
   magnetic buttons, block bursts, live player count, count-ups, quick-jump palette.
   Everything here is decoration on top of site.js: if this file fails, the page still works. */
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const root = document.documentElement;
  const fmt = n => Math.round(n).toLocaleString("en-US");
  root.classList.add("mo");
  if (fine) root.classList.add("mo-fine");

  /* ---------- scroll: progress bar, nav indicator, back-to-top, hero parallax ---------- */
  const bar = $(".bar"), nav = $(".bar-nav"), toTop = $("[data-to-top]");
  const hero = $(".hero"), heroTitle = $(".hero-title"), heroLive = $(".hero-live");
  let ink = null;
  if (nav) { ink = document.createElement("i"); ink.className = "bar-ink"; ink.setAttribute("aria-hidden", "true"); nav.append(ink); }
  let sTick = false;
  function onScroll() {
    if (sTick) return;
    sTick = true;
    requestAnimationFrame(() => {
      sTick = false;
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      const p = Math.min(1, Math.max(0, scrollY / max));
      root.style.setProperty("--scroll", p.toFixed(4));
      if (toTop) {
        const show = scrollY > innerHeight * 1.2;
        if (show && toTop.hidden) toTop.hidden = false;
        toTop.dataset.show = show ? "1" : "0";
      }
      if (ink) {
        const cur = $("a[aria-current]", nav);
        if (cur && nav.offsetParent) {
          ink.style.width = cur.offsetWidth + "px";
          ink.style.transform = "translateX(" + cur.offsetLeft + "px)";
          ink.dataset.on = "1";
        } else ink.dataset.on = "0";
      }
      if (hero && !reduced) {
        const h = hero.offsetHeight, y = Math.min(scrollY, h);
        hero.style.setProperty("--sy", (y * .35).toFixed(1) + "px");
        if (heroTitle) { heroTitle.style.translate = "0 " + (y * -.18).toFixed(1) + "px"; heroTitle.style.opacity = String(Math.max(0, 1 - y / (h * .85)).toFixed(3)); }
        if (heroLive) heroLive.style.opacity = String(Math.max(0, 1 - y / (h * .45)).toFixed(3));
      }
    });
  }
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll, { passive: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(onScroll);
  onScroll();
  if (toTop) toTop.addEventListener("click", () => {
    scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    const b = $(".bar-brand"); if (b) b.focus({ preventScroll: true });
  });

  /* hero: art drifts against the pointer */
  if (hero && fine && !reduced) {
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    const step = () => {
      cx += (tx - cx) * .08; cy += (ty - cy) * .08;
      hero.style.setProperty("--px", cx.toFixed(2) + "px");
      hero.style.setProperty("--py", cy.toFixed(2) + "px");
      raf = Math.abs(tx - cx) + Math.abs(ty - cy) > .05 ? requestAnimationFrame(step) : 0;
    };
    hero.addEventListener("pointermove", e => {
      const r = hero.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - .5) * -22;
      ty = ((e.clientY - r.top) / r.height - .5) * -14;
      hero.style.setProperty("--gx", (e.clientX - r.left) + "px");
      hero.style.setProperty("--gy", (e.clientY - r.top) + "px");
      hero.dataset.glow = "1";
      if (!raf) raf = requestAnimationFrame(step);
    });
    hero.addEventListener("pointerleave", () => { tx = ty = 0; hero.dataset.glow = "0"; if (!raf) raf = requestAnimationFrame(step); });
  }

  /* hero title: letters you can poke */
  if (heroTitle && !reduced) {
    $$(":scope > span", heroTitle).forEach(word => {
      const text = word.textContent;
      word.setAttribute("aria-hidden", "true");
      const sr = document.createElement("span"); sr.className = "sr-only"; sr.textContent = text;
      word.textContent = "";
      [...text].forEach((c, i) => {
        if (c === " ") { word.append(" "); return; }   /* an inline-block space would collapse to nothing */
        const ch = document.createElement("span");
        ch.className = "ch"; ch.textContent = c; ch.style.setProperty("--i", i);
        word.append(ch);
      });
      word.after(sr);
    });
    heroTitle.addEventListener("pointerover", e => {
      const ch = e.target.closest(".ch");
      if (!ch || ch.dataset.hop) return;
      ch.dataset.hop = "1";
      ch.addEventListener("animationend", () => { delete ch.dataset.hop; }, { once: true });
    });
  }

  /* "Allowed here:" word that scrambles to the next one */
  const scr = $("[data-scramble]");
  if (scr) {
    const words = $$(".allowed li").map(li => li.textContent.trim()).filter(Boolean);
    const glyphs = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#$%&";
    let wi = 0;
    const swap = () => {
      if (document.hidden || !words.length) return;
      wi = (wi + 1) % words.length;
      const to = words[wi];
      if (reduced) { scr.textContent = to; return; }
      const from = scr.textContent, len = Math.max(from.length, to.length);
      let f = 0;
      const frame = () => {
        f++;
        let out = "";
        for (let i = 0; i < len; i++) {
          const settle = i * 1.4 + 6;
          if (f >= settle) out += to[i] || "";
          else if (f >= settle - 7) out += to[i] === " " ? " " : glyphs[(Math.random() * glyphs.length) | 0];
          else out += from[i] || "";
        }
        scr.textContent = out;
        if (f < len * 1.4 + 6) requestAnimationFrame(frame); else scr.textContent = to;
      };
      requestAnimationFrame(frame);
    };
    setInterval(swap, 2600);
  }

  /* ticker: a second copy makes the loop seamless */
  const track = $(".ticker-track");
  if (track && !reduced) track.append(...Array.from(track.children, c => c.cloneNode(true)));

  /* ---------- live player count ---------- */
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

  /* ---------- reveal on scroll ---------- */
  const groups = [
    ".sec-lede", ".lede", ".intro-facts .facts > div", ".nolist", ".ticket",
    ".banned li", ".allowed h3", ".allowed li", ".rules .fine",
    ".spec > div", ".cmds h3", ".cmds > p", ".cmds tbody tr",
    ".pl-in", ".pl-out", ".faq details", ".reach", ".band-copy",
    ".tipjar", ".free-help h3", ".help-list li", ".vote-list li",
    ".asset", ".brand-files > div", ".teaser", ".cab", ".atlas",
  ];
  const toReveal = [];
  for (const sel of groups) {
    const parents = new Map();
    for (const el of $$(sel)) {
      const p = el.parentElement;
      const i = parents.get(p) || 0; parents.set(p, i + 1);
      el.setAttribute("data-rv", "");
      el.style.setProperty("--d", Math.min(i, 14) * 45 + "ms");
      toReveal.push(el);
    }
  }
  /* section titles rise word by word */
  for (const h of $$("main h2")) {
    if (h.closest(".kz") || h.children.length) continue;
    const text = h.textContent.trim();
    h.setAttribute("aria-label", text);
    h.textContent = "";
    text.split(/\s+/).forEach((w, i, all) => {
      const outer = document.createElement("span"); outer.className = "w"; outer.setAttribute("aria-hidden", "true");
      const inner = document.createElement("span"); inner.textContent = w; inner.style.setProperty("--d", i * 70 + "ms");
      outer.append(inner); h.append(outer);
      if (i < all.length - 1) h.append(" ");
    });
    h.setAttribute("data-rv-h", "");
    toReveal.push(h);
  }
  const reveal = el => { el.classList.add("in"); };
  if (reduced || !("IntersectionObserver" in window)) toReveal.forEach(reveal);
  else {
    const io = new IntersectionObserver(es => {
      for (const e of es) if (e.isIntersecting) { reveal(e.target); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: .08 });
    toReveal.forEach(el => io.observe(el));
    /* anything already scrolled past (deep links, restored scroll) shows at once */
    const sweep = () => toReveal.forEach(el => { if (!el.classList.contains("in") && el.getBoundingClientRect().top < innerHeight) reveal(el); });
    addEventListener("load", sweep);
    addEventListener("hashchange", () => setTimeout(sweep, 60));
    setTimeout(sweep, 2500);
  }
  addEventListener("beforeprint", () => toReveal.forEach(reveal));

  /* ---------- count-ups ---------- */
  function countUp(el) {
    const m = /^([^\d]*)([\d,]+)(.*)$/.exec(el.textContent.trim());
    if (!m || reduced) return;
    const target = parseInt(m[2].replace(/,/g, ""), 10);
    if (!(target > 1)) return;
    const t0 = performance.now(), dur = 1100;
    const tick = t => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = m[1] + fmt(target * e) + m[3];
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  const counters = $$("[data-map-age]").filter(el => /^\d[\d,]* days$/.test(el.textContent.trim()))
    .concat($$(".spec dd").filter(el => /^\d[\d,]*$/.test(el.textContent.trim())));
  if (counters.length && "IntersectionObserver" in window) {
    const cio = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { countUp(e.target); cio.unobserve(e.target); } }, { threshold: .6 });
    counters.forEach(c => cio.observe(c));
  }

  /* ---------- tilt and glow cards ---------- */
  const glowSel = ".ticket, .reach, .tipjar, .teaser, .asset > a, .pl-presets button, .vote-list a, .help-list li, .facts > div, .allowed li";
  $$(glowSel).forEach(el => el.classList.add("glow"));
  if (fine) {
    document.addEventListener("pointermove", e => {
      const el = e.target.closest && e.target.closest(".glow");
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", (e.clientX - r.left) + "px");
      el.style.setProperty("--my", (e.clientY - r.top) + "px");
    }, { passive: true });
  }
  if (fine && !reduced) {
    const tilts = $$(".ticket, .reach, .tipjar, .teaser, .asset > a");
    tilts.forEach(el => {
      el.classList.add("tilt");
      const max = el.matches(".asset > a") ? 9 : 4;
      el.addEventListener("pointermove", e => {
        if (e.target.closest("input, textarea, select")) return;
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        el.style.setProperty("--rx", (-y * max).toFixed(2) + "deg");
        el.style.setProperty("--ry", (x * max).toFixed(2) + "deg");
      });
      el.addEventListener("pointerleave", () => { el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); });
    });

    /* magnetic call-to-action buttons */
    $$(".btn-l, .pill-ip, .pill-go, .to-top, .cmd-btn").forEach(b => {
      b.classList.add("mag");
      b.addEventListener("pointermove", e => {
        const r = b.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * .22, y = (e.clientY - r.top - r.height / 2) * .32;
        b.style.translate = x.toFixed(1) + "px " + y.toFixed(1) + "px";
      });
      b.addEventListener("pointerleave", () => { b.style.translate = ""; });
    });
  }

  /* ---------- block burst on copy, vote and tip ---------- */
  const burstColors = ["#ff6a1f", "#ff8b47", "#ffb347", "#f3ecdb", "#c2371a"];
  function burst(x, y, n = 16) {
    if (reduced) return;
    for (let i = 0; i < n; i++) {
      const b = document.createElement("i");
      b.className = "burst";
      const a = Math.random() * Math.PI * 2, v = 50 + Math.random() * 90;
      b.style.cssText = "left:" + x + "px;top:" + y + "px;--bx:" + (Math.cos(a) * v).toFixed(1) + "px;--by:" + (Math.sin(a) * v - 40).toFixed(1) + "px;--s:" + (4 + (Math.random() * 6 | 0)) + "px;--c:" + burstColors[(Math.random() * burstColors.length) | 0] + ";--r:" + ((Math.random() - .5) * 540 | 0) + "deg";
      document.body.append(b);
      b.addEventListener("animationend", () => b.remove(), { once: true });
    }
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-copy], .vote .btn-lava, .vote-list a, [data-tip], [data-invite], [data-share]");
    if (!b) return;
    const r = b.getBoundingClientRect();
    burst(e.clientX || r.left + r.width / 2, e.clientY || r.top + r.height / 2);
  });

  /* ---------- block cursor: the Minecraft selection outline ---------- */
  if (fine && !reduced) {
    const cur = document.createElement("div");
    cur.className = "cursor"; cur.setAttribute("aria-hidden", "true");
    document.body.append(cur);
    let x = -100, y = -100, cx = -100, cy = -100, size = 22, cs = 22, on = false, raf = 0;
    const loop = () => {
      cx += (x - cx) * .22; cy += (y - cy) * .22; cs += (size - cs) * .2;
      cur.style.transform = "translate(" + (cx - cs / 2).toFixed(1) + "px," + (cy - cs / 2).toFixed(1) + "px)";
      cur.style.width = cur.style.height = cs.toFixed(1) + "px";
      raf = (Math.abs(x - cx) + Math.abs(y - cy) + Math.abs(size - cs) > .3) ? requestAnimationFrame(loop) : 0;
    };
    document.addEventListener("pointermove", e => {
      if (e.pointerType !== "mouse") return;
      x = e.clientX; y = e.clientY;
      const t = e.target;
      const hide = !!(t.closest && t.closest("canvas, input, textarea, select, .kz, .cmdk, .atlas, .cab"));
      const hot = !hide && !!(t.closest && t.closest("a, button, summary, label, [role=tab]"));
      size = hot ? 44 : 22;
      cur.dataset.hot = hot ? "1" : "0";
      cur.dataset.show = hide ? "0" : "1";
      if (!on) { on = true; cx = x; cy = y; }
      if (!raf) raf = requestAnimationFrame(loop);
    }, { passive: true });
    document.addEventListener("pointerdown", () => { cur.dataset.down = "1"; });
    document.addEventListener("pointerup", () => { cur.dataset.down = "0"; });
    document.documentElement.addEventListener("pointerleave", () => { cur.dataset.show = "0"; });
  }

  /* ---------- quick-jump palette (Ctrl K or /) ---------- */
  const go = (id, then) => () => {
    const el = document.getElementById(id);
    if (!el) { location.href = "index.html#" + id; return; }   /* a main-page section, seen from another page */
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    if (then) setTimeout(then, reduced ? 0 : 450);
  };
  const toast = t => dispatchEvent(new CustomEvent("welloby:toast", { detail: t }));
  const copy = text => () => {
    const b = document.querySelector('[data-copy="' + text + '"]');
    if (b) b.click(); else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast("Copied " + text));
  };
  const items = [
    { g: "Do", t: "Copy the Java address", s: "mc.welloby.com", k: "ip copy server join java", run: copy("mc.welloby.com") },
    { g: "Do", t: "Copy the Bedrock address", s: "bedrock.welloby.com, port 25620", k: "ip copy bedrock phone console port", run: copy("bedrock.welloby.com") },
    { g: "Do", t: "Ask kevzy", s: "The help bot answers right here", k: "help bot question support chat", run: () => window.kevzy && window.kevzy.open(), need: () => !!window.kevzy },
    { g: "Do", t: "Play Spawn Guessr", s: "Place a piece of the real map", k: "game play guess arcade", run: go("games", () => window.wellobyGames && window.wellobyGames.open("guessr")) },
    { g: "Do", t: "Play Elytra Dive", s: "Fly under the Nether roof", k: "game play elytra fly arcade", run: go("games", () => window.wellobyGames && window.wellobyGames.open("elytra")) },
    { g: "Do", t: "Roll a spawn on the atlas", s: "See where a new player might land", k: "map spawn random atlas", run: go("atlas", () => window.wellobyAtlas && window.wellobyAtlas.rollSpawn()) },
    { g: "Do", t: "Vote for Welloby", s: "Once a day, small reward in game", k: "vote list reward", run: () => window.open("https://bestminecraftserverlist.net/vote/welloby-anarchy", "_blank", "noopener") },
    { g: "Do", t: "Open the Discord", s: "Chat, reports, ban appeals", k: "discord chat community appeal report", run: () => window.open("https://discord.gg/cwHKDtXQWD", "_blank", "noopener") },
  ];
  /* every official account and every creator, from the site settings */
  const W = window.WELLOBY || {}, L = W.links || {};
  const SOCIAL = { tiktok: "TikTok", instagram: "Instagram", telegram: "Telegram", youtube: "YouTube", x: "X" };
  const out = url => () => window.open(url, "_blank", "noopener");
  Object.entries(SOCIAL).forEach(([k, label]) => {
    if (L[k]) items.push({ g: "Follow", t: "Welloby on " + label, s: L[k].replace(/^https?:\/\/(www\.)?/, ""), k: "follow social " + k + " " + label, run: out(L[k]) });
  });
  (W.creators || []).forEach(c => (c.links || []).forEach(l => items.push({ g: "Follow", t: c.name + " on " + (SOCIAL[l.platform] || l.platform), s: c.about || "", k: "creator streamer video " + c.name + " " + (c.clan || "") + " " + l.platform, run: out(l.url) })));
  $$(".menu-list a").forEach(a => items.push({ g: "Go to", t: a.textContent.trim(), s: "", k: "section", run: () => {
    const h = a.getAttribute("href") || "";
    if (h.startsWith("#") && !h.startsWith("#/") && document.getElementById(h.slice(1))) go(h.slice(1))();
    else location.href = a.href;
  } }));
  $$(".faq details").forEach(d => {
    const q = $("summary", d), p = $("p", d);
    if (!q) return;
    items.push({ g: "Answers", t: q.textContent.trim(), s: p ? p.textContent.trim().slice(0, 90) : "", k: p ? p.textContent : "", run: () => { d.open = true; d.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" }); d.classList.add("flash"); setTimeout(() => d.classList.remove("flash"), 1600); } });
  });

  let dlg = null, list = null, input = null, shown = [], sel = 0, lastFocus = null;
  function build() {
    dlg = document.createElement("dialog");
    dlg.className = "cmdk";
    dlg.setAttribute("aria-label", "Search the site");
    dlg.innerHTML = '<div class="cmdk-box notch"><label class="cmdk-in"><svg class="i" aria-hidden="true"><use href="#i-search"/></svg><span class="sr-only">Search</span>' +
      '<input type="text" autocomplete="off" spellcheck="false" placeholder="Jump to a section, copy the IP, find an answer" role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-autocomplete="list"><kbd>Esc</kbd></label>' +
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
    dlg.addEventListener("close", () => { root.classList.remove("cmdk-on"); if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); });
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
    if (!shown.length) html = '<li class="cmdk-none" role="presentation">Nothing here. Try kevzy: press Enter to ask.</li>';
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
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  if (mac) $$(".cmd-btn kbd").forEach(k => { k.textContent = "\u2318K"; });
  document.addEventListener("keydown", e => {
    const t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey) && !e.altKey) { e.preventDefault(); dlg && dlg.open ? close() : open(); }
    else if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !(t && t.closest && t.closest("canvas, .atlas, .cab"))) { e.preventDefault(); open(); }
  });

  /* FAQ: only animate the opening where the browser can't do it in CSS */
  $$(".faq details").forEach(d => d.addEventListener("toggle", () => { if (d.open) d.classList.add("opened"); }));
})();
