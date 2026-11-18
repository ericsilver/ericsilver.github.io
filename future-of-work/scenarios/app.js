/* Automation scenarios: one scenario (index, intensity, robots) shown for the economy, one occupation or one worker type.
   Data: ../data/meta.json, economy.json and s/<scenario>.json (see the export script in the simulation repository). */
(function () {
  "use strict";
  const DATA = "../data/";
  const NS = "http://www.w3.org/2000/svg";
  const $ = (q, r) => (r || document).querySelector(q);

  // ------------------------------------------------------------------ small helpers
  function put(e, kids) {
    for (const k of kids.flat(Infinity)) {
      if (k === null || k === undefined || k === false) continue;
      e.appendChild(typeof k === "object" ? k : document.createTextNode(String(k)));
    }
    return e;
  }
  function attrs(e, a) {
    for (const k in a || {}) {
      const v = a[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") e.setAttribute("class", v);
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    return e;
  }
  const h = (tag, a, ...kids) => put(attrs(document.createElement(tag), a), kids);
  const sv = (tag, a, ...kids) => put(attrs(document.createElementNS(NS, tag), a), kids);
  const ok = (x) => x !== null && x !== undefined && Number.isFinite(x);
  const MINUS = "−";
  function pct(x, d) {
    if (!ok(x)) return "n/a";
    const v = 100 * x;
    if (v > 0 && v < 0.05 && (d === undefined || d === 1)) return "<0.1%";
    return v.toFixed(d === undefined ? 1 : d) + "%";
  }
  function chg(x, d) {
    if (!ok(x)) return "n/a";
    const v = (100 * x).toFixed(d === undefined ? 1 : d);
    if (Number(v) === 0) return "0.0%";
    return (x > 0 ? "+" : MINUS) + v.replace("-", "") + "%";
  }
  function workers(x) {
    if (!ok(x)) return "n/a";
    if (x >= 1e6) return (x / 1e6).toFixed(x >= 1e7 ? 0 : 1) + " million";
    return (Math.round(x / 1000) * 1000).toLocaleString("en-US");
  }
  const money = (x) => (ok(x) ? "$" + (Math.round(x / 100) * 100).toLocaleString("en-US") : "n/a");
  function wavg(v, w, keep) {
    let a = 0, b = 0;
    for (let i = 0; i < v.length; i++) {
      if (!ok(v[i]) || !ok(w[i]) || (keep && !keep(i))) continue;
      a += v[i] * w[i]; b += w[i];
    }
    return b > 0 ? a / b : null;
  }
  function wquant(v, w, qs) {
    const idx = [];
    for (let i = 0; i < v.length; i++) if (ok(v[i]) && ok(w[i]) && w[i] > 0) idx.push(i);
    idx.sort((a, b) => v[a] - v[b]);
    const tot = idx.reduce((s, i) => s + w[i], 0);
    return qs.map((q) => {
      let c = 0;
      for (const i of idx) { c += w[i]; if (c >= q * tot) return v[i]; }
      return idx.length ? v[idx[idx.length - 1]] : null;
    });
  }
  function ticks(lo, hi, n) {
    if (!(hi > lo)) { hi = lo + 1e-6; }
    const raw = (hi - lo) / (n || 5), p = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) || raw;
    const out = [];
    for (let t = Math.ceil(lo / step - 1e-9) * step; t <= hi + step * 1e-6; t += step) out.push(Math.abs(t) < step * 1e-6 ? 0 : t);
    return out;
  }
  const tickPct = (t, step) => { const d = Math.abs(100 * step - Math.round(100 * step)) > 1e-6 ? 1 : 0; return (t < -1e-12 ? MINUS : "") + Math.abs(100 * t).toFixed(d) + "%"; };
  const trunc = (t, n) => (t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t);

  // ------------------------------------------------------------------ tooltip
  const tip = $("#tip");
  function showTip(ev, title, lines) {
    tip.replaceChildren(h("b", { text: title }), ...lines.map((l) => h("span", { text: l })));
    tip.style.display = "block";
    const r = tip.getBoundingClientRect();
    let x = ev.clientX + 14, y = ev.clientY + 14;
    if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - 14;
    if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - 14;
    tip.style.left = Math.max(4, x) + "px";
    tip.style.top = Math.max(4, y) + "px";
  }
  const hideTip = () => { tip.style.display = "none"; };

  // ------------------------------------------------------------------ data
  let META, ECON;
  const IX = new Map(), SC = new Map(), OCC_SOC = new Map(), COH_POS = new Map(), cache = new Map();
  const FAMILY = { stage: "Career stage", school: "Schooling", field: "Degree and field", school_stage: "Schooling and career stage",
    group: "Current occupation group", history: "Earlier work in another occupation group", all: "All workers" };
  const st = { index: null, level: null, robots: "r0", scope: "economy", soc: null, cohort: null };
  let maxRemoved = 0.3, note = "";

  const key = (i, l, r) => i + "|" + l + "|" + r;
  const scen = (i, l, r) => SC.get(key(i, l, r)) || null;
  const robotsOf = (i, l) => META.robots.filter((r) => scen(i, l, r.id));
  const levelsOf = (i) => (IX.get(i) ? IX.get(i).levels.filter((l) => META.robots.some((r) => scen(i, l.id, r.id))) : []);
  const econ = (s) => (s ? ECON[s.id] : null);

  function loadScen(s) {
    if (!cache.has(s.id)) {
      cache.set(s.id, fetch(DATA + s.file).then((r) => { if (!r.ok) throw new Error(s.file + " " + r.status); return r.json(); }));
    }
    return cache.get(s.id);
  }
  function prepare(meta, economy) {
    META = meta; ECON = economy;
    META.cohorts = META.cohorts || [];
    for (const s of META.scenarios) if (ECON[s.id]) SC.set(key(s.index, s.level, s.robots), s);
    for (const ix of META.indexes) IX.set(ix.id, ix);
    if (!IX.has("none") && META.scenarios.some((s) => s.index === "none")) {
      const ix = { id: "none", label: "Robots only", note: "No AI; only the robot setting applies.", levels: [{ id: "none", label: "no AI", time_removed: 0 }] };
      META.indexes.push(ix); IX.set("none", ix);
    }
    const tr = (ix, l) => { const s = META.robots.map((r) => scen(ix.id, l.id, r.id)).find(Boolean); return s ? ECON[s.id].time_removed : l.time_removed || 0; };
    for (const ix of META.indexes) ix.levels = ix.levels.slice().sort((a, b) => tr(ix, a) - tr(ix, b));
    META.indexes = META.indexes.filter((ix) => levelsOf(ix.id).length);
    META.occupations.forEach((o, i) => { if (!ok(o.i)) o.i = i; OCC_SOC.set(o.soc, o); });
    META.cohorts.forEach((c, i) => COH_POS.set(c.id, i));
    maxRemoved = Math.max(0.05, ...Object.values(ECON).map((e) => e.time_removed || 0));
  }

  // ------------------------------------------------------------------ state
  function readURL() {
    const q = new URLSearchParams(location.search);
    for (const k of ["index", "level", "robots", "scope", "soc", "cohort"]) if (q.get(k)) st[k] = q.get(k);
  }
  function writeURL() {
    const q = new URLSearchParams();
    q.set("index", st.index); q.set("level", st.level); q.set("robots", st.robots); q.set("scope", st.scope);
    if (st.scope === "occ" && st.soc) q.set("soc", st.soc);
    if (st.scope === "cohort" && st.cohort) q.set("cohort", st.cohort);
    history.replaceState(null, "", "?" + q.toString());
  }
  function fixState() {
    note = "";
    if (!IX.has(st.index) || !levelsOf(st.index).length) st.index = IX.has("aei") ? "aei" : META.indexes[0].id;
    const lv = levelsOf(st.index);
    if (!lv.some((l) => l.id === st.level)) st.level = (lv.find((l) => l.id === "subst") || lv[Math.min(lv.length - 1, Math.floor(lv.length / 2))]).id;
    const rb = robotsOf(st.index, st.level);
    if (!rb.some((r) => r.id === st.robots)) {
      const want = META.robots.find((r) => r.id === st.robots);
      st.robots = (rb.find((r) => r.id === "r0") || rb[0]).id;
      if (want && st.index !== "none") note = "No run exists with robots at " + pct(want.share, 0) + " for this index and level; showing " + (st.robots === "r0" ? "no robots" : "robots at " + pct(META.robots.find((r) => r.id === st.robots).share, 0)) + ".";
    }
    if (!["economy", "occ", "cohort"].includes(st.scope)) st.scope = "economy";
    if (st.scope === "cohort" && !META.cohorts.length) st.scope = "economy";
    if (!OCC_SOC.has(st.soc)) st.soc = META.occupations.reduce((a, b) => (b.emp > a.emp ? b : a)).soc;
    if (!COH_POS.has(st.cohort) && META.cohorts.length) st.cohort = (META.cohorts.find((c) => c.family === "stage") || META.cohorts[0]).id;
  }
  function set(patch) { Object.assign(st, patch); update(); }

  // ------------------------------------------------------------------ controls
  function radio(label, checked, onclick, extra) {
    return h("button", Object.assign({ type: "button", role: "radio", "aria-checked": checked ? "true" : "false", onclick }, extra || {}), label);
  }
  function renderControls() {
    $("#ctl-index").replaceChildren(...META.indexes.map((ix) =>
      radio(ix.id === "none" ? "Robots only" : ix.label, ix.id === st.index, () => set({ index: ix.id }))));
    $("#index-note").textContent = (IX.get(st.index).note || "");
    const lv = levelsOf(st.index);
    const cur = scen(st.index, st.level, st.robots);
    $("#ctl-level").replaceChildren(...lv.map((l) => {
      const s = scen(st.index, l.id, st.robots) || scen(st.index, l.id, "r0");
      const t = s && econ(s) ? econ(s).time_removed : l.time_removed;
      return radio(st.index === "none" ? "no AI" : pct(t), l.id === st.level, () => set({ level: l.id }), { title: l.label, disabled: st.index === "none" });
    }));
    const lcur = lv.find((l) => l.id === st.level);
    $("#level-note").textContent = st.index === "none" ? "Only the robot setting applies." : "Level: " + lcur.label + ".";
    $("#ctl-robots").replaceChildren(...META.robots.map((r) =>
      radio(r.id === "r0" ? "none" : pct(r.share, 0), r.id === st.robots, () => set({ robots: r.id }), { disabled: !scen(st.index, st.level, r.id), title: r.label })));
    $("#robots-note").textContent = note;
    const e = econ(cur);
    const rob = e.time_robot || 0, aug = e.time_aug || 0, ai = ok(e.time_ai) ? e.time_ai : Math.max(0, e.time_removed - rob - aug);
    const parts = [["AI: tasks removed", ai, "var(--s-ai)"], ["AI: time saved on tasks that stay", aug, "var(--s-aug)"], ["Robots: tasks removed", rob, "var(--s-rob)"]];
    $("#meter").replaceChildren(
      h("div", { class: "big", text: pct(e.time_removed) }),
      h("div", { class: "meterbar", role: "img", "aria-label": parts.map((p) => p[0] + " " + pct(p[1])).join("; ") },
        parts.filter((p) => p[1] > 0).map((p) => h("span", { style: "background:" + p[2] + ";width:" + (100 * p[1] / maxRemoved).toFixed(2) + "%" }))),
      h("div", { class: "keys" }, parts.filter((p) => p[1] > 0 || p[0].startsWith("AI: tasks")).map((p) =>
        h("span", { class: "key" }, h("i", { style: "background:" + p[2] }), p[0] + " ", h("b", { text: pct(p[1]) })))));
    $("#ctl-scope").replaceChildren(
      radio("Economy", st.scope === "economy", () => set({ scope: "economy" })),
      radio("Occupation", st.scope === "occ", () => set({ scope: "occ" })),
      radio("Worker type", st.scope === "cohort", () => set({ scope: "cohort" }), { disabled: !META.cohorts.length }));
    $("#pick-occ").classList.toggle("hidden", st.scope !== "occ");
    $("#pick-coh").classList.toggle("hidden", st.scope !== "cohort");
    const o = OCC_SOC.get(st.soc);
    $("#occ-cur").textContent = o ? "Showing: " + o.title : "";
    if (META.cohorts.length) {
      const fams = [...new Set(META.cohorts.map((c) => c.family))];
      const c = META.cohorts[COH_POS.get(st.cohort)];
      const fsel = $("#coh-fam"), csel = $("#coh-id");
      fsel.replaceChildren(...fams.map((f) => h("option", { value: f, selected: f === c.family }, FAMILY[f] || f)));
      let members = META.cohorts.filter((x) => x.family === c.family);
      if (["field", "group", "history"].includes(c.family)) members = members.slice().sort((a, b) => a.label.localeCompare(b.label));
      csel.replaceChildren(...members.map((x) => h("option", { value: x.id, selected: x.id === c.id }, x.label)));
    }
  }
  function wirePickers() {
    const q = $("#occ-q"), list = $("#occ-list");
    let hits = [], cur = -1;
    const close = () => { list.classList.add("hidden"); q.setAttribute("aria-expanded", "false"); cur = -1; };
    const choose = (o) => { q.value = ""; close(); set({ scope: "occ", soc: o.soc }); };
    function paint() {
      list.replaceChildren(...hits.map((o, i) => h("li", { role: "option", "aria-selected": i === cur ? "true" : "false", onmousedown: (ev) => { ev.preventDefault(); choose(o); } },
        o.title, h("small", { text: o.major_name || "" }))));
      list.classList.toggle("hidden", !hits.length);
      q.setAttribute("aria-expanded", hits.length ? "true" : "false");
    }
    q.addEventListener("input", () => {
      const t = q.value.trim().toLowerCase();
      if (!t) { hits = []; paint(); return; }
      const words = t.split(/\s+/);
      hits = META.occupations.filter((o) => { const s = o.title.toLowerCase(); return words.every((w) => s.includes(w)); })
        .sort((a, b) => (b.title.toLowerCase().startsWith(t) - a.title.toLowerCase().startsWith(t)) || b.emp - a.emp).slice(0, 12);
      cur = hits.length ? 0 : -1; paint();
    });
    q.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowDown" && hits.length) { cur = (cur + 1) % hits.length; paint(); ev.preventDefault(); }
      else if (ev.key === "ArrowUp" && hits.length) { cur = (cur - 1 + hits.length) % hits.length; paint(); ev.preventDefault(); }
      else if (ev.key === "Enter" && cur >= 0) { choose(hits[cur]); ev.preventDefault(); }
      else if (ev.key === "Escape") close();
    });
    q.addEventListener("blur", close);
    $("#coh-fam").addEventListener("change", (ev) => set({ cohort: META.cohorts.find((c) => c.family === ev.target.value).id }));
    $("#coh-id").addEventListener("change", (ev) => set({ cohort: ev.target.value }));
  }

  // ------------------------------------------------------------------ charts
  /* A chart is drawn at the pixel width of its container, so text stays the same size on every screen. */
  const RO = new ResizeObserver((entries) => {
    const list = entries.map((en) => [en.target, en.contentRect.width]);
    requestAnimationFrame(() => { for (const [t, w] of list) if (t.isConnected) drawChart(t, w); });
  });
  function chart(draw) { const d = h("div", { class: "chart" }); d._draw = draw; RO.observe(d); return d; }
  function drawChart(el, w) {
    const W = Math.max(280, Math.min(760, Math.round(w)));
    if (!w || el._w === W) return;
    el._w = W; el.replaceChildren(el._draw(W));
  }
  function frame(W, H, m) {
    const svg = sv("svg", { viewBox: "0 0 " + W + " " + H, role: "img" });
    return { svg, W, H, m, x0: m.l, x1: W - m.r, y0: H - m.b, y1: m.t };
  }
  function scale(d0, d1, r0, r1) { const k = (r1 - r0) / ((d1 - d0) || 1); return (v) => r0 + (v - d0) * k; }
  function yAxis(f, lo, hi, n) {
    let tk = ticks(lo, hi, n || 5);
    const step = tk.length > 1 ? tk[1] - tk[0] : (hi - lo) || 1;
    const d0 = Math.floor(lo / step + 1e-9) * step, d1 = Math.max(Math.ceil(hi / step - 1e-9) * step, d0 + step);
    tk = ticks(d0, d1, Math.round((d1 - d0) / step));
    const y = scale(d0, d1, f.y0, f.y1);
    for (const t of tk) {
      put(f.svg, [sv("line", { class: t === 0 ? "zero" : "grid", x1: f.x0, x2: f.x1, y1: y(t), y2: y(t) }),
        sv("text", { x: f.x0 - 6, y: y(t) + 3.5, "text-anchor": "end" }, tickPct(t, step))]);
    }
    return y;
  }
  function xAxis(f, lo, hi, title, n) {
    const tk = ticks(lo, hi, n || 6), step = tk.length > 1 ? tk[1] - tk[0] : 1, x = scale(lo, hi, f.x0, f.x1);
    put(f.svg, [sv("line", { class: "axis", x1: f.x0, x2: f.x1, y1: f.y0, y2: f.y0 })]);
    for (const t of tk) if (t >= lo - 1e-9 && t <= hi + 1e-9) put(f.svg, [sv("text", { x: x(t), y: f.y0 + 14, "text-anchor": "middle" }, tickPct(t, step))]);
    if (title) put(f.svg, [sv("text", { x: (f.x0 + f.x1) / 2, y: f.H - 4, "text-anchor": "middle" }, title)]);
    return x;
  }

  /* Lines over the index's intensity levels. series: [{name, pts:[{x,y}], color, dash, width}], band: [{x,lo,hi}], labels: level names by x. */
  function lineChart(o, W) {
    const narrow = W < 440;
    const f = frame(W, o.height || 250, { l: 46, r: narrow ? 14 : 136, t: 12, b: 36 });
    const all = o.series.flatMap((s) => s.pts.filter((p) => ok(p.y)));
    if (!all.length) return h("p", { class: "meta", text: "No runs to plot at this setting." });
    const ys = all.map((p) => p.y).concat((o.band || []).flatMap((b) => [b.lo, b.hi]).filter(ok), [0]);
    const xs = [...new Set(all.map((p) => p.x))].sort((a, b) => a - b);
    if (xs.length < 2) return h("p", { class: "meta", text: "Only one intensity level has a run at this robot setting, so there is no line to draw. The table has the numbers." });
    const xhi = Math.max(...xs) * 1.04 || 0.01;
    const y = yAxis(f, Math.min(...ys), Math.max(...ys)), x = xAxis(f, 0, xhi, "Share of all work time removed");
    if (o.band && o.band.length > 1) {
      const b = o.band.filter((p) => ok(p.lo) && ok(p.hi));
      f.svg.appendChild(sv("path", { d: "M" + b.map((p) => x(p.x) + "," + y(p.hi)).join("L") + "L" + b.slice().reverse().map((p) => x(p.x) + "," + y(p.lo)).join("L") + "Z", style: "fill:var(--band)" }));
    }
    if (ok(o.markX)) f.svg.appendChild(sv("line", { x1: x(o.markX), x2: x(o.markX), y1: f.y1, y2: f.y0, style: "stroke:var(--line2);stroke-dasharray:3 3" }));
    const ends = [];
    for (const s of o.series) {
      const p = s.pts.filter((q) => ok(q.y));
      if (!p.length) continue;
      f.svg.appendChild(sv("path", { d: "M" + p.map((q) => x(q.x) + "," + y(q.y)).join("L"), fill: "none", "stroke-linejoin": "round", "stroke-linecap": "round",
        style: "stroke:" + s.color + ";stroke-width:" + (s.width || 2) + (s.dash ? ";stroke-dasharray:" + s.dash : "") }));
      for (const q of p) {
        const on = ok(o.markX) && Math.abs(q.x - o.markX) < 1e-9;
        f.svg.appendChild(sv("circle", { cx: x(q.x), cy: y(q.y), r: on ? 4.5 : 2.5, style: "fill:" + s.color + ";stroke:var(--bg);stroke-width:" + (on ? 2 : 1) }));
      }
      const last = p[p.length - 1];
      ends.push({ y: y(last.y), x: x(last.x), name: s.name });
    }
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
    if (!narrow) for (const e of ends) f.svg.appendChild(sv("text", { class: "lab", x: e.x + 8, y: e.y + 3.5 }, e.name));
    const cross = sv("line", { y1: f.y1, y2: f.y0, style: "stroke:var(--ctx2);display:none" });
    const hit = sv("rect", { x: f.x0, y: f.y1, width: f.x1 - f.x0, height: f.y0 - f.y1, fill: "transparent" });
    hit.addEventListener("mousemove", (ev) => {
      const r = hit.getBoundingClientRect(), vx = (ev.clientX - r.left) / r.width * (f.x1 - f.x0) + f.x0;
      const near = xs.reduce((a, b) => (Math.abs(x(b) - vx) < Math.abs(x(a) - vx) ? b : a));
      cross.setAttribute("x1", x(near)); cross.setAttribute("x2", x(near)); cross.style.display = "";
      showTip(ev, ((o.labels && o.labels.get(near)) || "Level") + ": " + pct(near) + " of work time removed",
        o.series.map((s) => { const p = s.pts.find((q) => q.x === near); return p && ok(p.y) ? s.name + ": " + (o.share ? pct(p.y) : chg(p.y)) : null; }).filter(Boolean)
          .concat(o.band ? o.band.filter((b) => b.x === near && ok(b.lo)).map((b) => o.bandName + ": " + chg(b.lo) + " to " + chg(b.hi)) : []));
    });
    hit.addEventListener("mouseleave", () => { cross.style.display = "none"; hideTip(); });
    put(f.svg, [cross, hit]);
    f.svg.setAttribute("aria-label", o.aria || "Line chart across intensity levels");
    return f.svg;
  }
  function lineLegend(series, band) {
    return h("div", { class: "legend" }, series.map((s) => h("span", null,
      sv("svg", { viewBox: "0 0 26 10" }, sv("line", { x1: 1, x2: 25, y1: 5, y2: 5, style: "stroke:" + s.color + ";stroke-width:" + (s.width || 2) + (s.dash ? ";stroke-dasharray:" + s.dash : "") })), s.name)),
      band ? h("span", null, sv("svg", { viewBox: "0 0 26 10" }, sv("rect", { x: 1, y: 1, width: 24, height: 8, style: "fill:var(--band)" })), band) : null);
  }

  /* Occupations: share of time removed (x) against real wage change (y); area follows employment. */
  function scatter(d, selI, onPick, W) {
    const f = frame(W, W < 440 ? 290 : 340, { l: 48, r: 14, t: 12, b: 36 });
    const pts = META.occupations.map((o) => ({ o, x: d.occ.removed[o.i], y: d.occ.wage[o.i] })).filter((p) => ok(p.x) && ok(p.y));
    if (!pts.length) return h("p", { class: "meta", text: "No occupations to plot." });
    const emax = Math.max(...pts.map((p) => p.o.emp));
    const y = yAxis(f, Math.min(0, ...pts.map((p) => p.y)), Math.max(0.001, ...pts.map((p) => p.y)));
    const x = xAxis(f, 0, Math.max(0.02, ...pts.map((p) => p.x)) * 1.03, "Share of the occupation's work time removed");
    for (const p of pts) { p.cx = x(p.x); p.cy = y(p.y); p.r = 1.6 + 8 * Math.sqrt(p.o.emp / emax); }
    pts.sort((a, b) => b.r - a.r);
    const g = sv("g");
    for (const p of pts) {
      g.appendChild(sv("circle", { cx: p.cx, cy: p.cy, r: p.r, style: p.o.cognitive ? "fill:var(--ctx2);fill-opacity:.42;stroke:var(--bg);stroke-width:.6"
        : "fill:none;stroke:var(--ctx2);stroke-opacity:.85;stroke-width:1.1" }));
    }
    f.svg.appendChild(g);
    const ring = sv("circle", { r: 0, style: "fill:none;stroke:var(--sel);stroke-width:1.5;display:none" });
    f.svg.appendChild(ring);
    const sel = pts.find((p) => p.o.i === selI);
    if (sel) {
      const left = sel.cx > (f.x0 + f.x1) / 2;
      put(f.svg, [sv("circle", { cx: sel.cx, cy: sel.cy, r: sel.r + 1.5, style: "fill:var(--sel);stroke:var(--bg);stroke-width:2" }),
        sv("text", { class: "lab", x: sel.cx + (left ? -1 : 1) * (sel.r + 7), y: sel.cy + 4, "text-anchor": left ? "end" : "start",
          style: "font-weight:650;paint-order:stroke;stroke:var(--bg);stroke-width:3px" }, trunc(sel.o.title, 38))]);
    }
    const hit = sv("rect", { x: f.x0 - 10, y: f.y1 - 10, width: f.x1 - f.x0 + 20, height: f.y0 - f.y1 + 20, fill: "transparent", style: onPick ? "cursor:pointer" : "" });
    let near = null;
    hit.addEventListener("mousemove", (ev) => {
      const r = f.svg.getBoundingClientRect(), k = f.W / r.width, vx = (ev.clientX - r.left) * k, vy = (ev.clientY - r.top) * k;
      near = null; let best = 1e9;
      for (const p of pts) { const dd = Math.hypot(p.cx - vx, p.cy - vy) - p.r; if (dd < best) { best = dd; near = p; } }
      if (near && best < 10) {
        ring.setAttribute("cx", near.cx); ring.setAttribute("cy", near.cy); ring.setAttribute("r", near.r + 2.5); ring.style.display = "";
        showTip(ev, near.o.title, ["Time removed: " + pct(near.x), "Real wage: " + chg(near.y), "Employment: " + chg(d.occ.emp[near.o.i]), workers(near.o.emp) + " workers"]);
      } else { near = null; ring.style.display = "none"; hideTip(); }
    });
    hit.addEventListener("mouseleave", () => { ring.style.display = "none"; hideTip(); });
    if (onPick) hit.addEventListener("click", () => { if (near) { hideTip(); onPick(near.o); } });
    f.svg.appendChild(hit);
    f.svg.setAttribute("aria-label", "Each circle is an occupation: share of work time removed against real wage change");
    return f.svg;
  }
  const scatterLegend = (sel) => h("div", { class: "legend" },
    h("span", null, sv("svg", { viewBox: "0 0 26 10" }, sv("circle", { cx: 13, cy: 5, r: 4.2, style: "fill:var(--ctx2);fill-opacity:.42" })), "cognitive occupations (management, professional, sales, office)"),
    h("span", null, sv("svg", { viewBox: "0 0 26 10" }, sv("circle", { cx: 13, cy: 5, r: 3.8, style: "fill:none;stroke:var(--ctx2);stroke-width:1.1" })), "all other occupations"),
    sel ? h("span", null, sv("svg", { viewBox: "0 0 26 10" }, sv("circle", { cx: 13, cy: 5, r: 4.2, style: "fill:var(--sel)" })), "the selected occupation") : null,
    h("span", null, "circle area follows employment"));

  /* Employment by the occupation's real wage change, split into the two groups. */
  function histogram(d, markV, markName, W) {
    const f = frame(W, 250, { l: 46, r: 14, t: 30, b: 36 });
    const occ = META.occupations.filter((o) => ok(d.occ.wage[o.i]));
    const v = occ.map((o) => d.occ.wage[o.i]), w = occ.map((o) => o.emp), tot = w.reduce((a, b) => a + b, 0);
    const [q02, q50, q98] = wquant(v, w, [0.01, 0.5, 0.99]);
    let lo = Math.min(q02, 0), hi = Math.max(q98, 0.001);
    const tk = ticks(lo, hi, W < 440 ? 14 : 22), step = tk.length > 1 ? tk[1] - tk[0] : 0.01;
    lo = Math.floor(lo / step + 1e-9) * step; hi = Math.ceil(hi / step - 1e-9) * step;
    const n = Math.max(1, Math.round((hi - lo) / step)), bins = Array.from({ length: n }, (_, i) => ({ x0: lo + i * step, a: 0, b: 0 }));
    occ.forEach((o, k) => { const i = Math.min(n - 1, Math.max(0, Math.floor((v[k] - lo) / step))); bins[i][o.cognitive ? "a" : "b"] += w[k] / tot; });
    const top = Math.max(...bins.map((b) => b.a + b.b));
    const y = yAxis(f, 0, top, 4), x = xAxis(f, lo, hi, "Real wage change of the occupation", 7);
    const bw = (f.x1 - f.x0) / n;
    for (const b of bins) {
      const px = x(b.x0) + 1, pw = Math.max(1, bw - 2);
      if (b.a > 0) f.svg.appendChild(sv("rect", { x: px, width: pw, y: y(b.a), height: f.y0 - y(b.a), style: "fill:var(--ctx2)" }));
      if (b.b > 0) f.svg.appendChild(sv("rect", { x: px, width: pw, y: y(b.a + b.b), height: Math.max(0, y(b.a) - y(b.a + b.b) - (b.a > 0 ? 2 : 0)), rx: 2, style: "fill:var(--ctx)" }));
      const hit = sv("rect", { x: x(b.x0), width: bw, y: f.y1, height: f.y0 - f.y1, fill: "transparent" });
      hit.addEventListener("mousemove", (ev) => showTip(ev, "Real wage " + chg(b.x0) + " to " + chg(b.x0 + step),
        [pct(b.a + b.b) + " of employment", "Cognitive occupations: " + pct(b.a), "Other occupations: " + pct(b.b)]));
      hit.addEventListener("mouseleave", hideTip);
      f.svg.appendChild(hit);
    }
    const mark = (val, name, strong, row) => {          // labels sit in two rows above the bars, anchored toward the middle
      if (!ok(val)) return;
      const vx = x(Math.min(hi, Math.max(lo, val))), leftSide = vx > (f.x0 + f.x1) / 2, ty = f.y1 - 18 + 13 * row;
      put(f.svg, [sv("line", { x1: vx, x2: vx, y1: ty + 3, y2: f.y0, style: "stroke:var(--sel);stroke-width:" + (strong ? 2 : 1) + (strong ? "" : ";stroke-dasharray:3 3") }),
        sv("text", { class: "lab", x: vx + (leftSide ? -5 : 5), y: ty + 3, "text-anchor": leftSide ? "end" : "start",
          style: "paint-order:stroke;stroke:var(--bg);stroke-width:3px" + (strong ? ";font-weight:650" : "") }, name + " " + chg(val))]);
    };
    const both = markName && ok(markV);
    mark(q50, "median worker's occupation", false, 1);
    if (both) mark(markV, trunc(markName, W < 440 ? 20 : 30), true, 0);
    f.svg.setAttribute("aria-label", "Share of employment by the real wage change of the occupation");
    return f.svg;
  }
  const histLegend = () => h("div", { class: "legend" },
    h("span", { class: "key" }, h("i", { style: "background:var(--ctx2)" }), "cognitive occupations"),
    h("span", { class: "key" }, h("i", { style: "background:var(--ctx)" }), "all other occupations"),
    h("span", null, "height: share of employment"));

  /* Rows with a 10th-to-90th percentile bar, a median tick and a dot at the mean (or a plain bar from zero). */
  function rangeRows(rows, o) {
    o = o || {};
    const vals = rows.flatMap((r) => [r.p10, r.p90, r.mean, r.p50, r.bar]).filter(ok).concat([0]);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo || 0.01) * 0.06; lo -= lo < 0 ? pad : 0; hi += pad;
    const pos = (v) => (100 * (v - lo) / (hi - lo)).toFixed(2) + "%";
    const dec = hi - lo < 0.03 ? 1 : 0;
    const end = (v) => (Math.abs(v) < 5e-4 ? "0%" : o.share ? pct(v, dec) : chg(v, dec));
    const out = h("div", { class: "rows" });
    for (const r of rows) {
      const track = h("div", { style: "position:relative;height:16px" },
        h("div", { style: "position:absolute;top:0;bottom:0;width:1px;background:var(--line2);left:" + pos(0) }));
      const col = r.sel ? "var(--sel)" : "var(--ctx2)";
      if (ok(r.bar)) {
        const a = Math.min(0, r.bar), b = Math.max(0, r.bar);
        track.appendChild(h("div", { style: "position:absolute;top:3px;height:10px;border-radius:2px;background:" + (r.color || col) + ";left:" + pos(a) + ";width:" + (100 * (b - a) / (hi - lo)).toFixed(2) + "%" }));
      }
      if (ok(r.p10) && ok(r.p90)) track.appendChild(h("div", { style: "position:absolute;top:6px;height:4px;border-radius:2px;background:" + (r.sel ? "var(--ctx2)" : "var(--ctx)") + ";left:" + pos(r.p10) + ";width:" + (100 * (r.p90 - r.p10) / (hi - lo)).toFixed(2) + "%" }));
      if (ok(r.p50)) track.appendChild(h("div", { style: "position:absolute;top:2px;height:12px;width:2px;margin-left:-1px;background:" + col + ";left:" + pos(r.p50) }));
      if (ok(r.mean)) track.appendChild(h("div", { style: "position:absolute;top:3px;width:10px;height:10px;margin-left:-5px;border-radius:50%;border:2px solid var(--bg);background:" + col + ";left:" + pos(r.mean) }));
      const row = h(r.onclick ? "button" : "div", { class: "rrow" + (r.sel ? " sel" : ""), type: r.onclick ? "button" : null, onclick: r.onclick || null, title: r.title || null },
        h("span", { class: "nm", text: r.name, title: r.name }), track, h("span", { class: "val", text: r.val }));
      if (r.tip) { row.addEventListener("mousemove", (ev) => showTip(ev, r.name, r.tip)); row.addEventListener("mouseleave", hideTip); }
      out.appendChild(row);
    }
    out.appendChild(h("div", { class: "rrow axisrow" }, h("span"), h("div", { style: "position:relative;height:14px" },
      h("span", { style: "position:absolute;left:0", text: end(lo) }),
      lo < 0 && hi > 0 && (0 - lo) / (hi - lo) > 0.14 && (0 - lo) / (hi - lo) < 0.86 ? h("span", { style: "position:absolute;transform:translateX(-50%);left:" + pos(0), text: "0%" }) : null,
      h("span", { style: "position:absolute;right:0", text: end(hi) })), h("span")));
    return out;
  }
  const rangeLegend = () => h("div", { class: "legend" },
    h("span", null, sv("svg", { viewBox: "0 0 26 10" }, sv("rect", { x: 1, y: 3, width: 24, height: 4, rx: 2, style: "fill:var(--ctx)" })), "10th to 90th percentile of workers"),
    h("span", null, sv("svg", { viewBox: "0 0 26 10" }, sv("rect", { x: 12, y: 0, width: 2, height: 10, style: "fill:var(--ctx2)" })), "median"),
    h("span", null, sv("svg", { viewBox: "0 0 26 10" }, sv("circle", { cx: 13, cy: 5, r: 4, style: "fill:var(--ctx2)" })), "mean"));

  function table(head, rows, cur) {
    return h("div", { class: "tw" }, h("table", null,
      h("thead", null, h("tr", null, head.map((c, i) => h("th", { class: i ? "num" : null, text: c })))),
      h("tbody", null, rows.map((r, k) => h("tr", { class: k === cur ? "cur" : null }, r.map((c, i) => h("td", { class: i ? "num" : null, text: c })))))));
  }
  const details = (title, body) => h("details", null, h("summary", { text: title }), body);
  const tile = (v, l, c, wide) => h("div", { class: "tile" + (wide ? " wide" : "") }, h("div", { class: "v", text: v }), h("div", { class: "l", text: l }), c ? h("div", { class: "c", text: c }) : null);
  const panel = (title, lede, ...kids) => h("div", { class: "card panel" }, h("h2", { text: title }), lede ? h("p", { class: "lede", text: lede }) : null, kids);

  // ------------------------------------------------------------------ shared pieces
  function levelRuns() {                  // scenarios of the current index at the current robot setting, in level order
    if (st.index === "none") {             // robots only: the robot settings are the levels
      return META.robots.map((r) => ({ l: { id: r.id, label: "robots at " + pct(r.share, 0) }, s: scen("none", st.level, r.id) })).filter((x) => x.s && econ(x.s));
    }
    return levelsOf(st.index).map((l) => ({ l, s: scen(st.index, l.id, st.robots) })).filter((x) => x.s && econ(x.s));
  }
  const curRun = (runs) => runs.findIndex((x) => x.l.id === (st.index === "none" ? st.robots : st.level));
  function levelLabels(runs) { return new Map(runs.map((x) => [econ(x.s).time_removed, x.l.label])); }
  function scenarioName() {
    const ix = IX.get(st.index), l = ix.levels.find((x) => x.id === st.level), r = META.robots.find((x) => x.id === st.robots);
    const rob = r && r.id !== "r0" ? "robots on " + pct(r.share, 0) + " of robot-feasible task time" : "";
    const yr = META.year ? " · " + String(META.year).replace(/\.$/, "") : "";
    if (st.index === "none") return "Robots only: " + rob.replace("robots on ", "") + yr;
    return ix.label + " · " + l.label + (rob ? " · plus " + rob : "") + yr;
  }
  /* All workers, from the cohorts of one family that partitions the workforce; percentiles from the mixture of those cohorts. */
  function allWorkers(d) {
    const c = d.coh;
    if (!c || !META.cohorts.length) return null;
    if (COH_POS.has("all")) { const i = COH_POS.get("all"); return { mean: c.pay_mean[i], p10: c.pay_p10[i], p50: c.pay_p50[i], p90: c.pay_p90[i], worse: c.worse[i], moved: c.moved[i], removed: c.removed[i], approx: false }; }
    const fam = ["group", "stage", "school"].find((f) => META.cohorts.some((x) => x.family === f));
    if (!fam) return null;
    const ids = META.cohorts.map((x, i) => (x.family === fam ? i : -1)).filter((i) => i >= 0 && ok(c.pay_mean[i]));
    const w = ids.map((i) => META.cohorts[i].workers), pick = (k) => wavg(ids.map((i) => c[k][i]), w);
    const cdfs = ids.map((i, k) => {
      const a = c.pay_p10[i], m = c.pay_p50[i], b = c.pay_p90[i];
      return { w: w[k], xs: [a - (m - a) / 4, a, m, b, b + (b - m) / 4], ps: [0, 0.1, 0.5, 0.9, 1] };
    }).filter((q) => q.xs.every(ok));
    const W = cdfs.reduce((s, q) => s + q.w, 0);
    const F = (x) => cdfs.reduce((s, q) => {
      if (x <= q.xs[0]) return s;
      if (x >= q.xs[4]) return s + q.w;
      for (let j = 1; j < 5; j++) if (x <= q.xs[j]) return s + q.w * (q.ps[j - 1] + (q.xs[j] > q.xs[j - 1] ? (x - q.xs[j - 1]) / (q.xs[j] - q.xs[j - 1]) : 1) * (q.ps[j] - q.ps[j - 1]));
      return s + q.w;
    }, 0) / W;
    const inv = (p) => { let a = Math.min(...cdfs.map((q) => q.xs[0])), b = Math.max(...cdfs.map((q) => q.xs[4])); for (let k = 0; k < 50; k++) { const m = (a + b) / 2; if (F(m) < p) a = m; else b = m; } return (a + b) / 2; };
    return { mean: pick("pay_mean"), p10: cdfs.length ? inv(0.1) : null, p50: cdfs.length ? inv(0.5) : null, p90: cdfs.length ? inv(0.9) : null,
      worse: pick("worse"), moved: pick("moved"), removed: pick("removed"), approx: true, fam };
  }

  function occTable(d) {                  // built when opened: all occupations, largest wage gain first
    const box = h("div", { class: "tw scroll" });
    const det = details("Table: all occupations", box);
    det.addEventListener("toggle", () => {
      if (!det.open || box.firstChild) return;
      const rows = META.occupations.filter((o) => ok(d.occ.wage[o.i])).sort((a, b) => d.occ.wage[b.i] - d.occ.wage[a.i]);
      box.appendChild(table(["Occupation", "Workers", "Time removed", "Real wage", "Employment", "Leave"],
        rows.map((o) => [o.title, workers(o.emp), pct(d.occ.removed[o.i]), chg(d.occ.wage[o.i]), chg(d.occ.emp[o.i]), pct(d.occ.leave[o.i])])).firstChild);
    });
    return det;
  }

  // ------------------------------------------------------------------ views
  function viewEconomy(d) {
    const e = econ(scen(st.index, st.level, st.robots));
    const runs = levelRuns(), lab = levelLabels(runs);
    const emp = META.occupations.map((o) => o.emp);
    const grp = (cog) => {
      const keep = (i) => META.occupations[i].cognitive === cog;
      const now = META.occupations.reduce((s, o) => s + (o.cognitive === cog && ok(d.occ.emp[o.i]) ? o.emp * (1 + d.occ.emp[o.i]) : 0), 0);
      const base = META.occupations.reduce((s, o) => s + (o.cognitive === cog && ok(d.occ.emp[o.i]) ? o.emp : 0), 0);
      return { share: base / emp.reduce((a, b) => a + b, 0), removed: wavg(d.occ.removed, emp, keep), wage: wavg(d.occ.wage, emp, keep), emp: base ? now / base - 1 : null };
    };
    const cg = grp(true), ot = grp(false);
    if (ok(e.cog_wage)) cg.wage = e.cog_wage;
    if (ok(e.oth_wage)) ot.wage = e.oth_wage;
    if (ok(e.cog_emp)) cg.emp = e.cog_emp;
    const s1 = [{ name: "Output", color: "var(--sel)", width: 2.5, pts: runs.map((x) => ({ x: econ(x.s).time_removed, y: econ(x.s).output })) },
      { name: "Pay, 10th percentile", color: "var(--ctx2)", dash: "5 3", pts: runs.map((x) => ({ x: econ(x.s).time_removed, y: econ(x.s).pay_p10 })) },
      { name: "Pay, median", color: "var(--ctx2)", pts: runs.map((x) => ({ x: econ(x.s).time_removed, y: econ(x.s).pay_p50 })) },
      { name: "Pay, 90th percentile", color: "var(--ctx2)", dash: "1.5 3.5", pts: runs.map((x) => ({ x: econ(x.s).time_removed, y: econ(x.s).pay_p90 })) }];
    const s2 = [{ name: "Lower real pay", color: "var(--sel)", width: 2.5, pts: runs.map((x) => ({ x: econ(x.s).time_removed, y: econ(x.s).worse })) },
      { name: "Change occupation", color: "var(--ctx2)", pts: runs.map((x) => ({ x: econ(x.s).time_removed, y: econ(x.s).moved })) }];
    const rob = e.time_robot || 0, aug = e.time_aug || 0;
    return h("div", { class: "stack" },
      h("div", { class: "head" }, h("h2", { text: "Whole economy" }), h("div", { class: "meta", text: scenarioName() })),
      h("div", { class: "tiles" },
        tile(pct(e.time_removed), "of all work time removed", "AI " + pct(Math.max(0, e.time_removed - rob - aug)) + (aug ? " · assisted " + pct(aug) : "") + (rob ? " · robots " + pct(rob) : "")),
        tile(chg(e.output), "output"),
        tile(chg(e.pay_p10), "real pay at the 10th percentile of pay"),
        tile(chg(e.pay_p50), "real pay at the median"),
        tile(chg(e.pay_p90), "real pay at the 90th percentile"),
        tile(pct(e.worse), "of workers end with lower real pay"),
        tile(pct(e.moved), "of workers change occupation"),
        ok(e.req_dropped) ? tile(String(e.req_dropped), "job requirements dropped", "a requirement goes when every task that carries it is removed") : null),
      h("div", { class: "grid2" },
        panel("Cognitive occupations and all others", "The two groups of Korinek et al. (2026): management, professional, sales and office occupations, and everything else.",
          h("h3", { text: "Share of work time removed" }),
          rangeRows([{ name: "Cognitive (" + pct(cg.share, 0) + " of workers)", bar: cg.removed, val: pct(cg.removed), sel: true }, { name: "All other", bar: ot.removed, val: pct(ot.removed) }], { share: true }),
          h("h3", { text: "Real wage" }),
          rangeRows([{ name: "Cognitive", bar: cg.wage, val: chg(cg.wage), sel: true }, { name: "All other", bar: ot.wage, val: chg(ot.wage) }]),
          h("h3", { text: "Employment" }),
          rangeRows([{ name: "Cognitive", bar: cg.emp, val: chg(cg.emp), sel: true }, { name: "All other", bar: ot.emp, val: chg(ot.emp) }]),
          ok(e.gap_pay) ? h("p", { class: "meta", style: "margin-top:8px", text: "An occupation at the 75th percentile of time removed ends with pay " + chg(e.gap_pay) + " and employment " + chg(e.gap_emp) + " relative to one at the 25th percentile." }) : null),
        panel("Real wage change against work time removed, by occupation", "Each circle is one of " + META.occupations.length + " occupations. Select a circle to open that occupation.",
          scatterLegend(false), chart((W) => scatter(d, -1, (o) => set({ scope: "occ", soc: o.soc }), W)), occTable(d))),
      h("div", { class: "grid2" },
        panel("How workers are spread across occupation wage changes", "Share of employment by the real wage change of the worker's occupation.", histLegend(), chart((W) => histogram(d, null, null, W))),
        panel("Output and pay across this index's intensity levels", "Change from today, at each level of the selected index with the selected robot setting. The larger marker is the current scenario.",
          lineLegend(s1), chart((W) => lineChart({ series: s1, markX: e.time_removed, labels: lab, aria: "Output and real pay by share of work time removed" }, W)))),
      panel("Workers with lower pay and workers who change occupation, across intensity levels", "Share of today's workers.",
        lineLegend(s2), h("div", { style: "max-width:640px" }, chart((W) => lineChart({ series: s2, markX: e.time_removed, labels: lab, share: true, height: 210, aria: "Share of workers with lower pay and share changing occupation" }, W))),
        details("Table: every level of this index", table(["Level", "Time removed", "Output", "Pay 10th", "Pay median", "Pay 90th", "Lower pay", "Change occupation", "Cognitive wage", "Other wage", "Cognitive employment"],
          runs.map((x) => { const q = econ(x.s); return [x.l.label, pct(q.time_removed), chg(q.output), chg(q.pay_p10), chg(q.pay_p50), chg(q.pay_p90), pct(q.worse), pct(q.moved), chg(q.cog_wage), chg(q.oth_wage), chg(q.cog_emp)]; }),
          curRun(runs)))));
  }

  function viewOcc(d, slot) {
    const o = OCC_SOC.get(st.soc), i = o.i, c = d.occ;
    const e = econ(scen(st.index, st.level, st.robots));
    const emp = META.occupations.map((x) => x.emp);
    const rob = ok(c.removed_robot && c.removed_robot[i]) ? c.removed_robot[i] : 0, ai = Math.max(0, (c.removed[i] || 0) - rob);
    const above = wavg(META.occupations.map((x) => (ok(c.wage[x.i]) && ok(c.wage[i]) && c.wage[x.i] > c.wage[i] ? 1 : 0)), emp);
    const dest = ((c.dest && c.dest[i]) || []).filter((p) => p && META.occupations[p[0]] && p[1] > 0);
    const cross = h("div", null, h("p", { class: "meta", text: "Loading the other intensity levels…" }));
    slot.cross = (runs, files) => {
      const x = (r) => econ(r.s).time_removed, lab = levelLabels(runs);
      const ser = [{ name: "Real wage", color: "var(--sel)", width: 2.5, pts: runs.map((r, k) => ({ x: x(r), y: files[k].occ.wage[i] })) },
        { name: "Employment", color: "var(--sel)", dash: "5 3", pts: runs.map((r, k) => ({ x: x(r), y: files[k].occ.emp[i] })) },
        { name: "Pay, people starting here", color: "var(--ctx2)", pts: runs.map((r, k) => ({ x: x(r), y: files[k].occ.pay_mean[i] })) },
        { name: "Median pay, all workers", color: "var(--ctx2)", dash: "1.5 3.5", pts: runs.map((r) => ({ x: x(r), y: econ(r.s).pay_p50 })) }];
      cross.replaceChildren(lineLegend(ser), chart((W) => lineChart({ series: ser, markX: e.time_removed, labels: lab, aria: "This occupation across intensity levels" }, W)),
        details("Table: this occupation at every level", table(["Level", "Time removed, economy", "Time removed here", "Real wage", "Employment", "Pay of starters, mean", "10th pct.", "90th pct.", "Lower pay", "Leave"],
          runs.map((r, k) => { const q = files[k].occ; return [r.l.label, pct(x(r)), pct(q.removed[i]), chg(q.wage[i]), chg(q.emp[i]), chg(q.pay_mean[i]), chg(q.pay_p10[i]), chg(q.pay_p90[i]), pct(q.worse[i]), pct(q.leave[i])]; }),
          curRun(runs))));
    };
    return h("div", { class: "stack" },
      h("div", { class: "head" }, h("h2", { text: o.title }),
        h("div", { class: "meta", text: [o.soc, o.major_name, workers(o.emp) + " workers", ok(o.wage) ? money(o.wage) + " average pay" : null, o.cognitive ? "cognitive group" : null].filter(Boolean).join(" · ") }),
        h("div", { class: "meta", text: scenarioName() })),
      h("div", { class: "tiles" },
        tile(pct(c.removed[i]), "of this occupation's work time removed", "AI " + pct(ai) + (rob ? " · robots " + pct(rob) : "") + " · economy " + pct(e.time_removed)),
        tile(chg(c.wage[i]), "real wage of the occupation", "median pay, all workers " + chg(e.pay_p50)),
        tile(chg(c.emp[i]), "employment in the occupation"),
        tile(chg(c.pay_mean[i]), "real pay of people who start here, mean", "10th to 90th percentile " + chg(c.pay_p10[i]) + " to " + chg(c.pay_p90[i])),
        tile(pct(c.worse[i]), "of them end with lower real pay"),
        tile(pct(c.leave[i]), "of them leave for another occupation")),
      h("div", { class: "grid2" },
        panel("Where this occupation sits among all occupations", ok(above) ? pct(above, 0) + " of workers are in occupations whose real wage rises more than this one's in this scenario." : null,
          scatterLegend(true), chart((W) => scatter(d, i, (x) => set({ soc: x.soc }), W))),
        h("div", { class: "stack" },
          panel("Real pay of the people who start in this occupation", "They hold whichever occupation open to them pays best at the new wages, so some end elsewhere.",
            rangeLegend(), rangeRows([{ name: "Start in this occupation", p10: c.pay_p10[i], p90: c.pay_p90[i], mean: c.pay_mean[i], val: chg(c.pay_mean[i]), sel: true },
              { name: "Occupation's own real wage", bar: c.wage[i], val: chg(c.wage[i]) }, { name: "Median pay, all workers", bar: e.pay_p50, val: chg(e.pay_p50) }])),
          panel("Where the leavers go", dest.length ? "Share of the occupation's starting workers who end in each occupation. Select a row to open it." : null,
            dest.length ? rangeRows(dest.map((p) => ({ name: META.occupations[p[0]].title, bar: p[1], val: pct(p[1]), onclick: () => set({ soc: META.occupations[p[0]].soc }),
              tip: ["Real wage there: " + chg(c.wage[p[0]]), "Time removed there: " + pct(c.removed[p[0]])] })), { share: true })
              : h("p", { class: "meta", text: ok(c.leave[i]) && c.leave[i] > 0 ? "Leavers are spread too thinly to list." : "No one leaves this occupation in this scenario." })))),
      h("div", { class: "grid2" },
        panel("This occupation in the distribution of wage changes", "Share of employment by the real wage change of the worker's occupation.", histLegend(), chart((W) => histogram(d, c.wage[i], o.title, W))),
        panel("This occupation across the index's intensity levels", "Change from today at each level, with the selected robot setting.", cross)));
  }

  function viewCohort(d, slot) {
    const p = COH_POS.get(st.cohort), co = META.cohorts[p], c = d.coh, e = econ(scen(st.index, st.level, st.robots));
    const all = allWorkers(d) || {};
    const fam = META.cohorts.map((x, k) => ({ x, k })).filter((q) => q.x.family === co.family && ok(c.pay_mean[q.k]));
    fam.sort((a, b) => c.pay_mean[b.k] - c.pay_mean[a.k]);
    const cmp = (v, a, f) => (ok(a) ? "all workers " + f(a) : null);
    const cross = h("div", null, h("p", { class: "meta", text: "Loading the other intensity levels…" }));
    slot.cross = (runs, files) => {
      const x = (r) => econ(r.s).time_removed, lab = levelLabels(runs), aw = files.map((f) => allWorkers(f) || {});
      const ser = [{ name: "This worker type, mean", color: "var(--sel)", width: 2.5, pts: runs.map((r, k) => ({ x: x(r), y: files[k].coh.pay_mean[p] })) },
        { name: "All workers, mean", color: "var(--ctx2)", dash: "5 3", pts: runs.map((r, k) => ({ x: x(r), y: aw[k].mean })) }];
      const band = runs.map((r, k) => ({ x: x(r), lo: files[k].coh.pay_p10[p], hi: files[k].coh.pay_p90[p] }));
      cross.replaceChildren(lineLegend(ser, "this worker type, 10th to 90th percentile"),
        chart((W) => lineChart({ series: ser, band, bandName: "10th to 90th percentile", markX: e.time_removed, labels: lab, aria: "Real pay of this worker type across intensity levels" }, W)),
        details("Table: this worker type at every level", table(["Level", "Time removed, economy", "In their occupations", "Pay mean", "10th", "Median", "90th", "Lower pay", "Change occupation", "All workers, mean"],
          runs.map((r, k) => { const q = files[k].coh; return [r.l.label, pct(x(r)), pct(q.removed[p]), chg(q.pay_mean[p]), chg(q.pay_p10[p]), chg(q.pay_p50[p]), chg(q.pay_p90[p]), pct(q.worse[p]), pct(q.moved[p]), chg(aw[k].mean)]; }),
          curRun(runs))));
    };
    return h("div", { class: "stack" },
      h("div", { class: "head" }, h("h2", { text: co.label }),
        h("div", { class: "meta", text: [(FAMILY[co.family] || co.family), workers(co.workers) + " workers", ok(META.workers) ? pct(co.workers / META.workers) + " of the workforce" : null].filter(Boolean).join(" · ") }),
        h("div", { class: "meta", text: scenarioName() })),
      h("div", { class: "tiles" },
        tile(pct(c.removed[p]), "of work time removed in their occupations", cmp(c.removed[p], all.removed, pct)),
        tile(chg(c.pay_mean[p]), "real pay, mean", cmp(c.pay_mean[p], all.mean, chg)),
        tile(chg(c.pay_p50[p]), "real pay, median worker", cmp(c.pay_p50[p], all.p50, chg)),
        tile(chg(c.pay_p10[p]) + " to " + chg(c.pay_p90[p]), "real pay, 10th to 90th percentile", ok(all.p10) ? "all workers " + chg(all.p10) + " to " + chg(all.p90) : null, true),
        tile(pct(c.worse[p]), "end with lower real pay", cmp(c.worse[p], all.worse, pct)),
        tile(pct(c.moved[p]), "change occupation", cmp(c.moved[p], all.moved, pct))),
      h("div", { class: "grid2" },
        h("div", { class: "stack" },
          panel("Real pay change: this worker type and all workers", null, rangeLegend(),
            h("div", { class: "widenames" }, rangeRows([{ name: co.label, p10: c.pay_p10[p], p50: c.pay_p50[p], p90: c.pay_p90[p], mean: c.pay_mean[p], val: chg(c.pay_mean[p]), sel: true },
              { name: "All workers", p10: all.p10, p50: all.p50, p90: all.p90, mean: all.mean, val: chg(all.mean) }])),
            all.approx ? h("p", { class: "meta", style: "margin-top:6px", text: "Percentiles for all workers are approximated from the percentiles of the " + (FAMILY[all.fam] || all.fam).toLowerCase() + " cohorts; the means and shares are exact." }) : null),
          panel("This worker type across the index's intensity levels", "Change in real pay from today at each level, with the selected robot setting.", cross)),
        panel("Compared with the other worker types that share this kind of experience", (FAMILY[co.family] || co.family) + ", ordered by mean real pay change. Select a row to open it.", rangeLegend(),
          h("div", { class: "widenames" + (fam.length > 26 ? " scroll" : "") }, rangeRows(fam.map((q) => ({ name: q.x.label, p10: c.pay_p10[q.k], p50: c.pay_p50[q.k], p90: c.pay_p90[q.k], mean: c.pay_mean[q.k], val: chg(c.pay_mean[q.k]),
            sel: q.k === p, onclick: () => set({ cohort: q.x.id }), tip: [workers(q.x.workers) + " workers", "Time removed in their occupations: " + pct(c.removed[q.k]), "Lower pay: " + pct(c.worse[q.k]), "Change occupation: " + pct(c.moved[q.k])] })))),
          details("Table: " + (FAMILY[co.family] || co.family).toLowerCase(), table(["Worker type", "Workers", "Time removed", "Pay mean", "10th", "Median", "90th", "Lower pay", "Change occupation"],
            fam.map((q) => [q.x.label, workers(q.x.workers), pct(c.removed[q.k]), chg(c.pay_mean[q.k]), chg(c.pay_p10[q.k]), chg(c.pay_p50[q.k]), chg(c.pay_p90[q.k]), pct(c.worse[q.k]), pct(c.moved[q.k])]),
            fam.findIndex((q) => q.k === p))))));
  }

  // ------------------------------------------------------------------ update loop
  let seq = 0;
  async function update() {
    const my = ++seq;
    fixState(); writeURL(); renderControls(); RO.disconnect();
    const s = scen(st.index, st.level, st.robots), content = $("#content");
    try {
      const d = await loadScen(s);
      if (my !== seq) return;
      const slot = {};
      const view = st.scope === "occ" ? viewOcc(d, slot) : st.scope === "cohort" ? viewCohort(d, slot) : viewEconomy(d);
      content.replaceChildren(...[note ? h("p", { class: "note", text: note }) : null, view].filter(Boolean));
      if (slot.cross) {
        const runs = levelRuns(), files = await Promise.all(runs.map((r) => loadScen(r.s)));
        if (my !== seq) return;
        slot.cross(runs, files);
      }
      document.documentElement.dataset.ready = s.id + "|" + st.scope;
    } catch (err) {
      if (my !== seq) return;
      fail(err);
    }
  }
  function fail(err) {
    document.documentElement.dataset.err = String(err && err.message ? err.message : err);
    $("#content").replaceChildren(h("p", { class: "note", text: "The scenario data could not be loaded. Reload the page, or try another setting." }));
  }
  window.addEventListener("error", (ev) => { if (!/ResizeObserver/.test(String(ev.message))) document.documentElement.dataset.err = String(ev.message); });
  window.addEventListener("unhandledrejection", (ev) => { document.documentElement.dataset.err = String(ev.reason); });
  window.addEventListener("scroll", hideTip, { passive: true });

  Promise.all([fetch(DATA + "meta.json").then((r) => { if (!r.ok) throw new Error("meta.json " + r.status); return r.json(); }),
    fetch(DATA + "economy.json").then((r) => { if (!r.ok) throw new Error("economy.json " + r.status); return r.json(); })])
    .then(([m, e]) => { prepare(m, e); readURL(); wirePickers(); update(); })
    .catch(fail);
})();
