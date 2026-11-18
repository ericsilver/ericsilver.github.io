"use strict";
/* Synthetic workforce explorer v0.4. Shows the recorded population of the recursive build (the workforce the
   future-of-work simulation runs on). Data: window.WX, written by build_explorer_population.py. Nothing is simulated here. */
const D = window.WX, M = D.meta, OCC = D.occ, RUNGS = D.rungs, JOBS = D.jobs, COMPS = D.comps;
const NC = COMPS.length, NR = RUNGS.length, LV = M.levels, ST = M.stages, MAJ = M.majors;
const SCEN = "/future-of-work/scenarios/";
const PALETTE = ["#0b57d0", "#c2410c", "#15803d", "#7c3aed", "#be185d", "#0e7490", "#a16207", "#475569", "#b91c1c", "#4d7c0f"];
const KINDS = [["knowledge", "Knowledge"], ["skill", "Skills"], ["ability", "Abilities"], ["activity", "Work activities"]];
const STAGE_ID = ["", "early", "mid", "late"];
const STAGE_LBL = ["All career stages"].concat(ST.map(s => s.label));
const STAGE_SHORT = ["All", "Early", "Mid", "Late"];

const $ = (s, el) => (el || document).querySelector(s);
const h = (tag, attrs, ...kids) => {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (attrs[k] == null || attrs[k] === false) continue;
    if (k === "class") e.className = attrs[k]; else if (k.startsWith("on")) e.addEventListener(k.slice(2), attrs[k]);
    else if (k === "html") e.innerHTML = attrs[k]; else e.setAttribute(k, attrs[k]);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
};
const fmt$ = x => "$" + Math.round(x).toLocaleString("en-US");
const fmtW = w => w >= 1e6 ? (w / 1e6).toFixed(w >= 1e7 ? 1 : 2) + " million" : w >= 1000 ? (Math.round(w / 1000) * 1000).toLocaleString("en-US") : "under 1,000";
const pct = (x, d) => x == null ? "–" : (100 * x).toFixed(d != null ? d : (x < 0.0995 ? 1 : 0)) + "%";
const num = x => x == null ? "–" : Math.round(x).toLocaleString("en-US");
const unb64 = s => { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
const HOLD = unb64(D.hold), CORE = unb64(D.core), FLOORS = unb64(D.floors);
const levelIdx = id => LV.findIndex(l => l.id === id);
const rungsOf = lvl => RUNGS.map((r, i) => i).filter(i => RUNGS[i].level === LV[lvl].id).sort((a, b) => RUNGS[b].w - RUNGS[a].w);
const majName = code => (MAJ.find(m => m.code === code) || {}).name || code;

/* ---------------- state and routing ---------------- */
const S = { tab: "exp", mode: "school", lvl: -1, rung: -1, hist: 0, stage: 0, openSort: "share", occ: 0, q: "", maj: "", life: 0, lifeLvl: -1, snap: 0 };
S.occ = OCC.reduce((b, o, i) => o.emp > OCC[b].emp ? i : b, 0);

function applyCohort(id) {
  const [fam, rest] = [id.slice(0, id.indexOf(":")), id.slice(id.indexOf(":") + 1)];
  S.tab = "exp"; S.mode = "school"; S.lvl = -1; S.rung = -1; S.stage = 0;
  if (fam === "stage") S.stage = Math.max(0, STAGE_ID.indexOf(rest));
  else if (fam === "school") S.lvl = levelIdx(rest);
  else if (fam === "school_stage") { const [a, b] = rest.split("|"); S.lvl = levelIdx(a); S.stage = Math.max(0, STAGE_ID.indexOf(b)); }
  else if (fam === "field") { const r = RUNGS.findIndex(x => x.id === rest); if (r >= 0) { S.rung = r; S.lvl = levelIdx(RUNGS[r].level); } }
  else if (fam === "history") { S.mode = "hist"; S.hist = Math.max(0, MAJ.findIndex(m => m.code === rest)); }
  else if (fam === "group") { S.tab = "job"; S.maj = rest; }
}
function readUrl() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ""));
  const q = new URLSearchParams(location.search);
  for (const [k, v] of q) if (!p.has(k)) p.set(k, v);
  if (p.get("cohort")) applyCohort(p.get("cohort"));
  if (p.get("soc")) { const i = OCC.findIndex(o => o.soc === p.get("soc")); if (i >= 0) { S.occ = i; S.tab = "job"; } }
  if (p.get("tab") && ["exp", "job", "life", "about"].includes(p.get("tab"))) S.tab = p.get("tab");
  if (p.get("life")) { const i = +p.get("life"); if (i >= 0 && i < D.careers.length) { S.life = i; S.tab = "life"; } }
}
function cohortId() {
  const st = STAGE_ID[S.stage];
  if (S.mode === "hist") return "history:" + MAJ[S.hist].code;
  if (S.rung >= 0 && RUNGS[S.rung].id.includes(":")) return RUNGS[S.rung].share >= 0.001 ? "field:" + RUNGS[S.rung].id : "school:" + RUNGS[S.rung].level;
  if (S.lvl >= 0) return st ? "school_stage:" + LV[S.lvl].id + "|" + st : "school:" + LV[S.lvl].id;
  return st ? "stage:" + st : null;
}
function writeUrl() {
  const p = new URLSearchParams();
  p.set("tab", S.tab);
  if (S.tab === "exp") { const id = (S.mode === "school" && S.rung >= 0 && RUNGS[S.rung].id.includes(":")) ? "field:" + RUNGS[S.rung].id : cohortId(); if (id) p.set("cohort", id); }
  if (S.tab === "job") p.set("soc", OCC[S.occ].soc);
  if (S.tab === "life") p.set("life", S.life);
  history.replaceState(null, "", "#" + p.toString());
}
const go = patch => { Object.assign(S, patch); render(); };
const goJob = i => go({ tab: "job", occ: i, q: "" });
const goRung = r => go({ tab: "exp", mode: "school", lvl: levelIdx(RUNGS[r].level), rung: RUNGS[r].id.includes(":") ? r : -1, stage: 0 });

/* ---------------- shared pieces ---------------- */
const schIndex = () => S.rung >= 0 ? 8 + S.rung : (S.lvl >= 0 ? 1 + S.lvl : 0);
const curCell = () => S.mode === "hist" ? D.hist[S.hist * 4 + S.stage] : D.cells[schIndex() * 4 + S.stage];
function typeLabel() {
  const st = S.stage ? ", " + ST[S.stage - 1].label.toLowerCase() : "";
  if (S.mode === "hist") return "Worked earlier in " + MAJ[S.hist].name.toLowerCase() + " occupations, now in another group" + st;
  if (S.rung >= 0) return RUNGS[S.rung].label + st;
  if (S.lvl >= 0) return LV[S.lvl].label + st;
  return "All workers" + st;
}
const bar = (v, max, cls) => h("span", { class: "bar " + (cls || ""), style: "width:" + Math.max(1, Math.round(120 * v / (max || 1))) + "px" });
const occLink = i => h("button", { class: "lnk", onclick: () => goJob(i), title: OCC[i].soc }, OCC[i].title);
const tile = (v, l, s) => h("div", { class: "tile" }, h("div", { class: "v" }, v), h("div", { class: "l" }, l), s ? h("div", { class: "s" }, s) : null);
function table(head, rows) {
  return h("table", null, h("thead", null, h("tr", null, head.map(c => h("th", { class: c.num ? "num" : null }, c.t)))),
    h("tbody", null, rows.map(r => h("tr", null, r.map((c, i) => h("td", { class: head[i].num ? "num" : (head[i].bar ? "barcell" : null) }, c))))));
}
function optionsBlock(c, who) {
  const more = c.ratio == null ? null : (c.ratio >= 1 ? pct(c.ratio - 1, 0) + " more" : pct(1 - c.ratio, 0) + " less");
  return h("div", { class: "note" },
    "An occupation is open to a worker who holds every level it requires, has the related experience and license it asks for, and can enter it: they trained for it, or drew entry among those who qualify. ",
    pct(c.better_q) + " of " + who + " qualify for a better-paid occupation; the build's entry limits and displacement leave it open to " + pct(c.better) + ". ",
    more ? "For those with another occupation open, the best-paid one pays a median " + more + " than the occupation they hold." : "");
}
function openTable(c, sortKey, onSort) {
  const rows = sortKey === "paid" ? c.paid : c.open;
  const mx = Math.max(...rows.map(r => r[1]), 0.01);
  return h("div", null,
    h("div", { class: "row" },
      h("button", { class: "btn" + (sortKey === "share" ? " on" : ""), onclick: () => onSort("share") }, "Most common"),
      h("button", { class: "btn" + (sortKey === "paid" ? " on" : ""), onclick: () => onSort("paid") }, "Best paid, open to at least 5%")),
    rows.length ? table([{ t: "Occupation" }, { t: "Pay", num: 1 }, { t: "Can enter", bar: 1 }, { t: "", num: 1 }, { t: "Qualify", num: 1 }],
      rows.map(r => [occLink(r[0]), fmt$(OCC[r[0]].wage), bar(r[1], mx), pct(r[1]), pct(r[2])]))
      : h("div", { class: "meta" }, "No other occupation is open to at least 5% of this group."));
}

/* ---------------- worker types ---------------- */
function sideExp(s) {
  const lvlSel = h("select", { onchange: e => go({ lvl: +e.target.value, rung: -1 }) },
    h("option", { value: -1 }, "All workers"), LV.map((l, i) => h("option", { value: i }, l.label)));
  lvlSel.value = S.lvl;
  let fieldSel = null;
  if (S.lvl >= 3) {
    const rs = rungsOf(S.lvl);
    fieldSel = h("select", { onchange: e => go({ rung: +e.target.value }) }, h("option", { value: -1 }, "All fields"),
      rs.map(r => h("option", { value: r, disabled: D.cells[(8 + r) * 4] == null }, (RUNGS[r].field || "Other fields") + " (" + fmtW(RUNGS[r].w) + ")")));
    fieldSel.value = S.rung;
  }
  const histSel = h("select", { onchange: e => go({ hist: +e.target.value }) }, MAJ.map((m, i) => h("option", { value: i }, m.name)));
  histSel.value = S.hist;
  s.append(h("div", { class: "card" }, h("h3", null, "Choose an experience"),
    h("div", { class: "row" },
      h("button", { class: "btn" + (S.mode === "school" ? " on" : ""), onclick: () => go({ mode: "school" }) }, "Schooling"),
      h("button", { class: "btn" + (S.mode === "hist" ? " on" : ""), onclick: () => go({ mode: "hist" }) }, "Earlier work")),
    S.mode === "school" ? [h("label", { class: "l" }, "Highest schooling"), lvlSel,
      fieldSel ? [h("label", { class: "l" }, S.lvl === 3 ? "Field of degree" : "Field of the bachelor's degree"), fieldSel] : null]
      : [h("label", { class: "l" }, "Held a job in this group earlier, works in another now"), histSel],
    h("label", { class: "l" }, "Career stage (years of experience)"),
    h("div", { class: "row" }, STAGE_SHORT.map((t, i) => h("button", { class: "btn" + (S.stage === i ? " on" : ""), onclick: () => go({ stage: i }), title: STAGE_LBL[i] }, t)))));
  const c = curCell(), id = cohortId();
  const exact = !(S.mode === "school" && S.rung >= 0 && S.stage) && !(S.mode === "hist" && S.stage) && !(S.mode === "school" && S.rung >= 0 && RUNGS[S.rung].share < 0.001);
  s.append(h("div", { class: "card" }, h("h3", null, typeLabel()),
    c ? h("div", { class: "kv" }, h("b", null, "Workers"), h("span", null, fmtW(c.w) + " (" + pct(c.w / M.workers) + " of all)"),
      h("b", null, "Records"), h("span", null, c.n.toLocaleString("en-US") + " simulated career records")) : h("div", { class: "meta" }, "Fewer than " + M.min_rec + " simulated records."),
    h("p", null, h("a", { href: SCEN + (id ? "?scope=cohort&cohort=" + encodeURIComponent(id) : "?scope=economy") }, "See this worker type in the automation scenarios →")),
    exact ? null : h("div", { class: "meta" }, "The scenarios page groups workers more broadly; the link opens the closest group.")));
}
function viewExp(el) {
  const c = curCell();
  if (!c) { el.append(h("div", { class: "note" }, "Fewer than " + M.min_rec + " simulated career records share this experience, too few to describe. Choose a broader field or all career stages.")); return; }
  const who = "these workers";
  el.append(h("div", { class: "tiles" },
    tile(fmtW(c.w), "workers"), tile(fmt$(c.wage_med), "median pay of the occupation held", "mean " + fmt$(c.wage)),
    tile(c.x.toFixed(1), "years of experience, mean"), tile(num(c.k_e), "other occupations open, median", num(c.k_q) + " counting all they qualify for"),
    tile(pct(c.better), "have a better-paid occupation open"), tile(pct(c.only_lower), "have only lower-paid ones open"), tile(pct(c.none), "have no other occupation open")));
  el.append(optionsBlock(c, who));
  const mx = Math.max(...c.held.map(r => r[1]), 0.01);
  const g = h("div", { class: "grid2" });
  g.append(h("div", { class: "card" }, h("h2", null, "Occupations they hold"),
    table([{ t: "Occupation" }, { t: "Pay", num: 1 }, { t: "Share of the group", bar: 1 }, { t: "", num: 1 }],
      c.held.map(r => [occLink(r[0]), fmt$(OCC[r[0]].wage), bar(r[1], mx, "edu"), pct(r[1])])),
    h("div", { class: "meta", style: "margin-top:6px" }, "Pay is the occupation's mean annual wage, May 2015. The ten largest occupations are listed.")));
  g.append(h("div", { class: "card" }, h("h2", null, "Other occupations open to them"), openTable(c, S.openSort, k => go({ openSort: k })),
    h("div", { class: "meta", style: "margin-top:6px" }, "Can enter: share of the group for whom the occupation is open. Qualify: share who meet its requirements, whether or not the build lets them enter.")));
  el.append(g);
  // the same experience across career stages
  const base = S.mode === "hist" ? i => D.hist[S.hist * 4 + i] : i => D.cells[schIndex() * 4 + i];
  const rows = [1, 2, 3].map(i => [i, base(i)]).filter(r => r[1]);
  if (rows.length) el.append(h("div", { class: "card", style: "margin-top:12px" }, h("h2", null, "The same experience at each career stage"),
    table([{ t: "Career stage" }, { t: "Workers", num: 1 }, { t: "Median pay", num: 1 }, { t: "Occupations held so far", num: 1 }, { t: "Others open, median", num: 1 }, { t: "Better-paid one open", num: 1 }, { t: "No other open", num: 1 }, { t: "Largest occupation" }],
      rows.map(([i, x]) => [h("button", { class: "lnk", onclick: () => go({ stage: i }) }, ST[i - 1].label), fmtW(x.w), fmt$(x.wage_med), x.nocc.toFixed(1), num(x.k_e), pct(x.better), pct(x.none), occLink(x.held[0][0])]))));
}

/* ---------------- jobs ---------------- */
function sideJob(s) {
  const majSel = h("select", { onchange: e => go({ maj: e.target.value }) }, h("option", { value: "" }, "All occupation groups"), MAJ.map(m => h("option", { value: m.code }, m.name)));
  majSel.value = S.maj;
  const list = h("div", { class: "list" });
  const fill = () => {
    list.innerHTML = "";
    const q = S.q.trim().toLowerCase();
    let ids = OCC.map((o, i) => i).filter(i => JOBS[i] && (!S.maj || OCC[i].maj === S.maj) && (!q || OCC[i].title.toLowerCase().includes(q) || OCC[i].soc.includes(q)));
    ids.sort((a, b) => OCC[b].emp - OCC[a].emp);
    for (const i of ids.slice(0, 150)) list.append(h("button", { class: i === S.occ ? "on" : null, onclick: () => go({ occ: i }) }, h("span", null, fmtW(OCC[i].emp)), OCC[i].title));
    if (!ids.length) list.append(h("div", { class: "meta", style: "padding:6px 8px" }, "No occupation matches."));
  };
  const inp = h("input", { type: "text", placeholder: "Search 551 occupations", value: S.q, oninput: e => { S.q = e.target.value; fill(); } });
  fill();
  s.append(h("div", { class: "card" }, h("h3", null, "Choose a job"), majSel, h("div", { style: "height:6px" }), inp, list,
    h("div", { class: "meta", style: "margin-top:6px" }, "Largest first; the number is workers.")));
}
function viewJob(el) {
  const p = S.occ, o = OCC[p], c = JOBS[p];
  if (!c) { el.append(h("div", { class: "note" }, "No simulated workers hold this occupation.")); return; }
  const ba = c.lev5[3] + c.lev5[4], baA = c.acs5[3] + c.acs5[4];
  el.append(h("div", { class: "card" }, h("h2", null, o.title), h("div", { class: "meta" }, o.soc + " · " + majName(o.maj) + " occupations"),
    h("p", null, h("a", { href: SCEN + "?scope=occ&soc=" + o.soc }, "See this occupation in the automation scenarios →"))));
  el.append(h("div", { class: "tiles" },
    tile(fmtW(o.emp), "workers"), tile(fmt$(o.wage), "mean annual wage, May 2015"),
    tile(c.x.toFixed(1) + " yrs", "experience, mean", "ACS: " + c.acs_x.toFixed(1) + " yrs"),
    tile(pct(ba, 0), "hold a bachelor's or more", "ACS: " + pct(baA, 0)),
    tile(pct(c.trained, 0), "trained for it", pct(1 - c.trained, 0) + " entered on qualifying alone"),
    tile(num(c.k_e), "other occupations open to its workers, median", pct(c.better) + " have a better-paid one open")));
  const g = h("div", { class: "grid2" });
  // who holds it
  const L5 = ["Less than high school", "High school", "Associate degree", "Bachelor's degree", "Graduate degree"];
  const mxs = Math.max(...c.lev5, 0.01);
  g.append(h("div", { class: "card" }, h("h2", null, "Who holds it"),
    table([{ t: "Highest schooling" }, { t: "Share of its workers", bar: 1 }, { t: "Build", num: 1 }, { t: "ACS", num: 1 }],
      L5.map((l, i) => [l, bar(c.lev5[i], mxs, "edu"), pct(c.lev5[i]), pct(c.acs5[i])])),
    h("div", { class: "meta", style: "margin:4px 0 0" }, "ACS: the same occupation in the American Community Survey, 2015–19. Of its workers here, " +
      pct(c.sch[4]) + " hold a master's, " + pct(c.sch[5]) + " a professional degree and " + pct(c.sch[6]) + " a doctorate."),
    h("div", { style: "height:8px" }),
    table([{ t: "Career stage" }, { t: "Share", bar: 1 }, { t: "", num: 1 }], ST.map((s_, i) => [s_.label, bar(c.stage[i], Math.max(...c.stage), "exp"), pct(c.stage[i])])),
    h("div", { style: "height:8px" }),
    table([{ t: "Most common schooling" }, { t: "Share", num: 1 }], c.rungs.map(r => [h("button", { class: "lnk", onclick: () => goRung(r[0]) }, RUNGS[r[0]].label), pct(r[1])]))));
  // where from
  const mxp = Math.max(...c.prev.map(r => r[1]), 0.01);
  g.append(h("div", { class: "card" }, h("h2", null, "Where its workers came from"),
    table([{ t: "Occupation held just before" }, { t: "Share of its workers", bar: 1 }, { t: "", num: 1 }],
      c.prev.map(r => [r[0] < 0 ? "None: it is their first occupation" : occLink(r[0]), bar(r[1], mxp), pct(r[1])])),
    h("div", { class: "meta", style: "margin-top:6px" }, "Workers have held " + c.nocc.toFixed(1) + " occupations on average, this one included.")));
  // requirements
  const gates = [];
  if (c.xreq) gates.push("Entry needs " + (c.xreq >= 5 ? "5 or more" : "under 5") + " years of related experience (BLS), modeled as " + c.xreq + " years of work.");
  if (c.lic) gates.push("Entry needs a license or exam: only workers who trained for an occupation in the same license family can enter.");
  if (c.adm != null && c.adm < 0.999) gates.push("Entry is rationed: the occupation is open to " + pct(c.adm, c.adm < 0.1 ? 1 : 0) + " of the people who qualify without having trained for it.");
  g.append(h("div", { class: "card" }, h("h2", null, "What it requires"),
    table([{ t: "Requirement" }, { t: "Kind" }, { t: "Level, 0 to 7", bar: 1 }, { t: "", num: 1 }],
      c.req.map(r => [COMPS[r[0]].name, (KINDS.find(k => k[0] === COMPS[r[0]].kind) || ["", ""])[1], bar(r[1], 7, "b2"), r[1].toFixed(1)])),
    h("div", { class: "meta", style: "margin-top:6px" }, "A worker must hold every one of the " + c.n_req + " O*NET components the job rates important, at the job's mean level; the twelve highest are listed" +
      (c.n_spec > 1 ? ", for the largest of the occupation's " + c.n_spec + " specialties." : ".")),
    gates.map(t => h("div", { class: "note", style: "margin-bottom:0" }, t))));
  // what holders can move to
  g.append(h("div", { class: "card" }, h("h2", null, "What its workers could move to"),
    openTable({ open: c.can, paid: c.can_paid }, S.openSort, k => go({ openSort: k })),
    h("div", { class: "meta", style: "margin-top:6px" }, pct(c.better_q) + " qualify for a better-paid occupation and " + pct(c.better) + " can enter one; " + pct(c.none) + " have no other occupation open." +
      (c.ratio != null ? " The best-paid alternative pays a median " + (c.ratio >= 1 ? pct(c.ratio - 1, 0) + " more." : pct(1 - c.ratio, 0) + " less.") : ""))));
  // who else could enter
  g.append(h("div", { class: "card" }, h("h2", null, "Who else could enter it"),
    h("p", null, fmtW(c.in_qual) + " workers in other occupations meet its requirements; it is open to " + fmtW(c.in_can) + " of them" +
      (c.in_raise != null ? ", and for " + pct(c.in_raise, 0) + " of those it would pay more than their current occupation." : ".")),
    c.in_top.length ? table([{ t: "Their current occupation" }, { t: "Pay", num: 1 }, { t: "Workers who could enter", num: 1 }, { t: "Share of that occupation", num: 1 }],
      c.in_top.map(r => [occLink(r[0]), fmt$(OCC[r[0]].wage), fmtW(r[1]), pct(r[2])])) : null));
  el.append(g);
}

/* ---------------- careers ---------------- */
const lifeIds = () => D.careers.map((c, i) => i).filter(i => S.lifeLvl < 0 || RUNGS[D.careers[i][0]].level === LV[S.lifeLvl].id);
function sideLife(s) {
  const ids = lifeIds();
  const sel = h("select", { onchange: e => { S.lifeLvl = +e.target.value; const x = lifeIds(); go({ life: x.length ? x[0] : 0, snap: 0 }); } },
    h("option", { value: -1 }, "Any schooling"), LV.map((l, i) => h("option", { value: i }, l.label)));
  sel.value = S.lifeLvl;
  const pos = ids.indexOf(S.life);
  const step = d => { if (ids.length) go({ life: ids[(Math.max(pos, 0) + d + ids.length) % ids.length], snap: 0 }); };
  s.append(h("div", { class: "card" }, h("h3", null, "Choose a career"), sel,
    h("div", { class: "row" }, h("button", { class: "btn", onclick: () => step(-1) }, "← Previous"), h("button", { class: "btn", onclick: () => step(1) }, "Next →"),
      h("button", { class: "btn", onclick: () => { if (ids.length) go({ life: ids[Math.floor(Math.random() * ids.length)], snap: 0 }); } }, "Random")),
    h("div", { class: "meta" }, "Career " + (pos + 1).toLocaleString("en-US") + " of " + ids.length.toLocaleString("en-US") + " in a random sample of " + M.sample.toLocaleString("en-US") +
      " from the build's " + M.careers.toLocaleString("en-US") + " simulated careers.")));
}
function viewLife(el) {
  const c = D.careers[S.life];
  if (!c) return;
  const [rg, nUp, nDn, nDisp, sp, sx] = c;
  const W = 920, H = 150, L = 46, Rm = 12, T = 12, B = 44, X = x => L + (W - L - Rm) * x / 50;
  const wages = sp.map(s_ => OCC[D.jobocc[s_[0]]].wage), wmax = Math.max(...wages) * 1.08, Y = v => T + (H - T - B) * (1 - v / wmax);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("width", "100%"); svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Occupations held and their pay over 50 years of experience");
  const add = (tag, at, txt) => { const e = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const k in at) e.setAttribute(k, at[k]); if (txt != null) e.textContent = txt; svg.append(e); return e; };
  for (const v of [0, 0.5, 1]) { const w = wmax / 1.08 * v; add("line", { x1: L, x2: W - Rm, y1: Y(w), y2: Y(w), stroke: "#e1e0d9", "stroke-width": 1 }); add("text", { x: L - 6, y: Y(w) + 4, "text-anchor": "end" }, "$" + Math.round(w / 1000) + "k"); }
  for (let x = 0; x <= 50; x += 10) add("text", { x: X(x), y: H - 4, "text-anchor": x === 50 ? "end" : "middle" }, x + (x === 50 ? " years of experience" : ""));
  let path = "";
  sp.forEach((s_, i) => {
    const x0 = s_[1], x1 = i + 1 < sp.length ? sp[i + 1][1] : 50, col = PALETTE[i % PALETTE.length], y = Y(wages[i]);
    path += (i ? " L" : "M") + X(x0) + " " + y + " L" + X(x1) + " " + y;
    const r = add("rect", { x: X(x0) + 1, y: H - B + 8, width: Math.max(1, X(x1) - X(x0) - 2), height: 12, rx: 3, fill: col });
    const t = document.createElementNS("http://www.w3.org/2000/svg", "title"); t.textContent = D.jobtitle[s_[0]] + ", years " + x0 + " to " + x1 + ", " + fmt$(wages[i]); r.append(t);
  });
  add("path", { d: path, fill: "none", stroke: "#0b0b0b", "stroke-width": 2, "stroke-linejoin": "round" });
  sx.forEach((x, i) => add("path", { d: "M" + X(x) + " " + (H - B + 4) + " l-4 -7 l8 0 z", fill: i === S.snap ? "#0b0b0b" : "#c3c2b7" }));
  const span = i => (i + 1 < sp.length ? sp[i + 1][1] : 50) - sp[i][1];
  el.append(h("div", { class: "card" }, h("h2", null, RUNGS[rg].label),
    h("div", { class: "meta" }, "Over the career this person learned the requirements of " + nUp + " better-paid job" + (nUp === 1 ? "" : "s") + " and " + nDn + " lower-paid job" + (nDn === 1 ? "" : "s") +
      ", and was displaced from an occupation " + nDisp + " time" + (nDisp === 1 ? "" : "s") + ". ",
      h("button", { class: "lnk", onclick: () => goRung(rg) }, "Everyone with this schooling →")),
    svg, h("div", { class: "legend" }, h("span", null, "Line: mean annual wage of the occupation held. Band: one color per job. Triangles: the three years at which this person's skills were recorded.")),
    table([{ t: "Years of experience" }, { t: "Job" }, { t: "Occupation" }, { t: "Pay", num: 1 }, { t: "How they entered" }],
      sp.map((s_, i) => [h("span", null, h("span", { class: "dot", style: "background:" + PALETTE[i % PALETTE.length] }), s_[1] + " to " + (s_[1] + span(i)) + " (" + span(i) + ")"),
        D.jobtitle[s_[0]], occLink(D.jobocc[s_[0]]), fmt$(wages[i]), s_[2] ? "Trained for it" : "Qualified and drew entry"]))));
  // skills at a recorded year
  const x = sx[S.snap];
  let job = sp[0][0];
  for (const s_ of sp) if (s_[1] <= x) job = s_[0];
  const base = (S.life * 3 + S.snap) * NC, rows = [];
  let nHeld = 0, nReq = 0;
  for (let k = 0; k < NC; k++) {
    const hv = HOLD[base + k] / 10, rq = FLOORS[job * NC + k] / 10, cr = Math.min(CORE[rg * NC + k] / 10, hv);
    if (hv > 0) nHeld++; if (rq > 0) nReq++;
    if (hv > 0 || rq > 0) rows.push({ k, hv, rq, cr });
  }
  const px = v => Math.round(224 * v / 7);
  const sk = h("div", { class: "skills" });
  for (const [kd, lbl] of KINDS) {
    const rr = rows.filter(r => COMPS[r.k].kind === kd).sort((a, b) => b.hv - a.hv);
    if (!rr.length) continue;
    sk.append(h("div", { class: "g" }, lbl));
    for (const r of rr) sk.append(h("div", { class: "sk", title: COMPS[r.k].name + ": holds " + r.hv.toFixed(1) + ", job requires " + r.rq.toFixed(1) },
      h("span", { class: "nm" }, COMPS[r.k].name),
      h("span", { style: "position:relative;display:block;height:10px;background:#f1f0ea;border-radius:2px" },
        h("span", { style: "position:absolute;left:0;top:0;height:10px;border-radius:2px 0 0 2px;background:var(--edu);width:" + px(r.cr) + "px" }),
        h("span", { style: "position:absolute;top:0;height:10px;border-radius:0 2px 2px 0;background:var(--exp);left:" + (px(r.cr) + (r.cr > 0 ? 2 : 0)) + "px;width:" + Math.max(0, px(r.hv) - px(r.cr) - (r.cr > 0 ? 2 : 0)) + "px" }),
        r.rq > 0 ? h("span", { style: "position:absolute;top:-3px;height:16px;width:2px;background:var(--ink);left:" + (px(r.rq) - 1) + "px" }) : null),
      h("span", { class: "meta" }, r.hv.toFixed(1))));
  }
  el.append(h("div", { class: "card" }, h("h2", null, "Skills held in year " + x + ", working as " + D.jobtitle[job]),
    h("div", { class: "row" }, sx.map((y, i) => h("button", { class: "btn" + (S.snap === i ? " on" : ""), onclick: () => go({ snap: i }) }, "Year " + y))),
    h("div", { class: "legend" },
      h("span", null, h("span", { class: "dot", style: "background:var(--edu)" }), "held by everyone with this schooling"),
      h("span", null, h("span", { class: "dot", style: "background:var(--exp)" }), "added by the first job trained for and jobs learned since"),
      h("span", null, h("span", { class: "dot", style: "background:var(--ink);width:2px" }), "level the job held that year requires")),
    h("div", { class: "meta" }, "Holds " + nHeld + " of " + NC + " components above zero; the job requires " + nReq + ". Levels run from 0 to 7 on O*NET's scale. Held levels only rise: a person keeps the highest level any job on their path required."),
    sk));
}

/* ---------------- how it is built ---------------- */
function viewAbout(el) {
  const f = M.fit, all = D.cells[0];
  const P = (t, ...k) => h("p", null, t, ...k);
  el.append(h("div", { class: "card" }, h("h2", null, "The population is recorded, not re-simulated"),
    P("This page shows the synthetic workforce that the future-of-work simulation uses: " + M.records.toLocaleString("en-US") + " career records taken from " + M.careers.toLocaleString("en-US") +
      " simulated careers and weighted to " + fmtW(M.workers) + " workers in " + M.n_occ + " occupations. Every table is a count over those records. The Careers tab shows " + M.sample.toLocaleString("en-US") + " of the careers in full."),
    P("Version 0.4 replaces the earlier explorer, which simulated one person at a time under a previous model. Its life simulator, skill-value and build-your-own views described that model and are gone.")));
  el.append(h("div", { class: "card" }, h("h2", null, "Each career is built from schooling, the jobs a job leads to, and pay"),
    P("A person leaves school at one of " + RUNGS.length + " schooling rungs (level, and field of degree for bachelor's and above) and works for up to 50 years."),
    h("ul", { style: "margin:4px 0 4px 18px" },
      h("li", null, "Requirements: a job requires its O*NET mean level on every component it rates important, " + NC + " components in all, abilities included. Hiring needs every one."),
      h("li", null, "School: every leaver holds the typical requirements of the first jobs their schooling leads to, on school subjects and abilities, plus the full requirements of one first job drawn for them."),
      h("li", null, "Learning: each year a person may learn the requirements of one better-paid job that their current job feeds, and of lower-paid jobs it feeds. Rates follow observed moves between occupations."),
      h("li", null, "Displacement: at the rate workers leave a job for lower-paid ones, the occupation closes to the person and they take the best of the rest."),
      h("li", null, "Choice: a person holds the best-paid occupation open to them and moves only for " + pct(M.stay, 1) + " more pay."),
      h("li", null, "Entry: a person can enter what they trained for. Any other occupation they qualify for is open with a probability set so employment matches the data. Licensed occupations, the Postal Service exam and jobs that need related experience add gates.")),
    P("The cross-section weights each schooling rung and year of experience by its count of workers in the American Community Survey, then scales each occupation to its May 2015 employment.")));
  el.append(h("div", { class: "card" }, h("h2", null, "Schooling by occupation matches the survey; experience by occupation does not"),
    table([{ t: "Check against the American Community Survey, 2015–19" }, { t: "Build", num: 1 }],
      [["Bachelor's-or-more share by occupation, correlation", f.corr_ba_share.toFixed(2)],
       ["Schooling mix within occupations, share misallocated", pct(f.edu_diss)],
       ["Mean experience by occupation, correlation", f.corr_mean_exp.toFixed(2)],
       ["Experience mix within occupations, share misallocated", pct(f.exp_diss)],
       ["First occupations by schooling, share misallocated", pct(f.first_diss)],
       ["Employment by occupation before scaling to the target, share misallocated", pct(f.emp_diss)],
       ["Yearly moves to a better-paid occupation (target " + pct(f.move_target, 2) + ")", pct(f.move_rate, 2)],
       ["Workers who entered their occupation without training for it", pct(f.incidental)]]),
    h("ul", { style: "margin:8px 0 4px 18px" },
      h("li", null, "Low-paid service occupations are 3 to 8 years too young in the build, and professional and managerial occupations 4 to 7 years too old: too many workers reach the latter by climbing and too few enter from school. Each job page shows the build's mean experience beside the survey's."),
      h("li", null, "A few occupations with very low requirements (manicurists, agricultural graders, counter attendants, interviewers) appear as an option for many workers. Manicurists need a state license that the license families omit."),
      h("li", null, "Each occupation pays one wage, so every move to a lower-paid occupation is a pay cut, and pay does not rise with experience inside an occupation."),
      h("li", null, "Careers are stationary at 2015 wages and requirements. Nobody leaves work and returns."),
      h("li", null, "Field of degree matters only through the first jobs a field leads to. Small fields are grouped; a type with fewer than " + M.min_rec + " records is not shown."))));
  el.append(h("div", { class: "card" }, h("h2", null, "What the whole workforce can do"),
    P("The median worker has " + num(all.k_e) + " other occupations open and qualifies for " + num(all.k_q) + ". " + pct(all.better_q) + " qualify for a better-paid occupation, and " + pct(all.better) + " can enter one; " +
      pct(all.only_lower) + " have only lower-paid occupations open and " + pct(all.none) + " have none. The automation scenarios start from these options: ",
      h("a", { href: SCEN }, "scenarios"), ", ", h("a", { href: "/future-of-work/" }, "summary"), ".")));
  el.append(h("div", { class: "card" }, h("h2", null, "Sources"),
    h("ul", { style: "margin:4px 0 4px 18px" },
      h("li", null, "O*NET 20.1 (U.S. Department of Labor): importance and level of knowledge, skills, abilities and work activities by occupation."),
      h("li", null, "Occupational Employment and Wage Statistics, May 2015 (BLS): employment and mean annual wage."),
      h("li", null, "American Community Survey 2015–19 (IPUMS USA): schooling, field of degree, age and occupation."),
      h("li", null, "BLS Employment Projections: occupational transfer rates and the related work experience occupations need for entry."),
      h("li", null, "Schubert, G., Stansbury, A. and Taska, B. (2020), Monopsony and outside options: moves between occupations observed in résumés."))));
}

/* ---------------- render ---------------- */
function render() {
  document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("on", b.dataset.tab === S.tab));
  const s = $("#side"), el = $("#content");
  const keep = document.activeElement && document.activeElement.tagName === "INPUT";
  s.innerHTML = ""; el.innerHTML = "";
  if (S.tab === "exp") { sideExp(s); viewExp(el); }
  else if (S.tab === "job") { sideJob(s); viewJob(el); }
  else if (S.tab === "life") { sideLife(s); viewLife(el); }
  else { s.append(h("div", { class: "card" }, h("h3", null, "Version " + M.version), h("div", { class: "meta" }, "Data built " + M.built + " from the recursive build of 2026-11-06, as the simulation loads it."))); viewAbout(el); }
  if (keep) { const i = $("#side input[type=text]"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  writeUrl();
}
document.querySelectorAll("#nav button").forEach(b => b.addEventListener("click", () => go({ tab: b.dataset.tab })));
window.addEventListener("hashchange", () => { readUrl(); render(); });
readUrl();
if (S.rung >= 0 && !RUNGS[S.rung].id.includes(":")) S.rung = -1;
render();
