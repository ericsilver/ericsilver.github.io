/* Synthetic workforce explorer -- browser re-implementation of the
   resume-floor model (v0.3) for a single person. The whole life is simulated
   up front; a breadcrumb bar (school > role > role > ...) picks the career
   stage every tab looks at. Data (economy, education rungs, learning
   profiles, hazards, outflow, license families) comes from data.js. */
(function () {
"use strict";
const D = window.LG_DATA;
const DL = D.dials, LMAX = DL.LMAX;
const C = D.components, NC = C.length;
const JOBS = D.jobs, NJ = JOBS.length;
const R = D.rungs;
const PALETTE = ["#0b57d0", "#c2410c", "#15803d", "#7c3aed", "#be185d", "#0e7490",
                 "#a16207", "#4d7c0f", "#b91c1c", "#6d28d9", "#0f766e", "#92400e"];
const SCHOOL_COLS = ["#c9d6db", "#9fbcc6", "#6f98a6", "#4a7888", "#2f5a69"];
const schoolCol = pos => SCHOOL_COLS[Math.min(pos, SCHOOL_COLS.length - 1)];
const spellCol = s => PALETTE[s % PALETTE.length];
const fmt$ = x => "$" + Math.round(x).toLocaleString();
const fmtK = x => "$" + (x / 1000).toFixed(0) + "k";
const pct = x => (100 * x).toFixed(x < 0.1 ? 1 : 0) + "%";
const rungName = r => R[r].levelLabel + (R[r].field ? ", " + R[r].field : "");

// profiles: bytes / 255; qEdu(r, c, l) = P(level >= l after rung r);
// hJob(j, c, l) = P(reach level l in job j | below l)
function unb64(s) { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
const QE = unb64(D.qEdu), HJ = unb64(D.hJob);
const qEdu = (r, c, l) => QE[(r * NC + c) * LMAX + l - 1] / 255;
const hJob = (j, c, l) => HJ[(j * NC + c) * LMAX + l - 1] / 255;

// ---------------------------------------------------------------- RNG
let seed = 20261029, rng;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function reseed(s) { seed = s; rng = mulberry32(s); }
reseed(seed);
const U = () => rng();
function choice(weights) { let tot = 0; for (const w of weights) tot += w; if (tot <= 0) return -1; let r = U() * tot;
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; } return weights.length - 1; }

// ---------------------------------------------------------------- person
// LIFE.stages[0] = the person at labor-market entry (after the last rung);
// stages[1..] = one per job spell. attribution[k] = [{src, from, to}] with
// src = -1 - (position of the school rung on the path), otherwise a spell number.
let LIFE = null, sel = 0;

function chainOf(r) { const ch = []; for (let x = r; x >= 0; x = R[x].parent) ch.unshift(x); return ch; }
function drawPerson(opts) {
  const r = opts && opts.rung != null ? opts.rung : choice(R.map(x => x.share));
  // one uniform per component, shared by every rung on the path: each rung's
  // marginal P(level >= l) is reproduced exactly and levels only rise
  const u = C.map(() => 1 - U());
  return { rung: r, chain: chainOf(r), u, label: (opts && opts.label) || ("Person #" + seed) };
}

function qualified(c, j) { const r = JOBS[j].req; for (let k = 0; k < NC; k++) if (r[k] > c[k]) return false; return true; }
function deficit(c, j) { const r = JOBS[j].req; let d = 0; for (let k = 0; k < NC; k++) if (r[k] > c[k]) d += r[k] - c[k]; return d; }
// license families: entered from school (first job after the last rung) or
// from a job already held in the same family
function licensedOk(j, ctx) { const f = JOBS[j].lic; if (!f) return true; return ctx.fromSchool || ctx.families.has(f); }
// where a search goes: first job -> the rung's observed first jobs (ACS);
// after leaving job k -> k's observed outflow (resume data); re-entry after a
// spell out -> the last job or its outflow. Always among qualified, license-
// permitted jobs; when none of the observed destinations is open to this
// person, openings in proportion to employment.
function searchWeights(c, ctx) {
  const w = new Array(NJ).fill(0);
  const ok = j => j !== ctx.forbid && qualified(c, j) && licensedOk(j, ctx);
  const src = ctx.fromSchool ? R[ctx.rung].entry : ctx.from >= 0 ? D.outflow[ctx.from] : null;
  let tot = 0;
  if (src) for (const [j, p] of src) if (ok(j)) { w[j] += p; tot += p; }
  if (ctx.returnTo >= 0 && ok(ctx.returnTo)) { const b = tot > 0 ? tot : 1; w[ctx.returnTo] += b; tot += b; }
  let fallback = false;
  if (tot <= 0) { fallback = true; for (let j = 0; j < NJ; j++) if (ok(j)) { w[j] = JOBS[j].emp; tot += w[j]; } }
  return { w, tot, fallback };
}
function evalJobs(c, ctx) {
  const { w, tot, fallback } = searchWeights(c, ctx);
  const out = new Array(NJ);
  for (let j = 0; j < NJ; j++) out[j] = { j, q: qualified(c, j), lok: licensedOk(j, ctx), d: deficit(c, j), w: w[j], pref: tot > 0 ? w[j] / tot : 0 };
  out.total = tot; out.fallback = fallback; return out; }
function summarize(ev) { let ew = 0, best = 0, nq = 0, nreach = 0, bestj = -1;
  for (const o of ev) { ew += o.pref * JOBS[o.j].wage;
    if (o.q && o.lok) { nq++; if (JOBS[o.j].wage > best) { best = JOBS[o.j].wage; bestj = o.j; } }
    else if (!o.q && o.d <= 4) nreach++; }
  return { ew, best, bestj, nq, nreach }; }
const ctxCopy = (x, fam) => ({ fromSchool: x.fromSchool, rung: x.rung, from: x.from, returnTo: x.returnTo, forbid: x.forbid, families: new Set(fam) });

function runLife(base, extra) {
  const attribution = C.map(() => []);
  const addSeg = (k, src, from, to) => { const a = attribution[k];
    if (a.length && a[a.length - 1].src === src) a[a.length - 1].to = to;
    else a.push({ src, from, to }); };
  const c = new Array(NC).fill(0);
  base.chain.forEach((r, pos) => { for (let k = 0; k < NC; k++) {
    let lv = 0; for (let l = 1; l <= LMAX; l++) if (qEdu(r, k, l) >= base.u[k]) lv = l;
    if (lv > c[k]) { addSeg(k, -1 - pos, c[k], lv); c[k] = lv; } } });
  if (extra) for (let k = 0; k < NC; k++) if (extra[k] > c[k]) { addSeg(k, -1 - (base.chain.length - 1), c[k], extra[k]); c[k] = extra[k]; }
  const entryAge = R[base.rung].entryAge;
  const families = new Set();
  const schoolCtx = { fromSchool: true, rung: base.rung, from: -1, returnTo: -1, forbid: -1, families };
  const stages = [{ kind: "entry", label: "School: " + rungName(base.rung), ageStart: entryAge, ageEnd: entryAge, job: -1 }];
  let job = -1, last = -1, spell = -1, tgt = null, fromSchool = true, outYear = false;
  const wagePath = [];
  for (let age = entryAge; age < DL.RETIRE_AGE; age++) {
    let ctx = null;
    if (job >= 0) { const u = U(), pe = D.hazE[job], pt = D.hazT[job] * (age < 25 ? DL.CHURN_Y : age < 35 ? DL.CHURN_M : 1);
      if (u < pe) { stages[spell + 1].ageEnd = age; stages[spell + 1].why = "left the workforce for a spell"; last = job; job = -1; outYear = true; }
      else if (u < pe + pt) { stages[spell + 1].ageEnd = age; stages[spell + 1].why = "changed occupation"; last = job; job = -1;
        ctx = { fromSchool: false, rung: base.rung, from: last, returnTo: -1, forbid: last, families }; }
    } else if (outYear) { outYear = false; }
    else ctx = fromSchool ? schoolCtx : { fromSchool: false, rung: base.rung, from: last, returnTo: last, forbid: -1, families };
    if (ctx) {
      const { w, tot, fallback } = searchWeights(c, ctx);
      if (tot > 0) {
        const j = choice(w);
        const snap = ctxCopy(ctx, families);
        job = j; spell = stages.length - 1; fromSchool = false;
        if (JOBS[j].lic) families.add(JOBS[j].lic);
        // learning target for this spell: one uniform per component against
        // the job's conditional acquisition probabilities
        tgt = c.map((lv, k) => { const v = 1 - U(); let t = lv;
          for (let l = lv + 1; l <= LMAX; l++) { if (hJob(j, k, l) >= v) t = l; else break; } return t; });
        stages.push({ kind: "job", label: JOBS[j].title, job: j, ageStart: age, ageEnd: DL.RETIRE_AGE, fallback, ctx: snap });
      }
    }
    if (job >= 0) {   // learning: one level a year toward the spell's targets
      const sp = stages.length - 2;
      for (let k = 0; k < NC; k++) if (tgt[k] > c[k]) { c[k] += 1; addSeg(k, sp, c[k] - 1, c[k]); }
    }
    wagePath.push({ age, wage: job >= 0 ? JOBS[job].wage : 0, spell: job >= 0 ? stages.length - 2 : -1 });
  }
  if (job >= 0) stages[stages.length - 1].ageEnd = DL.RETIRE_AGE;
  const levelAt = (k, sMax) => { let v = 0; for (const seg of attribution[k]) if (seg.src <= sMax) v = seg.to; return v; };
  for (let s = 0; s < stages.length; s++) stages[s].cEnd = C.map((x, k) => levelAt(k, s - 1));
  // the search a person faces at each stage: out of school, or leaving that job
  stages[0].ctxNext = ctxCopy(schoolCtx, []);
  for (let s = 1; s < stages.length; s++) { const fam = [];
    for (let t = 1; t <= s; t++) if (JOBS[stages[t].job].lic) fam.push(JOBS[stages[t].job].lic);
    stages[s].ctxNext = { fromSchool: false, rung: base.rung, from: stages[s].job, returnTo: -1, forbid: stages[s].job, families: new Set(fam) }; }
  return { base, stages, attribution, wagePath, seed };
}

function newLife(opts) { const p = drawPerson(opts); LIFE = runLife(p); sel = Math.min(1, LIFE.stages.length - 1); }

// ---------------------------------------------------------------- UI helpers
const $ = (s, el) => (el || document).querySelector(s);
const h = (tag, attrs, ...kids) => { const e = document.createElement(tag); if (attrs) for (const k in attrs) { if (attrs[k] == null) continue;
  if (k === "class") e.className = attrs[k]; else if (k.startsWith("on")) e.addEventListener(k.slice(2), attrs[k]); else if (k === "html") e.innerHTML = attrs[k]; else e.setAttribute(k, attrs[k]); }
  for (const kid of kids.flat()) if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(String(kid))); return e; };
let tab = "person";
let oppSort = { key: "pref", dir: -1 }, oppFilter = "qual";

function stageC() { return LIFE.stages[sel].cEnd; }
function stageCtx() { return LIFE.stages[sel].ctxNext; }
const stageWhere = () => { const st = LIFE.stages[sel]; return st.kind === "entry" ? "out of school" : "leaving " + st.label; };
const srcLabel = src => src < 0 ? "school: " + rungName(LIFE.base.chain[-1 - src]) : LIFE.stages[src + 1].label;
const srcCol = src => src < 0 ? schoolCol(-1 - src) : spellCol(src);

function render() { renderSide(); renderCrumbs(); const el = $("#content"); el.innerHTML = "";
  ({ person: vPerson, skills: vSkills, opps: vOpps, value: vValue, survey: vSurvey, about: vAbout })[tab](el);
  document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab)); }
document.querySelectorAll("#nav button").forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });

// ---------------------------------------------------------------- breadcrumbs
function renderCrumbs() { const bar = $("#crumbs"); bar.innerHTML = "";
  if (!LIFE) return;
  const mk = (i, label, col, sub) => h("button", { class: "crumb" + (i === sel ? " on" : ""),
      style: col ? `--cc:${col}` : null, onclick: () => { sel = i; render(); } },
    h("b", null, label), sub ? h("span", null, sub) : null);
  bar.append(mk(0, LIFE.base.label, null, rungName(LIFE.base.rung) + " · entry at " + LIFE.stages[0].ageStart));
  LIFE.stages.slice(1).forEach((st, i) => {
    bar.append(h("span", { class: "sep" }, "›"),
      mk(i + 1, st.label, spellCol(i), "ages " + st.ageStart + "–" + st.ageEnd + " · " + fmtK(JOBS[st.job].wage)));
  });
}

// ---------------------------------------------------------------- side panel
function renderSide() { const s = $("#side"); s.innerHTML = "";
  s.append(h("div", { class: "card" }, h("h3", null, "New person"),
    h("div", { class: "row" }, h("label", null, "seed "), h("input", { type: "number", id: "seedIn", value: seed, style: "width:110px" }),
      h("button", { class: "btn primary", onclick: () => { reseed(+$("#seedIn").value || 1); newLife(); tab = "person"; render(); } }, "Generate"),
      h("button", { class: "btn", onclick: () => { reseed(Math.floor(Math.random() * 1e6)); newLife(); tab = "person"; render(); } }, "Random")),
    h("div", { class: "meta" }, "Draws a person the way the model does: schooling first, then a working life in which every job held is one they fully qualified for. Click any role in the trail to see the world from there.")));
  if (!LIFE) return;
  const st = LIFE.stages[sel];
  const ev = evalJobs(stageC(), stageCtx()), sm = summarize(ev);
  s.append(h("div", { class: "card" }, h("h3", null, LIFE.base.label),
    h("div", { class: "kv" },
      h("b", null, "schooling"), h("span", null, LIFE.base.chain.map(r => R[r].levelLabel).join(" → ") + (R[LIFE.base.rung].field ? " (" + R[LIFE.base.rung].field + ")" : "")),
      h("b", null, "viewing"), h("span", null, st.kind === "entry" ? "labor-market entry, age " + st.ageStart : st.label + ", ages " + st.ageStart + "–" + st.ageEnd),
      h("b", null, "qualified for"), h("span", null, sm.nq + " of " + NJ + " jobs"),
      h("b", null, "close (≤4 levels short)"), h("span", null, sm.nreach + " jobs"),
      h("b", null, "expected next wage"), h("span", null, fmt$(sm.ew)),
      h("b", null, "best qualified"), h("span", null, sm.bestj >= 0 ? fmt$(sm.best) + " " + JOBS[sm.bestj].title : "—")),
    h("div", { class: "meta", style: "margin-top:6px" },
      "All numbers are as of the highlighted breadcrumb: the skills this person held by the end of that stage, and the search they would face " + stageWhere() + ".")));
}

// ---------------------------------------------------------------- Life tab
function trajectoryChart() {
  const W = 860, H = 240, Lp = 52, B = 40, T = 12;
  const wp = LIFE.wagePath; if (!wp.length) return h("div", { class: "meta" }, "No working years.");
  const a0 = wp[0].age, a1 = DL.RETIRE_AGE;
  const mx = Math.max(1e4, ...wp.map(x => x.wage));
  const X = a => Lp + (W - Lp - 12) * (a - a0) / Math.max(1, a1 - a0);
  const Y = w => H - B - (H - B - T) * w / mx;
  let inner = `<line x1="${Lp}" y1="${H - B}" x2="${W - 12}" y2="${H - B}" stroke="#c3c2b7"/>` +
    `<line x1="${Lp}" y1="${T}" x2="${Lp}" y2="${H - B}" stroke="#c3c2b7"/>` +
    [0, .5, 1].map(f => `<text x="${Lp - 6}" y="${Y(f * mx) + 4}" text-anchor="end">${fmtK(f * mx)}</text>`).join("") +
    [a0, Math.round((a0 + a1) / 2), a1].map(a => `<text x="${X(a)}" y="${H - B + 14}" text-anchor="middle">${a}</text>`).join("");
  for (const x of wp) {
    const col = x.spell >= 0 ? spellCol(x.spell) : "#e6e5df";
    inner += `<rect x="${X(x.age)}" y="${H - B + 18}" width="${X(x.age + 1) - X(x.age) + 0.5}" height="9" fill="${col}"><title>age ${x.age}: ${x.spell >= 0 ? LIFE.stages[x.spell + 1].label : "not working"}</title></rect>`;
  }
  for (const x of wp) { if (x.wage <= 0) continue;
    inner += `<line x1="${X(x.age)}" y1="${Y(x.wage)}" x2="${X(x.age + 1)}" y2="${Y(x.wage)}" stroke="${spellCol(x.spell)}" stroke-width="3"><title>age ${x.age}: ${LIFE.stages[x.spell + 1].label} ${fmt$(x.wage)}</title></line>`;
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.style.width = "100%"; svg.style.maxWidth = W + "px";
  svg.innerHTML = inner;
  return svg;
}
function vPerson(el) { if (!LIFE) return;
  const n = LIFE.stages.length - 1;
  el.append(h("div", { class: "card" }, h("h2", null, "The whole working life"),
    h("p", null, `${LIFE.base.chain.map(r => R[r].levelLabel).join(" → ")}${R[LIFE.base.rung].field ? " (" + R[LIFE.base.rung].field + ")" : ""}; entered work at ${LIFE.stages[0].ageStart}. ` +
      `${n} role${n === 1 ? "" : "s"} to retirement at ${DL.RETIRE_AGE}. Salary line and the band underneath are colored by role; grey band years are out of work.`),
    trajectoryChart()));
  el.append(h("div", { class: "card" }, h("h2", null, "Roles"),
    h("table", null, h("thead", null, h("tr", null, h("th", null, ""), h("th", null, "Role"), h("th", { class: "num" }, "Ages"), h("th", { class: "num" }, "Salary"), h("th", null, "How it began"), h("th", null, "How it ended"))),
      h("tbody", null, ...LIFE.stages.slice(1).map((st, i) => h("tr", { style: sel === i + 1 ? "background:#f4f6fb" : null },
        h("td", null, h("span", { class: "dot", style: `background:${spellCol(i)}` })),
        h("td", null, h("a", { href: "#", onclick: e => { e.preventDefault(); sel = i + 1; render(); } }, st.label), h("span", { class: "meta" }, " " + JOBS[st.job].soc + (JOBS[st.job].lic ? " · licensed" : ""))),
        h("td", { class: "num" }, st.ageStart + "–" + st.ageEnd),
        h("td", { class: "num" }, fmt$(JOBS[st.job].wage)),
        h("td", { class: "meta" }, st.ctx.fromSchool ? "first job out of school" : st.ctx.returnTo >= 0 ? "returned to work" : "moved from " + JOBS[st.ctx.from].title,
          st.fallback ? " (no observed destination open; took an opening)" : ""),
        h("td", { class: "meta" }, st.why || "worked to retirement")))))));
}

// ---------------------------------------------------------------- Skills tab
function skillRow(x) {
  const W = 240, HT = 14;
  const segs = LIFE.attribution[x.i].filter(s => s.src <= sel - 1);
  const ticks = [];
  for (let s = 1; s <= Math.min(sel, LIFE.stages.length - 1); s++)
    ticks.push({ col: spellCol(s - 1), req: JOBS[LIFE.stages[s].job].req[x.i], label: LIFE.stages[s].label });
  const lv = segs.length ? segs[segs.length - 1].to : 0;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${HT + 6}`); svg.style.width = W + "px"; svg.style.height = (HT + 6) + "px";
  const X = v => 1 + (W - 2) * v / 7;
  let inner = `<rect x="1" y="3" width="${W - 2}" height="${HT}" fill="#f1f0ec" rx="2"/>`;
  for (const s of segs)
    inner += `<rect x="${X(s.from)}" y="3" width="${Math.max(0.5, X(s.to) - X(s.from))}" height="${HT}" fill="${srcCol(s.src)}"><title>${srcLabel(s.src)}: level ${s.from} → ${s.to}</title></rect>`;
  for (const t of ticks) { if (t.req <= 0) continue;
    inner += `<line x1="${X(t.req)}" y1="0" x2="${X(t.req)}" y2="${HT + 6}" stroke="${t.col}" stroke-width="2"><title>${t.label} required level ${t.req}</title></line>`; }
  svg.innerHTML = inner;
  return h("div", { class: "sk2", title: x.desc + (x.anchors[2] ? "\n2: " + x.anchors[2] : "") + (x.anchors[4] ? "\n4: " + x.anchors[4] : "") + (x.anchors[6] ? "\n6: " + x.anchors[6] : "") },
    h("span", { class: "nm" }, x.name), svg, h("span", { class: "num" }, lv));
}
function vSkills(el) { if (!LIFE) return;
  const st = LIFE.stages[sel];
  el.append(h("div", { class: "card" },
    h("h2", null, "Skills through " + (st.kind === "entry" ? "labor-market entry" : st.label)),
    h("p", { class: "meta" }, "Each bar runs 0–7. Colored segments show where each increment came from: school rungs in shades of slate (darker = later rung), then each role in its breadcrumb color. Vertical lines are hurdles: each role's required level, in the role's color. Every role's line sits at or inside the bar, because nobody is hired short of any requirement."),
    h("div", { class: "legend" },
      ...LIFE.base.chain.map((r, pos) => h("span", null, h("span", { class: "dot", style: `background:${schoolCol(pos)}` }), " " + rungName(r))),
      ...LIFE.stages.slice(1, sel + 1).map((s2, i) => h("span", null, h("span", { class: "dot", style: `background:${spellCol(i)}` }), " " + s2.label))),
    (() => { const grid = h("div", { class: "skills2" });
      const groups = [["Abilities", x => x.abil], ["Knowledge", x => x.edu], ["Skills and work activities", x => x.exp]];
      for (const [g, f] of groups) { grid.append(h("div", { class: "g" }, g));
        for (const x of C.filter(f)) grid.append(skillRow(x)); }
      return grid; })()));
}

// ---------------------------------------------------------------- Opportunities
function vOpps(el) { if (!LIFE) return;
  const ev = evalJobs(stageC(), stageCtx());
  let rows = ev.filter(o => oppFilter === "all" ? true : oppFilter === "qual" ? (o.q && o.lok) : oppFilter === "lic" ? (o.q && !o.lok) : oppFilter === "reach" ? (!o.q && o.d <= 4) : (!o.q && o.d > 4 && o.d <= 8));
  const key = oppSort.key; rows.sort((a, b) => { const va = key === "wage" ? JOBS[a.j].wage : key === "title" ? JOBS[a.j].title : key === "emp" ? JOBS[a.j].emp : a[key];
    const vb = key === "wage" ? JOBS[b.j].wage : key === "title" ? JOBS[b.j].title : key === "emp" ? JOBS[b.j].emp : b[key]; return (va > vb ? 1 : va < vb ? -1 : 0) * oppSort.dir; });
  const th = (label, k, cls) => h("th", { class: cls || "", onclick: () => { if (oppSort.key === k) oppSort.dir *= -1; else oppSort = { key: k, dir: k === "title" ? 1 : -1 }; render(); } }, label + (oppSort.key === k ? (oppSort.dir > 0 ? " ▲" : " ▼") : ""));
  const sel2 = h("select", { onchange: e => { oppFilter = e.target.value; render(); } },
    ...[["qual", "fully qualified"], ["lic", "qualified but license-gated"], ["reach", "close: 1–4 levels short"], ["reach8", "5–8 levels short"], ["all", "every job"]].map(([v, l]) => h("option", { value: v, selected: v === oppFilter ? "" : null }, l)));
  const st = LIFE.stages[sel];
  el.append(h("div", { class: "card" }, h("h2", null, "What was open " + stageWhere()),
    h("p", { class: "meta" }, "Hiring requires meeting every one of a job's 69 requirements, abilities included, with no tolerance. “Short” counts total missing levels. Licensed occupations can be entered straight from school or from a job in the same license family. “Chance” is where the search lands: " +
      (st.kind === "entry" ? "the first jobs people with this schooling actually take (ACS)" : "the occupations people leaving this one actually move to (résumé data)") +
      ", among the jobs this person qualifies for" + (ev.fallback ? ". None of those observed destinations is open to this person, so the search takes openings in proportion to employment." : ".")),
    h("div", { class: "row" }, "Show ", sel2, h("span", { class: "meta" }, rows.length + " jobs")),
    h("div", { class: "scroll" }, h("table", null, h("thead", null, h("tr", null, th("Job", "title"), th("Salary", "wage", "num"), th("Levels short", "d", "num"), th("Chance", "pref", "num"), th("Employment", "emp", "num"))),
      h("tbody", null, ...rows.slice(0, 400).map(o => { const J = JOBS[o.j]; return h("tr", null,
        h("td", null, J.title, h("span", { class: "meta" }, " " + J.soc + (J.lic ? " · licensed: " + J.lic : ""))), h("td", { class: "num" }, fmt$(J.wage)),
        h("td", { class: "num " + (o.d === 0 ? "ok" : o.d <= 4 ? "mid" : "no") }, o.d),
        h("td", { class: "num" }, o.pref > 0 ? pct(o.pref) : "—"), h("td", { class: "num" }, Math.round(J.emp).toLocaleString())); })))),
    rows.length > 400 ? h("div", { class: "meta" }, "Showing the first 400; sort or filter to see others.") : null));
}

// ---------------------------------------------------------------- Skill value
function vValue(el) { if (!LIFE) return;
  const c0 = stageC(), ctx = stageCtx();
  const baseEv = evalJobs(c0, ctx), base = summarize(baseEv);
  const out = [];
  for (const x of C) { if (c0[x.i] >= 7) continue;
    const c2 = c0.slice(); c2[x.i] += 1;
    const ev2 = evalJobs(c2, ctx), s = summarize(ev2);
    const unlocked = [];
    for (let j = 0; j < NJ; j++) if (!(baseEv[j].q && baseEv[j].lok) && ev2[j].q && ev2[j].lok) unlocked.push(j);
    unlocked.sort((a, b) => JOBS[b].wage - JOBS[a].wage);
    out.push({ k: x.i, dEw: s.ew - base.ew, dBest: s.best - base.best, dNq: s.nq - base.nq, lvl: c0[x.i], unlocked }); }
  out.sort((a, b) => (b.dNq - a.dNq) || (b.dEw - a.dEw));
  const mx = Math.max(1, ...out.map(o => o.dNq));
  el.append(h("div", { class: "card" }, h("h2", null, "What one more level of each skill would have opened " + stageWhere()),
    h("p", { class: "meta" }, "Each row raises one component by one level, holding everything else at this stage's values, and re-scores every job under hard qualification. Δqualified counts jobs unlocked; Δbest is the change in the highest qualified salary; Δexpected re-weights the search over the newly open set. Baseline: " + base.nq + " jobs qualified, best " + (base.bestj >= 0 ? fmt$(base.best) : "none") + "."),
    h("div", { class: "scroll" }, h("table", null, h("thead", null, h("tr", null, h("th", null, "Component"), h("th", { class: "num" }, "Now"), h("th", null, "Δqualified"), h("th", { class: "num" }, ""), h("th", { class: "num" }, "Δbest"), h("th", { class: "num" }, "Δexpected"), h("th", null, "Would newly qualify for"))),
      h("tbody", null, ...out.map(o => { const x = C[o.k]; const cls = x.abil ? "abil" : x.edu ? "edu" : "exp";
        return h("tr", null,
          h("td", null, x.name, h("span", { class: "tag " + cls }, x.abil ? "ability" : x.edu ? "knowledge" : "skill")),
          h("td", { class: "num" }, o.lvl + " → " + (o.lvl + 1)),
          h("td", null, h("span", { class: "bar " + (o.dNq > 0 ? cls : "ghost"), style: `width:${Math.max(2, 100 * o.dNq / mx)}px` })),
          h("td", { class: "num" }, o.dNq || "—"),
          h("td", { class: "num" }, o.dBest ? (o.dBest > 0 ? "+" : "−") + fmt$(Math.abs(o.dBest)) : "—"),
          h("td", { class: "num " + (o.dEw >= 1 ? "ok" : o.dEw <= -1 ? "no" : "mid") }, Math.abs(o.dEw) < 1 ? "0" : (o.dEw > 0 ? "+" : "−") + fmt$(Math.abs(o.dEw))),
          h("td", null, o.unlocked.length
            ? [JOBS[o.unlocked[0]].title + " (" + fmtK(JOBS[o.unlocked[0]].wage) + ")",
               o.unlocked.length > 1 ? h("span", { class: "meta" }, " +" + (o.unlocked.length - 1) + " more") : null]
            : h("span", { class: "meta" }, "—"))); }))))));
}

// ---------------------------------------------------------------- Survey
let S = null;
const LEVELS = ["subhs", "hs", "assoc", "ba", "ma", "prof", "phd"];
function vSurvey(el) {
  if (!S) S = { c: C.map(() => 2), level: "hs", rung: R.findIndex(r => r.level === "hs") };
  const rungsAt = R.map((r, i) => i).filter(i => R[i].level === S.level).sort((a, b) => R[a].field.localeCompare(R[b].field));
  const wrap = h("div", { class: "card survey" }, h("h2", null, "Build a virtual person from a self-assessment"),
    h("p", { class: "meta" }, "Pick your schooling and rate yourself on each O*NET component, 0–7 (O*NET's own examples sit under each slider). The person gets the model's schooling draws for that path and keeps any self-rated level above them, then lives a full working life and becomes the active person on every tab."),
    h("div", { class: "row" }, h("label", null, "Highest schooling "),
      h("select", { onchange: e => { S.level = e.target.value; S.rung = R.findIndex(r => r.level === S.level); render(); } },
        ...LEVELS.map(l => h("option", { value: l, selected: l === S.level ? "" : null }, R.find(r => r.level === l).levelLabel))),
      rungsAt.length > 1 ? [h("label", null, " field "), h("select", { onchange: e => S.rung = +e.target.value },
        ...rungsAt.map(i => h("option", { value: i, selected: i === S.rung ? "" : null }, R[i].field)))] : null,
      h("button", { class: "btn primary", onclick: () => { reseed(seed); const p = drawPerson({ rung: S.rung, label: "Virtual person (survey)" });
        LIFE = runLife(p, S.c); sel = Math.min(1, LIFE.stages.length - 1); tab = "person"; render(); } }, "Build and live this person")));
  const groups = [["Abilities", x => x.abil], ["Knowledge", x => x.edu], ["Skills and work activities", x => x.exp]];
  for (const [g, f] of groups) { wrap.append(h("h3", { style: "margin-top:14px" }, g));
    for (const x of C.filter(f)) { const a = x.anchors; const keys = Object.keys(a).map(Number).sort((p, q) => p - q);
      const out = h("span", { class: "num" }, S.c[x.i]);
      wrap.append(h("div", { class: "item" }, h("div", null, h("div", { class: "nm" }, x.name), h("div", { class: "d" }, x.desc)),
        h("div", null, h("input", { type: "range", min: 0, max: 7, step: 1, value: S.c[x.i], oninput: e => { S.c[x.i] = +e.target.value; out.textContent = e.target.value; } }),
          h("div", { class: "anch" }, ...keys.slice(0, 3).map(k => h("span", null, k + ": " + a[k])))), out)); } }
  el.append(wrap);
}

// ---------------------------------------------------------------- About
function vAbout(el) { el.append(h("div", { class: "card" }, h("h2", null, "How the model works (as reproduced here)"),
  h("p", null, "One person at a time through the synthetic-workforce model: the same 723-occupation × 69-component economy (O*NET requirement levels, OEWS wages and employment), education paths, learning profiles, separation rates, and license families the population is built from. A single person sees every job as open; competition for scarce openings exists only at population scale."),
  h("ul", { style: "margin-left:18px" },
    h("li", null, h("b", null, "Hiring. "), "A job can be taken only if every one of its 69 requirements is met, abilities included, with no tolerance."),
    h("li", null, h("b", null, "Schooling. "), "Everyone passes through less-than-high-school schooling, most through high school, and some through an associate degree, one of " + R.filter(r => r.level === "ba").length + " bachelor's fields, and one of " + R.filter(r => ["ma", "prof", "phd"].includes(r.level)).length + " graduate rungs (degree type × bachelor's field). Each rung gives each skill level with the smallest probability that still lets that rung's graduates qualify, in the shares observed, for the first jobs they actually take (ACS 2015–19). Cost rises with the square of the level, so low levels come out near universal and high levels selective. No rung has an admission requirement."),
    h("li", null, h("b", null, "Learning in a job. "), "Each occupation teaches each skill level with the smallest probability that lets the people who leave it qualify, in the observed shares, for the occupations they move to (résumé data), given what they arrived with from school. Skills are drawn independently, and a spell's gains arrive one level a year. Skills never fall back."),
    h("li", null, h("b", null, "Moving. "), "Each year in a job carries that occupation's published chances (BLS Employment Projections) of changing occupation or leaving the workforce for a year; occupation changes run " + DL.CHURN_Y + "× as often under 25 and " + DL.CHURN_M + "× at 25–34, matching NLSY career histories. A first job is drawn from the first jobs people with that schooling take; a move is drawn from where people leaving that occupation go; re-entry returns to the last job or its destinations. Always among jobs the person fully qualifies for."),
    h("li", null, h("b", null, "Licensing. "), D.licence.length + " license families (" + D.licence.join(", ") + ") can be entered straight from school or from a job in the same family, never from outside it.")),
  h("p", { class: "meta", style: "margin-top:8px" }, "Known limits: requirements are O*NET incumbent ratings of jobs, not of people; associate degrees carry no field (ACS records field only for bachelor's and above); graduate rungs use the bachelor's field; the learning profiles assume each occupation's entrants arrive with that occupation's average schooling; no caregiving, disability, or geography."))); }

// ---------------------------------------------------------------- boot
newLife();
const hashTab = location.hash.replace("#", "");
if (["person", "skills", "opps", "value", "survey", "about"].includes(hashTab)) tab = hashTab;
render();
})();
