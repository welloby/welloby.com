/* kevzy: the site's help bot. Matches questions against assets/kevzy-kb.js entirely in the browser:
   no AI service, nothing typed leaves the page. The engine also runs under Node for tests. */
(function () {
  "use strict";
  var G = typeof window !== "undefined" ? window : globalThis;
  var W = G.WELLOBY || {};
  /* need: "map3d" answers exist only once the site has a 3D map address, need: "!map3d" ones only until then */
  var HAS3D = !!(W.map3d && W.map3d.url);
  var KB = (G.KEVZY_KB || []).filter(function (it) { return !it.need || (it.need === "map3d" ? HAS3D : it.need === "!map3d" ? !HAS3D : true); });

  /* ---------------- text handling ---------------- */
  var SYN = {
    u: "you", ya: "you", yu: "you", ur: "your", r: "are", wat: "what", wut: "what", wht: "what", whats: "what", hw: "how",
    plz: "please", pls: "please", ppl: "people", cuz: "because", bc: "because", srv: "server", serv: "server", svr: "server",
    cords: "coords", coordz: "coords", cordinates: "coordinates", coordinate: "coordinates", adress: "address", addres: "address",
    adres: "address", donation: "donate", donations: "donate", donating: "donate", donator: "donor", hacking: "hack",
    hacks: "hack", hacked: "hack", hax: "hack", cheats: "cheat", cheating: "cheat", cheater: "cheat", duping: "dupe",
    dupes: "dupe", duplication: "dupe", xray: "xray", ipadress: "ip", tlaunch: "tlauncher", tl: "tlauncher",
    mcpe: "mcpe", bedrok: "bedrock", berdock: "bedrock", discrod: "discord", dicord: "discord", dc: "discord", disc: "discord",
    pw: "password", pass: "password", passwd: "password", pwd: "password", tpa: "tpa", tp: "teleport", rtp: "rtp",
    cracked: "cracked", crack: "cracked", premuim: "premium", vesion: "version", verison: "version", ver: "version",
    becuase: "because", servr: "server", sever: "server", srever: "server", plugins: "plugin", mods: "mod", modded: "mod",
    wanna: "want", gonna: "going", gimme: "give", lemme: "let", dont: "not", doesnt: "not", didnt: "not", cant: "cannot",
    cannot: "cannot", couldnt: "cannot", wont: "not", isnt: "not", im: "i", ive: "i",
    noob: "new", nooby: "new", newbie: "new", beginer: "beginner", griefed: "grief", griefing: "grief", griefer: "grief",
    raid: "raided", killed: "kill", killing: "kill", kills: "kill", died: "die", dying: "die",
    spawned: "spawn", spawning: "spawn", homes: "home", sethome: "sethome", "2b": "2b2t",
    ipad: "tablet", iphone: "phone", samsung: "android", america: "usa", american: "usa", na: "usa", canada: "usa",
    accs: "accounts", acc: "account", wiped: "wipe", wiping: "wipe", wipes: "wipe",
    // "on the site" and "welloby.com" mean the website, which tells its account answers apart from the game's
    site: "website", com: "website", web: "website", webpage: "website"
  };
  var STOP = {};
  ("a an the is are am was were be been being to of in on at for it its this that these those i me my mine you your we our us " +
   "do does did can could would should will shall may might must how what where when why who which there here with and or so " +
   "just please hey get got have has had any some then than if about like really very much many there's also too only even " +
   "want need know tell show give let going try make made one ones thing things way ways guys bro man dude okay pls server servers " +
   "welloby minecraft kevzy into").split(" ").forEach(function (w) { STOP[w] = 1; });

  function clean(s) {
    return String(s || "").toLowerCase()
      .replace(/[\u2018\u2019']/g, "")
      .replace(/x-ray/g, "xray").replace(/ko-fi/g, "kofi").replace(/2b2t/g, "2b2t ")
      .replace(/24\s*\/\s*7/g, " twentyfourseven ")
      .replace(/\b(cant|cannot|can not|dont|do not) (remember|recall)\b/g, " forgot ")
      .replace(/\b(dont|do not|no|without|non)[\s-]+(have\s+)?(a\s+)?(premium|paid|legit|real|bought)\b/g, " nopremium ")
      .replace(/(\d)\s*k\b/g, "$1000")
      .replace(/[^a-z0-9\-\s]/g, " ")
      .replace(/\s+/g, " ").trim();
  }
  function undouble(w) { return /([bdfgklmnprt])\1$/.test(w) ? w.slice(0, -1) : w; }
  function stem(w) {
    if (w.length > 5 && /ing$/.test(w)) return undouble(w.slice(0, -3));
    if (w.length > 4 && /ed$/.test(w) && !/eed$/.test(w)) return undouble(w.slice(0, -2));
    if (w.length > 3 && /ies$/.test(w)) return w.slice(0, -3) + "y";
    if (w.length > 3 && /s$/.test(w) && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
    if (w.length >= 4 && /[^aeiou]e$/.test(w)) w = w.slice(0, -1);
    return w;
  }
  function tokens(s, keepStop) {
    var out = [];
    clean(s).split(" ").forEach(function (w) {
      if (!w || /^-?\d+$/.test(w)) return;
      w = w.replace(/^-+|-+$/g, "");
      if (!w) return;
      if (Object.prototype.hasOwnProperty.call(SYN, w)) w = SYN[w];
      if (!w) return;
      if (!keepStop && STOP[w]) return;
      out.push(stem(w));
    });
    return out;
  }
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      var rowMin = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev[j - 2] + 1);
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  function sim(a, b) {
    if (a === b) return 1;
    var n = Math.min(a.length, b.length);
    if (n >= 4 && Math.abs(a.length - b.length) <= 3 && (a.indexOf(b) === 0 || b.indexOf(a) === 0)) return 0.85;
    if (n >= 5 && lev(a, b, 1) <= 1) return 0.8;
    if (n >= 7 && lev(a, b, 2) <= 2) return 0.62;
    return 0;
  }

  /* ---------------- index ---------------- */
  var index = KB.map(function (it) {
    var phrases = it.q.map(function (p) { return { c: tokens(p), r: tokens(p, true) }; });
    var kw = (it.k || []).map(function (k) { return stem(clean(k).replace(/\s+/g, "")); });
    return { it: it, phrases: phrases, kw: kw };
  });
  var df = {}, N = index.length;
  index.forEach(function (e) {
    var seen = {};
    e.phrases.forEach(function (p) { p.c.concat(p.r).forEach(function (t) { seen[t] = 1; }); });
    Object.keys(seen).forEach(function (t) { df[t] = (df[t] || 0) + 1; });
  });
  function idf(t) { return Math.log(1 + N / (1 + (df[t] || 0))); }
  function bestSim(t, list) {
    var b = 0;
    for (var i = 0; i < list.length; i++) { var s = sim(t, list[i]); if (s > b) { b = s; if (b === 1) break; } }
    return b;
  }
  function scoreTokens(q, p) {
    if (!q.length || !p.length) return 0;
    var mp = 0, tp = 0, mq = 0, tq = 0, i, w;
    for (i = 0; i < p.length; i++) { w = idf(p[i]); tp += w; mp += w * bestSim(p[i], q); }
    for (i = 0; i < q.length; i++) { w = idf(q[i]); tq += w; mq += w * bestSim(q[i], p); }
    return 0.55 * (mp / tp) + 0.45 * (mq / tq);
  }
  var GREET = { hi: 1, hello: 1, hey: 1, yo: 1, sup: 1, hola: 1, wassup: 1, hii: 1 };
  function rank(text) {
    var qc = tokens(text), qr = tokens(text, true);
    if (qc.length > 1) { qc = qc.filter(function (t) { return !GREET[t]; }); qr = qr.filter(function (t) { return !GREET[t]; }); }
    var useRaw = qc.length === 0;
    var q = useRaw ? qr : qc;
    var res = index.map(function (e) {
      var best = 0;
      e.phrases.forEach(function (p) {
        var sr = scoreTokens(qr, p.r);
        var s = useRaw ? sr : 0.72 * scoreTokens(q, p.c.length ? p.c : p.r) + 0.28 * sr;
        if (s > best) best = s;
      });
      var boost = 0;
      if (e.kw.length) for (var i = 0; i < q.length; i++) if (bestSim(q[i], e.kw) >= 0.8) { boost = 0.08; break; }
      return { id: e.it.id, it: e.it, score: best + boost };
    });
    res.sort(function (a, b) { return b.score - a.score; });
    return res;
  }

  /* ---------------- smart answers ---------------- */
  var fmt = function (n) { return Math.round(n).toLocaleString("en-US"); };
  function dur(s) {
    s = Math.round(s);
    if (s < 60) return s + " s";
    var m = Math.floor(s / 60);
    if (m < 60) return m + " min" + (s % 60 ? " " + (s % 60) + " s" : "");
    var h = Math.floor(m / 60);
    if (h < 48) return h + " h " + (m % 60) + " min";
    return Math.floor(h / 24) + " days " + (h % 24) + " h";
  }
  function numbers(text) {
    var m = String(text).replace(/,(?=\d{3}\b)/g, "").replace(/(\d)\s*k\b/gi, "$1000").match(/-?\d+(?:\.\d+)?/g);
    return m ? m.map(Number) : [];
  }
  // tiny arithmetic: + - * / ^ and brackets, nothing else is evaluated
  function arith(src) {
    var s = String(src).toLowerCase()
      .replace(/what\s*is|whats|calculate|calc|solve|how\s*much\s*is|=|\?/g, " ")
      .replace(/times|multiplied\s*by|\u00d7/g, "*").replace(/(\d)\s*x\s*(\d)/g, "$1*$2")
      .replace(/divided\s*by|over|\u00f7/g, "/").replace(/plus/g, "+").replace(/minus/g, "-")
      .replace(/to\s*the\s*power\s*of|\*\*/g, "^").replace(/,/g, "").replace(/\s+/g, "");
    if (!/^[\d.+\-*/^()]+$/.test(s) || !/\d[+\-*/^]/.test(s.replace(/^-/, ""))) return null;
    var i = 0;
    function peek() { return s[i]; }
    function num() {
      if (peek() === "(") { i++; var v = expr(); if (s[i++] !== ")") throw 0; return v; }
      if (peek() === "-") { i++; return -num(); }
      var m = /^\d+(\.\d+)?/.exec(s.slice(i)); if (!m) throw 0; i += m[0].length; return Number(m[0]);
    }
    function pow() { var b = num(); if (peek() === "^") { i++; return Math.pow(b, pow()); } return b; }
    function term() { var v = pow(); while (peek() === "*" || peek() === "/") { var o = s[i++], r = pow(); v = o === "*" ? v * r : v / r; } return v; }
    function expr() { var v = term(); while (peek() === "+" || peek() === "-") { var o = s[i++], r = term(); v = o === "+" ? v + r : v - r; } return v; }
    try { var v = expr(); if (i !== s.length || !isFinite(v)) return null; return { expr: s, value: v }; } catch (e) { return null; }
  }
  /* The real-life guard. A question that may not be about the game ("how do i kill myself") gets the
     real_life answer from the knowledge base, never /kill steps. Only these patterns set it off, not
     the ranking: a shared word like "myself" or "life" must not ("how do i protect myself"), and a
     new answer must never be able to outrank it. */
  var SELF = "(?:my\\s?self|myslef|your\\s?self|ur\\s?self)";
  var REAL_LIFE = [
    new RegExp("\\b(?:ki+l+|killing|hurt|hurting|harm|harming|cut|cutting|hang|hanging|shoot|shooting|stab|stabbing|drown|drowning|unalive)\\s+" + SELF + "\\b"),
    /\b(?:suicid|sucid|suisid|suicd)|\bsewer\s?slide\b|\bunalive\b|\bkms\b|\bself[\s-]?harm/,
    /\bend(?:ing)?\s+my\s+(?:own\s+)?life\b|\btak(?:e|ing)\s+my\s+(?:own\s+)?life\b|\bend\s+it\s+all\b|\bwant\s+to\s+end\s+it\b/,
    /\b(?:dont|do\s+not|no\s+longer|never)\s+want\s+to\s+(?:live|be\s+alive|exist)(?:\s+(?:anymore|any\s+more|no\s+more|any\s+longer))?\s*[.!?]*$/,
    /\bbetter\s+off\s+dead\b|\bwish\s+i\s+(?:was|were)\s+dead\b|\bno\s+reason\s+to\s+live\b|\bnot\s+worth\s+living\b/
  ];
  // "i want to die" is one, "i dont want to die" (in the void, to a creeper) is a game question
  var WANT_DIE = /\b(?:want|wanna)\s+(?:to\s+)?(?:die|be\s+dead)\b/;
  var NOT_WANT_DIE = /\b(?:dont|do\s+not|never|not)\s+(?:really\s+|ever\s+)?(?:want|wanna)\s+(?:to\s+)?(?:die|be\s+dead)\b/;
  function realLife(text) {
    var s = String(text || "").toLowerCase().replace(/[\u2018\u2019']/g, "").replace(/\s+/g, " ").trim();
    for (var i = 0; i < REAL_LIFE.length; i++) if (REAL_LIFE[i].test(s)) return true;
    return WANT_DIE.test(s) && !NOT_WANT_DIE.test(s);
  }
  // these two checks come before the ranking: the guard above, and "/kill", whose slash clean() drops
  function smart(text) {
    if (realLife(text)) { var rl = KB.filter(function (x) { return x.id === "real_life"; })[0]; if (rl) return { id: "real_life", text: rl.a[0], act: rl.act || [], next: rl.next || [] }; }
    if (/(^|[\s"(])\/kill\b/i.test(String(text))) { var kq = KB.filter(function (x) { return x.id === "kill"; })[0]; if (kq) return { id: "kill", text: kq.a[0], act: kq.act || [], next: kq.next }; }
    var t = clean(text), n = numbers(text);
    var bare = /^\s*(-?\d[\d,]*)\s*[,\s]\s*(-?\d[\d,]*)(\s*[,\s]\s*(-?\d[\d,]*))?\s*$/.exec(String(text));
    if (bare && !/\d\s+-\s+\d/.test(String(text))) {
      var bx = n[0], bz = n.length >= 3 ? n[2] : n[1], bd = Math.hypot(bx, bz);
      return { id: "coords_calc", text: "x " + fmt(bx) + ", z " + fmt(bz) + " is " + fmt(bd) + " blocks from 0, 0. the nether spot for it is " + fmt(Math.floor(bx / 8)) + ", " + fmt(Math.floor(bz / 8)) + ". sprinting there from 0, 0 takes about " + dur(bd / 5.612) + ".",
        act: [["Show it on the map", "goto:" + bx + "," + bz], ["Travel planner", "planner:" + Math.max(10, Math.round(bd))]] };
    }
    var a = arith(text);
    if (a) {
      var v = Math.abs(a.value) >= 1e15 ? a.value.toExponential(4) : (Math.round(a.value * 1e6) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 6 });
      return { id: "calc", text: a.expr.replace(/\*/g, " \u00d7 ").replace(/\//g, " \u00f7 ").replace(/([+\-^])/g, " $1 ").replace(/\s+/g, " ").trim() + " = " + v };
    }
    if (n.length >= 2 && /nether|overworld|portal|convert/.test(t)) {
      var x = n[0], z = n.length >= 3 ? n[2] : n[1];
      var fromNether = /(from|in|on)( the)? nether|nether to|nether coords? (to|in)|to( the)? overworld/.test(t);
      if (fromNether) return { id: "nether_calc", text: "nether " + fmt(x) + ", " + fmt(z) + " is overworld " + fmt(x * 8) + ", " + fmt(z * 8) + ".", act: [["Show it on the map", "goto:" + x * 8 + "," + z * 8]] };
      return { id: "nether_calc", text: "overworld " + fmt(x) + ", " + fmt(z) + " is nether " + fmt(Math.floor(x / 8)) + ", " + fmt(Math.floor(z / 8)) + ". if those were nether coords, the overworld spot is " + fmt(x * 8) + ", " + fmt(z * 8) + ".",
        act: [["Show " + fmt(x) + ", " + fmt(z) + " on the map", "goto:" + x + "," + z]] };
    }
    if (n.length >= 2 && /how far|distance|far is|far from|blocks from|blocks away/.test(t)) {
      var d, from = "0, 0";
      if (n.length >= 4) { var p = n.length >= 6 ? [n[0], n[2], n[3], n[5]] : n.slice(0, 4); d = Math.hypot(p[2] - p[0], p[3] - p[1]); from = fmt(p[0]) + ", " + fmt(p[1]); }
      else d = Math.hypot(n[0], n[1]);
      return { id: "distance_calc", text: fmt(d) + " blocks from " + from + ". sprinting that takes about " + dur(d / 5.612) + ", by elytra with rockets about " + dur(d / 33.5) + ".", act: [["Travel planner", "planner:" + Math.round(d)]] };
    }
    if (/\b1\.(7|8|9|1\d|2\d)(\.\d+)?\b|\b26\.\d\b/.test(String(text)) && !/[+*\/^=]/.test(String(text))) {
      var vq = KB.filter(function (x) { return x.id === "versions"; })[0];
      if (vq) return { id: "versions", text: vq.a[0], act: [], next: vq.next };
    }
    if (n.length >= 1 && n[0] >= 10 && /how long|time to|take to|travel|walk|sprint|minutes|hours/.test(t)) {
      var b = Math.abs(n[0]);
      return { id: "time_calc", text: fmt(b) + " blocks: walking " + dur(b / 4.317) + ", sprinting " + dur(b / 5.612) + ", elytra with rockets " + dur(b / 33.5) + ", boat on blue ice " + dur(b / 72.73) + ". through the nether it's only " + fmt(b / 8) + " blocks.",
        act: [["Open the planner", "planner:" + Math.round(b)]] };
    }
    return null;
  }

  /* ---------------- answering ---------------- */
  var last = null, turn = 0;
  function pick(list) { return list[(turn + list.length * 7) % list.length]; }
  function ask(text, vars) {
    turn++;
    var s = smart(text);
    if (s) { last = s.id; return { id: s.id, text: s.text, act: s.act || [], next: s.next || [] }; }
    var r = rank(text), top = r[0];
    if (!top || top.score < 0.5) {
      // the real-life guard has no questions to suggest, and must never be offered as one
      var sug = r.filter(function (x) { return x.score > 0.22 && x.id !== "real_life"; }).slice(0, 3).map(function (x) { return x.it.q[0]; });
      if (!sug.length) sug = ["how do i join", "what are the rules", "what can you do"];
      return { id: "fallback", score: top ? top.score : 0, text: "not sure what you mean. try one of these, or ask the humans on discord.", act: [["Open Discord", "url:{discordUrl}"]], next: sug };
    }
    last = top.id;
    var it = top.it;
    return { id: it.id, score: top.score, text: pick(it.a), act: it.act || [], next: it.next || [], auto: it.auto };
  }
  /* The Google Play app (the head script marks the page "in-app"): Play's rules don't allow links to outside payment or
     asking for tips there. An answer with an "app" part in kevzy-kb.js uses that wording and those buttons instead, and
     no answer keeps a button that leads to the Donate box or to a tip site. The website itself is unchanged. */
  var PAY = /^donate$|^go:#donate\b|^(url|page):.*(#donate\b|ko-fi\.com|buymeacoffee\.com|paypal\.)/i;
  function forApp(r) {
    var it = KB.filter(function (x) { return x.id === r.id; })[0], app = it && it.app, out = {};
    for (var k in r) out[k] = r[k];
    if (app) { out.text = app.a[0]; out.act = app.act || []; if (app.next) out.next = app.next; }
    out.act = (out.act || []).filter(function (a) { return !PAY.test(a[1]); });
    return out;
  }
  function fill(s, vars) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; }); }

  G.kevzyEngine = { ask: ask, rank: rank, tokens: tokens, fill: fill, smart: smart, realLife: realLife, forApp: forApp, size: KB.length };
  if (typeof document === "undefined") return;

  /* ---------------- widget ---------------- */
  var cfg = W.kevzy || {}, server = W.server || {};
  var NAME = cfg.name || "kevzy";
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function vars() {
    var lamp = document.querySelector("[data-status-lamp]"), state = lamp ? lamp.dataset.state : "";
    var status = W.preview ? "the live status light works on the hosted site. it was online when this page was built."
      : state === "online" ? "it's up right now. join with " + server.java.host + "."
      : state === "offline" ? "it isn't answering right now. check discord for news."
      : state === "loading" ? "checking right now, look at the light at the top of the page."
      : "i can't reach the status service. the server may still be up, try joining.";
    var start = Date.parse((W.mapStart || "2026-09-06") + "T00:00:00Z");
    return {
      ip: server.java.host, bedrock: server.bedrock.host, port: server.bedrock.port,
      discord: (W.links && W.links.discord || "").replace(/^https?:\/\//, ""), discordUrl: W.links && W.links.discord,
      x: "@WellobyLLC", name: NAME, status: status, days: Math.max(0, Math.floor((Date.now() - start) / 864e5)),
      tiktokUrl: (W.links && W.links.tiktok) || "#watch", instagramUrl: (W.links && W.links.instagram) || "#watch",
      telegramUrl: (W.links && W.links.telegram) || "#watch",
      map3dUrl: (W.map3d && W.map3d.url) || "#map",
      kofi: W.donate && W.donate.kofi
    };
  }
  var root = document.createElement("div");
  root.className = "kz";
  root.innerHTML =
    '<div class="kz-nudge" hidden><span>Questions about the server? Ask me.</span><button type="button" class="kz-nudge-x" aria-label="Dismiss">\u00d7</button></div>' +
    '<button type="button" class="kz-launch" aria-expanded="false" aria-controls="kz-panel">' + face() + '<span class="kz-launch-t">Ask ' + NAME + '</span></button>' +
    '<section class="kz-panel" id="kz-panel" role="dialog" aria-modal="false" aria-labelledby="kz-title" hidden>' +
      '<div class="kz-head">' + face() + '<div><h2 id="kz-title">' + NAME + '</h2><p>Help bot. Answers come from this site.</p></div>' +
      '<button type="button" class="kz-close" aria-label="Close the chat"><svg class="i" aria-hidden="true"><use href="#i-x"/></svg></button></div>' +
      '<div class="kz-log" role="log" aria-live="polite" aria-label="Conversation"></div>' +
      '<div class="kz-form"><label class="sr-only" for="kz-input">Ask ' + NAME + ' a question</label>' +
      '<input id="kz-input" type="text" autocomplete="off" enterkeyhint="send" maxlength="200" placeholder="Ask about the server">' +
      '<button type="button" class="kz-send" aria-label="Send"><svg class="i" aria-hidden="true"><use href="#i-send"/></svg></button></div>' +
    '</section>';
  document.body.append(root);
  var launch = root.querySelector(".kz-launch"), panel = root.querySelector(".kz-panel"), log = root.querySelector(".kz-log");
  var input = root.querySelector("#kz-input"), sendBtn = root.querySelector(".kz-send"), nudge = root.querySelector(".kz-nudge");
  var started = false, busy = false, queued = [];

  function face() {
    return '<svg class="kz-face" viewBox="0 0 8 8" aria-hidden="true" shape-rendering="crispEdges">' +
      '<rect width="8" height="8" fill="#ff6a1f"/><rect y="0" width="8" height="2" fill="#c2371a"/>' +
      '<rect x="1" y="3" width="2" height="2" fill="#f3ecdb"/><rect x="5" y="3" width="2" height="2" fill="#f3ecdb"/>' +
      '<rect x="2" y="4" width="1" height="1" fill="#171614"/><rect x="6" y="4" width="1" height="1" fill="#171614"/>' +
      '<rect x="3" y="6" width="2" height="1" fill="#171614"/></svg>';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function rich(s) { return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>"); }
  function scrollLog() { log.scrollTop = log.scrollHeight; }
  function bubble(who, html) {
    var row = document.createElement("div");
    row.className = "kz-msg kz-" + who;
    row.innerHTML = '<div class="kz-bubble">' + html + "</div>";
    log.append(row); scrollLog();
    return row;
  }
  function chips(list) {
    if (!list || !list.length) return;
    var wrap = document.createElement("div");
    wrap.className = "kz-chips";
    list.slice(0, 4).forEach(function (q) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "kz-chip"; b.textContent = q;
      b.addEventListener("click", function () { send(q); });
      wrap.append(b);
    });
    log.append(wrap); scrollLog();
  }
  function actions(row, acts, v) {
    if (!acts || !acts.length) return;
    var wrap = document.createElement("div");
    wrap.className = "kz-acts";
    acts.forEach(function (a) {
      var label = fill(a[0], v), act = fill(a[1], v), el;
      var kind = act.split(":")[0], arg = act.slice(kind.length + 1);
      if (kind === "url" || kind === "donate") {
        el = document.createElement("a");
        el.href = kind === "donate" ? v.kofi : arg; el.target = "_blank"; el.rel = "noopener";
      } else if (kind === "page") {
        el = document.createElement("a");
        el.href = arg;
      } else {
        el = document.createElement("button"); el.type = "button";
        el.addEventListener("click", function () { run(kind, arg); });
      }
      el.className = "kz-act"; el.textContent = label;
      wrap.append(el);
    });
    row.append(wrap); scrollLog();
  }
  function toast(t) { window.dispatchEvent(new CustomEvent("welloby:toast", { detail: t })); }
  function copy(text) {
    var done = function (ok) { toast(ok ? "Copied " + text : "Copy it yourself: " + text); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
    else fallback();
    function fallback() {
      var f = document.createElement("textarea"); f.value = text; f.readOnly = true; f.style.cssText = "position:fixed;left:0;top:0;opacity:0";
      root.append(f); f.select(); var ok = false; try { ok = document.execCommand("copy"); } catch (e) { /* manual */ } f.remove(); done(ok);
    }
  }
  var phone = matchMedia("(max-width: 640px)");
  function go(sel) {
    var el = document.querySelector(sel);
    if (phone.matches) close(false);
    if (el) el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }
  function run(kind, arg) {
    var Mp = window.wellobyMap, Gm = window.wellobyGames, P = window.wellobyPlanner;
    if (kind === "copy") copy(arg);
    else if (kind === "go") go(arg);
    else if (kind === "contact") go("#contact");
    else if (kind === "map") { if (Mp) { if (arg === "spawn") Mp.spawn(); else Mp.open(); } else go("#map"); }
    else if (kind === "roll") { if (Mp) Mp.roll(); else go("#map"); }
    else if (kind === "goto") { var p = arg.split(",").map(Number); if (Mp) Mp.goto(p[0], p[1]); else go("#map"); }
    else if (kind === "game") { go("#games"); if (Gm) Gm.open(arg); }
    else if (kind === "planner") { go("#planner"); if (P) P.set(Number(arg)); }
    else if (kind === "ask") send(arg);
  }
  function reply(text) {
    var v = vars(), r = ask(text, v);
    if (document.documentElement.classList.contains("in-app")) r = forApp(r);
    var typing = bubble("bot kz-typing", '<span class="kz-dots" aria-label="' + NAME + ' is typing"><i></i><i></i><i></i></span>');
    busy = true;
    var wait = reduced ? 120 : Math.min(1100, 320 + fill(r.text, v).length * 9);
    setTimeout(function () {
      typing.remove();
      var row = bubble("bot", rich(fill(r.text, v)));
      actions(row, r.act, v);
      chips(r.next);
      busy = false;
      if (r.auto === "roll") run("roll");
      if (queued.length) reply(queued.shift());
    }, wait);
  }
  function send(text) {
    text = String(text || "").trim().slice(0, 200);
    if (!text) return;
    bubble("me", esc(text));
    if (busy) { if (queued.length < 3) queued.push(text); return; }
    reply(text);
  }
  function submit() { var t = input.value; input.value = ""; send(t); }
  function greet() {
    if (started) return;
    started = true;
    var v = vars();
    var row = bubble("bot", rich(fill("yo, i'm {name}. ask me anything about welloby: joining, rules, hacks, money, the map, or this website's accounts and clans. i also do nether coords and travel times.", v)));
    actions(row, [["Copy {ip}", "copy:{ip}"]], v);
    chips(["how do i join", "is it cracked", "what are the rules", "how do i join a clan"]);
  }
  function open(question) {
    if (panel.hidden) {
      panel.hidden = false; launch.setAttribute("aria-expanded", "true"); root.dataset.open = "1";
      hideNudge(true);
      greet();
    }
    if (question) send(question);
    if (!phone.matches || !question) input.focus({ preventScroll: true });
  }
  function close(focusBack) {
    if (panel.hidden) return;
    panel.hidden = true; launch.setAttribute("aria-expanded", "false"); root.dataset.open = "0";
    if (focusBack !== false) launch.focus({ preventScroll: true });
  }
  launch.addEventListener("click", function () { panel.hidden ? open() : close(); });
  root.querySelector(".kz-close").addEventListener("click", function () { close(); });
  sendBtn.addEventListener("click", function () { submit(); input.focus({ preventScroll: true }); });
  input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); submit(); } });
  panel.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.stopPropagation(); close(); } });
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-ask]");
    if (b) { e.preventDefault(); open(b.getAttribute("data-ask")); }
  });

  /* one-time nudge, never on the first second, never again once seen */
  var NUDGE = "welloby.kevzy.nudged";
  function hideNudge(remember) {
    nudge.hidden = true;
    if (remember) { try { localStorage.setItem(NUDGE, "1"); } catch (e) { /* storage blocked */ } }
  }
  var seen = false;
  try { seen = localStorage.getItem(NUDGE) === "1"; } catch (e) { seen = false; }
  if (!seen && cfg.nudge !== false) {
    setTimeout(function () {
      if (!panel.hidden) return;
      nudge.hidden = false;
      setTimeout(function () { hideNudge(false); }, 9000);
    }, 12000);
  }
  nudge.querySelector(".kz-nudge-x").addEventListener("click", function () { hideNudge(true); });
  nudge.addEventListener("click", function (e) { if (!e.target.closest(".kz-nudge-x")) open(); });

  window.kevzy = { open: open, close: close, ask: function (t) { open(t); } };
})();
