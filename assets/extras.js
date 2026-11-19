/* Welloby extras: map age, travel planner, contact helper, donations, invite and share. */
(() => {
  "use strict";
  const W = window.WELLOBY || {};
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const toast = t => window.dispatchEvent(new CustomEvent("welloby:toast", { detail: t }));
  const fmt = n => Math.round(n).toLocaleString("en-US");
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const server = W.server || {}, links = W.links || {}, donate = W.donate || {};
  const SITE = (W.siteUrl || "https://welloby.com/").replace(/\/$/, "");
  async function copy(text, what) {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; }
    catch (e) {
      const f = document.createElement("textarea");
      f.value = text; f.readOnly = true; f.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0";
      document.body.append(f); f.select();
      try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
      f.remove();
    }
    toast(ok ? "Copied " + what : "Couldn't copy here. Select the text and copy it yourself.");
    return ok;
  }

  /* ---------- map age ---------- */
  const age = $("[data-map-age]");
  if (age && W.mapStart) {
    const start = Date.parse(W.mapStart + "T00:00:00Z");
    const paint = () => {
      const d = Math.floor((Date.now() - start) / 864e5);
      if (!(d >= 0)) return;
      age.textContent = fmt(d) + " days";
      age.title = "No resets since " + new Date(start).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
    };
    paint(); setInterval(paint, 60000);
  }

  /* ---------- travel planner ---------- */
  const pl = $("[data-planner]");
  if (pl) {
    // blocks per second, from the game's movement values
    const METHODS = [
      ["Walking", 4.317], ["Sprinting", 5.612], ["Sprint-jumping", 7.127], ["Horse, the fastest kind", 14.57],
      ["Elytra with rockets", 33.5], ["Boat on packed ice", 40], ["Boat on blue ice", 72.73]
    ];
    const num = $("[data-pl-num]", pl), range = $("[data-pl-range]", pl), nether = $("[data-pl-nether]", pl);
    const rows = $("[data-pl-rows]", pl), sum = $("[data-pl-sum]", pl), food = $("[data-pl-food]", pl);
    let dist = 10000;
    rows.innerHTML = METHODS.map(m => '<li><span class="pl-m">' + m[0] + '<small>' + m[1] + ' blocks a second</small></span><span class="pl-bar"><i></i></span><b class="pl-t"></b></li>').join("");
    const items = $$("li", rows);
    const toRange = d => Math.round((Math.log10(d) - 1) / 5 * 1000);
    const fromRange = v => { const d = Math.pow(10, 1 + 5 * v / 1000); return d < 100 ? Math.round(d) : d < 1e4 ? Math.round(d / 10) * 10 : Math.round(d / 100) * 100; };
    function dur(s) {
      s = Math.round(s);
      if (s < 60) return s + " s";
      const m = Math.floor(s / 60);
      if (m < 60) return m + " min" + (m < 10 && s % 60 ? " " + (s % 60) + " s" : "");
      const h = Math.floor(m / 60);
      if (h < 48) return h + " h" + (m % 60 ? " " + (m % 60) + " min" : "");
      return fmt(Math.floor(h / 24)) + " days" + (h % 24 ? " " + (h % 24) + " h" : "");
    }
    function parse(v) {
      const t = String(v).toLowerCase().replace(/[\s,_]/g, "");
      const m = /^(\d+(?:\.\d+)?)(k|m)?$/.exec(t);
      if (!m) return null;
      return Math.round(parseFloat(m[1]) * (m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : 1));
    }
    function paint(from) {
      const go = nether.checked ? Math.ceil(dist / 8) : dist;
      if (from !== "num") num.value = fmt(dist);
      if (from !== "range") range.value = toRange(dist);
      range.setAttribute("aria-valuetext", fmt(dist) + " blocks");
      sum.innerHTML = nether.checked
        ? "<b>" + fmt(dist) + "</b> blocks up here is <b>" + fmt(go) + "</b> blocks in the Nether."
        : "<b>" + fmt(dist) + "</b> blocks in a straight line.";
      const slow = go / METHODS[0][1];
      METHODS.forEach((m, i) => {
        const t = go / m[1], li = items[i];
        $(".pl-t", li).textContent = dur(t);
        $("i", li).style.width = Math.max(1.5, t / slow * 100) + "%";
      });
      const pts = go / 40;   // sprinting costs 0.1 exhaustion a block, 4 exhaustion is one food point
      food.innerHTML = "Sprinting " + fmt(go) + " blocks burns about <b>" + fmt(Math.max(1, pts)) + " food points</b>" +
        (pts >= 21 ? ", about " + fmt(pts / 20.8) + " cooked steak" + (Math.round(pts / 20.8) === 1 ? "" : "s") : "") +
        ". A fresh spawn sprints about 760 blocks before hunger stops it, and the five starter cookies add about 480.";
    }
    range.addEventListener("input", () => { dist = fromRange(+range.value); paint("range"); });
    num.addEventListener("input", () => {
      const v = parse(num.value);
      num.setAttribute("aria-invalid", v == null || v < 1 ? "true" : "false");
      if (v != null && v >= 1) { dist = Math.min(30000000, v); paint("num"); }
    });
    num.addEventListener("blur", () => { num.removeAttribute("aria-invalid"); dist = Math.max(1, dist); paint(); });
    num.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); num.blur(); } });
    nether.addEventListener("change", () => paint());
    $$("[data-pl-set]", pl).forEach(b => b.addEventListener("click", () => { dist = +b.dataset.plSet; paint(); }));
    paint();
    window.wellobyPlanner = {
      set(n) {
        n = Math.round(Number(n));
        if (!(n >= 1)) return;
        dist = Math.min(30000000, n); paint();
        pl.dataset.flash = "1"; setTimeout(() => { delete pl.dataset.flash; }, 900);
      }
    };
  }

  /* ---------- contact helper ---------- */
  const reach = $("[data-reach]");
  if (reach) {
    const admin = (W.contact && W.contact.adminDiscord) || "WELLOBY";
    const TOPICS = {
      question: { head: "Question", where: "Ask in <b>#general</b> on Discord. Most answers are faster from kevzy, the help bot on this page.", label: "Your question", ask: true },
      report: { head: "Report", where: "Post it in <b>#reports</b> on Discord, with a clip if you have one. Hacked clients are allowed, so hacking itself is not something to report.", label: "What happened, where (x, z) and when" },
      appeal: { head: "Ban appeal", where: "One message in <b>#ban-appeals</b> on Discord. Say what happened and keep it short.", label: "What happened" },
      bug: { head: "Bug or idea", where: "Post it in <b>#general</b> on Discord. If it breaks the server, use <b>#reports</b>.", label: "What you found, or what you'd like" },
      business: { head: "Videos and partnerships", where: "Send a direct message to <b>" + esc(admin) + "</b> on Discord.", label: "Who you are and what you have in mind" }
    };
    let topic = "question";
    const whereEl = $("[data-reach-where]", reach), nameIn = $("[data-reach-name]", reach), textIn = $("[data-reach-text]", reach);
    const textLabel = $("[data-reach-text-label]", reach), copyBtn = $("[data-reach-copy]", reach);
    const open = $("[data-reach-open]", reach);
    if (links.discord) open.href = links.discord;
    function compose() {
      const t = TOPICS[topic], name = nameIn.value.trim(), body = textIn.value.trim();
      const lines = [t.head, "In-game name: " + (name || "?")];
      if (body) lines.push(body);
      return lines.join("\n");
    }
    function paint() {
      const t = TOPICS[topic];
      $$("[data-topic]", reach).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.topic === topic)));
      whereEl.innerHTML = t.where + (t.ask ? ' <button type="button" class="ask-link" data-ask="what can you do">Ask kevzy</button>' : "");
      textLabel.textContent = t.label;
      copyBtn.dataset.copy = compose();
    }
    $$("[data-topic]", reach).forEach(b => b.addEventListener("click", () => { topic = b.dataset.topic; paint(); }));
    nameIn.addEventListener("input", () => { copyBtn.dataset.copy = compose(); });
    textIn.addEventListener("input", () => { copyBtn.dataset.copy = compose(); });
    paint();
  }

  /* ---------- donations ---------- */
  const jar = $("[data-tipjar]");
  if (jar) {
    const acts = $("[data-tip-acts]", jar), kofi = $('[data-tip="kofi"]', jar);
    if (donate.kofi && kofi) kofi.href = donate.kofi;
    const extra = [];
    if (donate.bmc) extra.push(['<svg class="i"><use href="#i-heart"/></svg>Buy Me a Coffee', donate.bmc, "bmc"]);
    if (donate.paypal) extra.push(["PayPal", donate.paypal, "paypal"]);
    extra.forEach(x => {
      const a = document.createElement("a");
      a.className = "btn btn-line btn-l"; a.href = x[1]; a.target = "_blank"; a.rel = "noopener"; a.dataset.tip = x[2];
      a.innerHTML = x[0] + '<svg class="i"><use href="#i-ext"/></svg>';
      acts.append(a);
    });
    const goalEl = $("[data-goal]", jar), fill = $("[data-goal-fill]", jar), bar = $("[data-goal-bar]", jar);
    const totalEl = $("[data-goal-total]", jar), ofEl = $("[data-goal-of]", jar), staticEl = $("[data-goal-static]", jar);
    const sup = $("[data-supporters]", jar), supList = $("[data-supporters-list]", jar);
    const money = (n, cur) => (cur && cur !== "USD" ? cur + " " : "$") + (Math.round(n * 100) % 100 ? n.toFixed(2) : fmt(n));
    /* the donation counter: the configured address, or the community API once it answers */
    const stateUrl = () => donate.stateUrl || (window.wellobyCommunity && window.wellobyCommunity.online ? window.wellobyCommunity.api + "/donate/state" : "");
    let seen = false;
    addEventListener("welloby:community", e => { if (seen && e.detail && e.detail.online && !donate.stateUrl) live(); });
    async function live() {
      seen = true;
      const url = stateUrl();
      if (!url || W.preview) return;
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000);
      try {
        const r = await fetch(url, { signal: ctl.signal, cache: "no-store", credentials: "omit" });
        if (!r.ok) throw new Error("state");
        const d = await r.json();
        const goal = Number(d.goal) || Number(donate.goal) || 0, total = Math.max(0, Number(d.total) || 0);
        if (goal > 0) {
          const pct = Math.min(100, total / goal * 100);
          totalEl.textContent = money(total);
          ofEl.textContent = "of " + money(goal) + " this month" + (d.count ? ", from " + fmt(d.count) + " supporter" + (d.count === 1 ? "" : "s") : "");
          fill.style.width = pct + "%";
          bar.setAttribute("aria-valuenow", String(Math.round(pct)));
          bar.setAttribute("aria-valuetext", money(total) + " of " + money(goal));
          goalEl.hidden = false; staticEl.hidden = true;
        }
        const recent = (Array.isArray(d.recent) ? d.recent : []).filter(x => x && !x.test && x.name && Number(x.amount) > 0).slice(0, 6);
        if (recent.length) {
          supList.innerHTML = recent.map(x => {
            const when = x.at ? new Date(x.at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
            const msg = String(x.message || "").trim().slice(0, 120);
            return "<li><b>" + esc(String(x.name).slice(0, 40)) + "</b><span>" + money(Number(x.amount), x.currency) + (when ? ", " + when : "") + "</span>" + (msg ? "<q>" + esc(msg) + "</q>" : "") + "</li>";
          }).join("");
          sup.hidden = false;
        }
      } catch (e) { /* the static goal line stays */ }
      finally { clearTimeout(timer); }
    }
    new IntersectionObserver((es, ob) => { if (es.some(x => x.isIntersecting)) { ob.disconnect(); live(); } }, { rootMargin: "400px" }).observe(jar);
  }

  /* ---------- videos: nothing loads from TikTok or YouTube until someone presses play ---------- */
  $$("[data-video]").forEach(fig => {
    const btn = $(".vid-play", fig);
    if (!btn) return;
    btn.addEventListener("click", () => {
      const f = document.createElement("iframe");
      f.src = fig.dataset.video;
      f.title = (btn.getAttribute("aria-label") || "Video").replace(/^Play the /, "");
      f.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write; web-share";
      f.allowFullscreen = true;
      f.referrerPolicy = "strict-origin-when-cross-origin";
      btn.replaceWith(f);
      fig.classList.add("playing");
      f.focus();
    });
  });

  /* ---------- invite and share ---------- */
  const java = (server.java && server.java.host) || "mc.welloby.com";
  const bed = server.bedrock || {};
  const invite = "come play on welloby, a minecraft anarchy server. one map, no resets.\n" +
    "java: " + java + " (1.7.2 to 26.3)\n" +
    (bed.host ? "bedrock: " + bed.host + " port " + bed.port + "\n" : "") +
    "first join you set a password, then you spawn somewhere random.\n" + SITE;
  $$("[data-invite]").forEach(b => b.addEventListener("click", () => copy(invite, "an invite. Paste it to your friend.")));
  $$("[data-share]").forEach(b => b.addEventListener("click", async () => {
    const data = { title: "Welloby Anarchy", text: "A Minecraft anarchy server with one map that never resets. " + java, url: SITE + "/" };
    if (navigator.share) {
      try { await navigator.share(data); return; }
      catch (e) { if (e && e.name === "AbortError") return; }
    }
    copy(data.url, "the link to the site");
  }));
})();
