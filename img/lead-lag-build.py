"""Build the homepage figure "pass rate at the five-year proof, from the most lagging to the most leading fifth".

What it plots
  Raw shares of US trademark registrations that passed the sworn five-year proof of
  continued use, by fifth of lead. Lead is the paper's measure (past-facing minus
  future-facing surprise of the goods-and-services description, production "rolling"
  scoring); each registration is ranked within its Nice class x registration-year cell,
  exactly as scripts/combined_model.py frame() does in the tm-vocabulary repo, and the
  rank is cut into fifths. No controls and no fixed effects beyond that within-cell ranking.

Sample
  data/processed/battery_frame.parquet in the tm-vocabulary repo: the paper's frame,
  3,104,534 registrations of 2002-2018, one row per serial. Registrations filed under
  the Madrid Protocol (basis 66a, 5.8%) are kept, as in the paper, which controls for
  them; dropping them moves the plotted end-to-end gaps by 0.4 points or less.

Agreement with the paper's numbers
  The pooled tenths computed from the same frame reproduce paper/results/paperB_models.json
  curves.lead (48.71% most lagging tenth, 45.62% most leading). The paper's adjusted
  estimates (most leading minus most lagging, class x year fixed effects and controls,
  paper/results/where_it_accrues.json) have the same signs as the raw gaps drawn here:
  registered 2002-07 -0.1, 2008-12 -2.2, 2013-18 -2.0; class 42 -9.6; class 32 +9.6.

Outputs
  img/lead-lag-data.csv           every plotted share, plus unplotted context rows
  --out FILE (default stdout)     the homepage <section> with the inline SVG

Run with the research repo's interpreter (needs polars):
  <tm-vocabulary>/.venv-analysis/Scripts/python.exe img/lead-lag-build.py --out section.html
  (set TM_FRAME to the path of battery_frame.parquet if the repo is not at the default location)
"""
from __future__ import annotations

import argparse
import csv
import math
import os
import sys
from pathlib import Path

import polars as pl

HERE = Path(__file__).resolve().parent
FRAME = Path(os.environ.get("TM_FRAME", r"C:\shared-secure\research\novelty\data\processed\battery_frame.parquet"))
FIFTHS = ["Most lagging fifth", "Second fifth", "Middle fifth", "Fourth fifth", "Most leading fifth"]

# key, label, short label, plotted, filter
SERIES = [
    ("early", "All classes, registered 2002\u201307", "All classes, 2002\u201307", 1, pl.col("reg_year").is_between(2002, 2007)),
    ("late", "All classes, registered 2008\u201318", "All classes, 2008\u201318", 1, pl.col("reg_year").is_between(2008, 2018)),
    ("tech", "Technology services (class 42), 2002\u201318", "Technology services", 1, pl.col("cls") == "042"),
    ("beer", "Beer and soft drinks (class 32), 2002\u201318", "Beer and soft drinks", 1, pl.col("cls") == "032"),
    ("all", "All classes, registered 2002\u201318", "", 0, pl.lit(True)),
    ("p0812", "All classes, registered 2008\u201312", "", 0, pl.col("reg_year").is_between(2008, 2012)),
    ("p1318", "All classes, registered 2013\u201318", "", 0, pl.col("reg_year").is_between(2013, 2018)),
    ("tobacco", "Tobacco and vaping (class 34), 2002\u201318", "", 0, pl.col("cls") == "034"),
    ("construction", "Construction and repair (class 37), 2002\u201318", "", 0, pl.col("cls") == "037"),
]


def compute() -> dict[str, list[tuple[int, float, float]]]:
    d = pl.read_parquet(FRAME, columns=["failed1", "z", "cell", "reg_year", "cls"])
    d = d.with_columns(
        (100 * (1 - pl.col("failed1").cast(pl.Float64))).alias("passed"),
        ((pl.col("z").rank("average").over("cell") - 0.5) / pl.len().over("cell")).alias("pct"),
    ).with_columns((pl.col("pct") * 5).floor().clip(0, 4).cast(pl.Int8).alias("fifth"))
    out = {}
    for key, _, _, _, flt in SERIES:
        g = d.filter(flt).group_by("fifth").agg(pl.col("passed").mean().alias("m"), pl.len().alias("n")).sort("fifth")
        rows = []
        for m, n in zip(g["m"], g["n"]):
            p = m / 100
            rows.append((int(n), float(m), 100 * math.sqrt(p * (1 - p) / n)))
        assert len(rows) == 5, key
        out[key] = rows
    return out


def write_csv(res) -> None:
    with open(HERE / "lead-lag-data.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["series", "label", "plotted", "fifth", "fifth_label", "registrations", "passed_pct", "binomial_se_pct"])
        for key, label, _, plotted, _ in SERIES:
            for i, (n, m, se) in enumerate(res[key]):
                w.writerow([key, label.replace("\u2013", "-"), plotted, i + 1, FIFTHS[i], n, f"{m:.2f}", f"{se:.2f}"])


TABLE_LABEL = {  # &#8288; (word joiner) keeps a year range on one line
    "early": "All classes, 2002&ndash;&#8288;07",
    "late": "All classes, 2008&ndash;&#8288;18",
    "tech": "Technology services (class 42)",
    "beer": "Beer and soft drinks (class 32)",
}


# ------------------------------------------------------------------ drawing
Y0, Y1 = 38.0, 52.0
TICKS = [40, 45, 50]


def svg(res, wide: bool) -> str:
    if wide:
        W, H, L, R, T, B = 760, 452, 56, 196, 36, 70
    else:
        W, H, L, R, T, B = 360, 404, 40, 60, 34, 66
    pw, ph = W - L - R, H - T - B
    pad = 26 if wide else 16

    def px(i):
        return L + pad + i * (pw - 2 * pad) / 4

    def py(v):
        return T + (Y1 - v) / (Y1 - Y0) * ph

    cls = "leadlag__svg leadlag__svg--wide" if wide else "leadlag__svg leadlag__svg--narrow"
    tid = "leadlag-title-w" if wide else "leadlag-title-n"
    o = [f'<svg class="{cls}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="{tid}">',
         f'<title id="{tid}">Share of registrations that passed the five-year proof, from the most lagging fifth to the most leading fifth, '
         'for all classes registered 2002 to 2007, all classes registered 2008 to 2018, technology services and beer and soft drinks.</title>']
    o.append(f'<text class="ll-ytitle" x="0" y="{14 if wide else 13}">Passed the five-year proof</text>')
    for t in TICKS:
        y = py(t)
        o.append(f'<line class="ll-grid" x1="{L}" x2="{px(4) + 8:.1f}" y1="{y:.1f}" y2="{y:.1f}"/>')
        o.append(f'<text class="ll-tick" x="{L - 8}" y="{y + 4:.1f}" text-anchor="end">{t}%</text>')
    base = T + ph
    o.append(f'<line class="ll-base" x1="{L}" x2="{px(4) + 8:.1f}" y1="{base}" y2="{base}"/>')
    for i in range(5):
        o.append(f'<line class="ll-base" x1="{px(i):.1f}" x2="{px(i):.1f}" y1="{base}" y2="{base + 5}"/>')
    if wide:
        o.append(f'<text class="ll-xlab" x="{px(0):.1f}" y="{base + 22}" text-anchor="middle">Most lagging fifth</text>')
        o.append(f'<text class="ll-xlab" x="{px(2):.1f}" y="{base + 22}" text-anchor="middle">Middle fifth</text>')
        o.append(f'<text class="ll-xlab" x="{px(4):.1f}" y="{base + 22}" text-anchor="middle">Most leading fifth</text>')
        o.append(f'<text class="ll-xtitle" x="{L + pw / 2:.1f}" y="{base + 48}" text-anchor="middle">'
                 'Lead of the description, ranked within Nice class and registration year</text>')
    else:
        o.append(f'<text class="ll-xlab" x="{px(0) - 12:.1f}" y="{base + 21}" text-anchor="start">Most lagging</text>')
        o.append(f'<text class="ll-xlab" x="{px(4) + 12:.1f}" y="{base + 21}" text-anchor="end">Most leading</text>')
        o.append(f'<text class="ll-xtitle" x="{L + pw / 2:.1f}" y="{base + 42}" text-anchor="middle">Fifths of lead, ranked within</text>')
        o.append(f'<text class="ll-xtitle" x="{L + pw / 2:.1f}" y="{base + 57}" text-anchor="middle">Nice class and registration year</text>')
    order = ["early", "late", "tech", "beer"]
    for key in order:
        pts = " ".join(f"{px(i):.1f},{py(m):.1f}" for i, (_, m, _) in enumerate(res[key]))
        o.append(f'<polyline class="ll-line ll-line--{key}" points="{pts}"/>')
    for key in order:
        label = next(s[1] for s in SERIES if s[0] == key)
        short = next(s[2] for s in SERIES if s[0] == key)
        for i, (n, m, _) in enumerate(res[key]):
            x, y = px(i), py(m)
            o.append(f'<circle class="ll-dot ll-dot--{key}" cx="{x:.1f}" cy="{y:.1f}" r="{4.5 if wide else 4}"/>')
            o.append(f'<circle class="ll-hit" cx="{x:.1f}" cy="{y:.1f}" r="13"><title>{label}, {FIFTHS[i].lower()}: '
                     f'{m:.1f}% of {n:,} registrations passed</title></circle>')
        n, m, _ = res[key][4]
        x, y = px(4) + (14 if wide else 10), py(m)
        if wide:
            o.append(f'<text class="ll-name" x="{x:.1f}" y="{y - 2:.1f}">{short}</text>')
            o.append(f'<text class="ll-val" x="{x:.1f}" y="{y + 14:.1f}">{m:.1f}%</text>')
        else:
            o.append(f'<text class="ll-val" x="{x:.1f}" y="{y + 4:.1f}">{m:.1f}%</text>')
    n, m, _ = res["beer"][0]
    o.append(f'<text class="ll-val" x="{px(0):.1f}" y="{py(m) + 20:.1f}" text-anchor="middle">{m:.1f}%</text>')
    o.append("</svg>")
    return "\n          ".join(o)


def section(res) -> str:
    def ends(key):
        return res[key][0][1], res[key][4][1]

    def f1(v):
        return f"{v:.1f}"

    def gap(key):
        a, b = ends(key)
        g = round(b, 1) - round(a, 1)   # difference of the printed values, so the table adds up
        return ("&minus;" if g < 0 else "+") + f"{abs(g):.1f}"

    def absgap(key):
        a, b = ends(key)
        return f"{abs(round(b, 1) - round(a, 1)):.1f}"

    total = sum(n for n, _, _ in res["all"])
    rows = []
    for key in ("early", "late", "tech", "beer"):
        label = TABLE_LABEL[key]
        a, b = ends(key)
        rows.append(f'            <tr><th scope="row">{label}</th><td class="num">{f1(a)}</td><td class="num">{f1(b)}</td>'
                    f'<td class="num">{gap(key)}</td></tr>')
    key_items = "\n".join(
        f'          <li><svg class="ll-swatch" viewBox="0 0 30 10" aria-hidden="true"><line class="ll-line ll-line--{k}" x1="1" x2="29" y1="5" y2="5"/>'
        f'<circle class="ll-dot ll-dot--{k}" cx="15" cy="5" r="3.5"/></svg>{next(s[2] for s in SERIES if s[0] == k).replace(chr(0x2013), "&ndash;")}</li>'
        for k in ("early", "late", "tech", "beer"))
    bl, be = ends("beer")
    return f'''  <section class="plot band--ink" aria-labelledby="plot-head">
    <div class="container grid-12">
      <figure class="plot__figure leadlag">
        <ul class="leadlag__key">
{key_items}
        </ul>
          {svg(res, True)}
          {svg(res, False)}
        <figcaption>{total:,} US trademark registrations, 2002 to 2018. Shares are raw, with no controls beyond the ranking within class and year.</figcaption>
      </figure>
      <div class="plot__text">
        <h2 id="plot-head">Since 2008, being first has usually cost</h2>
        <p>Each line follows registrations from the fifth whose goods-and-services wording ran furthest behind its industry&rsquo;s filings to the fifth whose wording ran furthest ahead, and gives the share that passed the sworn five-year proof that the goods were still being sold. Among 2002&ndash;&#8288;07 registrations the two ends passed at nearly the same rate; among 2008&ndash;&#8288;18 registrations the most leading fifth passed {absgap("late")} points less often than the most lagging, and in technology services {absgap("tech")} points less often. In beer and soft drinks the pattern is the opposite: the most lagging fifth passed least often ({f1(bl)}%) and the most leading fifth most often ({f1(be)}%).</p>
        <table class="legend legend--ends">
          <caption>Percent that passed the five-year proof, and the difference in points. Years are registration years; the two industry rows cover 2002 to 2018.</caption>
          <thead>
            <tr><td></td><th scope="col">Most lagging fifth</th><th scope="col">Most leading fifth</th><th scope="col">Difference</th></tr>
          </thead>
          <tbody>
{chr(10).join(rows)}
          </tbody>
        </table>
        <ul class="links">
          <li><a href="https://aporia.institute/tm-vocabulary/online-appendix/ipo-viewer/index.html">IPO viewer</a></li>
          <li><a href="https://aporia.institute/tm-vocabulary/online-appendix/themes/">trademark explorer</a></li>
          <li><a href="./img/lead-lag-data.csv">data for this figure</a></li>
        </ul>
      </div>
    </div>
  </section>
'''


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="-")
    a = ap.parse_args()
    res = compute()
    write_csv(res)
    html = section(res)
    if a.out == "-":
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stdout.write(html)
    else:
        Path(a.out).write_text(html, encoding="utf-8", newline="\n")
    for key, label, _, plotted, _ in SERIES:
        print(f"{key:13s} " + " ".join(f"{m:6.2f}" for _, m, _ in res[key]) + f"  n={sum(n for n, _, _ in res[key]):,}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
