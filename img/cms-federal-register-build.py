"""Build script for ../img/cms-federal-register.png (essay: Panic, Neglect, and Paperwork).
Input: every Federal Register document with agency = health-care-finance-administration or
centers-for-medicare-medicaid-services, 1994-2025, pulled from https://www.federalregister.gov/api/v1/documents.json
(fields: document_number, title, type, publication_date) into fr/cms_all_docs.json. Retrieved 2026-09-09.
"""
import json, re, collections, csv
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
docs={d["document_number"]:d for d in json.load(open("fr/cms_all_docs.json"))}.values()
PRA=re.compile(r"information collection|emergency clearance|paperwork reduction|submitted for (public )?comment|submitted to the office of management|omb control|collection of public comment",re.I)
DATA=re.compile(r"\b(reports?|reporting|data|records?|electronic|disclosure|information|documentation|verification|audits?|transparency|attestation|registry|integrity)\b",re.I)
def cls(d):
    t=d["title"]; ty=d["type"]
    if ty in ("Notice","Correction","Presidential Document","Other"):
        return "paperwork" if PRA.search(t) else "other_notice"
    # rules & proposed rules
    return "data_rule" if DATA.search(t) else "program_rule"
rows=collections.defaultdict(collections.Counter)
ex=collections.defaultdict(list)
for d in docs:
    if d["year"]<1995: continue
    c=cls(d); rows[d["year"]][c]+=1
    if len(ex[c])<12: ex[c].append(d["title"][:110])
for k,v in ex.items(): print(k); [print("   ",t) for t in v]
years=sorted(rows)
cats=["program_rule","data_rule","paperwork","other_notice"]
labels={"program_rule":"Rules on payment, coverage, eligibility, standards",
        "data_rule":"Rules on reporting, data, records, systems",
        "paperwork":"Paperwork Reduction Act notices (information collections)",
        "other_notice":"Other notices: meetings, hearings, listings, approvals"}
colors={"program_rule":"#eb6834","data_rule":"#1c5cab","paperwork":"#5598e7","other_notice":"#b7d3f6"}
with open("fr/cms_all_fr_by_year.csv","w",newline="") as f:
    w=csv.writer(f); w.writerow(["year"]+cats+["total"])
    for y in years: w.writerow([y]+[rows[y][c] for c in cats]+[sum(rows[y].values())])
tot={y:sum(rows[y].values()) for y in years}
for y in years: print(y, {c:rows[y][c] for c in cats}, "share_filing=%.2f"%(1-rows[y]["program_rule"]/tot[y]))
allc=collections.Counter(); [allc.update(rows[y]) for y in years]; print("ALL",allc, sum(allc.values()))

plt.rcParams.update({"font.family":"DejaVu Sans","font.size":9,"axes.edgecolor":"#c3c2b7","axes.linewidth":0.6,
    "xtick.color":"#52514e","ytick.color":"#52514e","axes.labelcolor":"#52514e","text.color":"#0b0b0b"})
fig,(ax1,ax2)=plt.subplots(2,1,figsize=(9,8.2),dpi=200,gridspec_kw={"height_ratios":[1.15,1],"hspace":0.42})
fig.patch.set_facecolor("#fcfcfb")
for ax in (ax1,ax2):
    ax.set_facecolor("#fcfcfb")
    for s in ("top","right"): ax.spines[s].set_visible(False)
    ax.spines["left"].set_visible(False)
    ax.yaxis.grid(True,color="#e1e0d9",linewidth=0.6); ax.set_axisbelow(True)
    ax.tick_params(length=0)
# panel 1: 100% stacked share per year
import numpy as np
x=np.array(years); bottom=np.zeros(len(years))
for c in cats:
    v=np.array([rows[y][c]/tot[y]*100 for y in years])
    ax1.bar(x,v,bottom=bottom,color=colors[c],width=0.78,edgecolor="#fcfcfb",linewidth=1.2,label=labels[c])
    bottom+=v
ax1.set_ylim(0,100); ax1.set_yticks([0,25,50,75,100]); ax1.set_yticklabels(["0%","25%","50%","75%","100%"])
ax1.set_xlim(years[0]-0.7,years[-1]+0.7); ax1.set_xticks(list(range(1995,2026,5)))
ax1.set_title("Share of each year's documents",loc="left",fontsize=10,color="#52514e",pad=8)
# direct labels on the last bar
yl=years[-1]; b=0
for c in cats:
    v=rows[yl][c]/tot[yl]*100
    if v>4: ax1.text(yl+0.65,b+v/2,f"{v:.0f}%",va="center",ha="left",fontsize=8,color="#52514e")
    b+=v
# panel 2: cumulative counts, stacked
bottom=np.zeros(len(years))
for c in cats:
    v=np.cumsum([rows[y][c] for y in years])
    ax2.bar(x,v,bottom=bottom,color=colors[c],width=0.78,edgecolor="#fcfcfb",linewidth=1.2)
    bottom+=v
ax2.set_xlim(years[0]-0.7,years[-1]+0.7); ax2.set_xticks(list(range(1995,2026,5)))
ax2.set_title("Cumulative count since 1995",loc="left",fontsize=10,color="#52514e",pad=8)
ax2.yaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v,p:f"{int(v):,}"))
b=0
for c in cats:
    v=sum(rows[y][c] for y in years)
    ax2.text(yl+0.65,b+v/2,f"{v:,}",va="center",ha="left",fontsize=8,color="#52514e"); b+=v
h,l=ax1.get_legend_handles_labels()
fig.legend(h[::-1],l[::-1],loc="upper left",bbox_to_anchor=(0.06,0.985),frameon=False,fontsize=8.5,ncol=1,handlelength=1.2,handleheight=1.0)
fig.suptitle("What the Medicaid agency publishes in the Federal Register, 1995–2025",x=0.06,y=1.06,ha="left",fontsize=12.5,fontweight="bold")
fig.text(0.06,1.02,"Every Federal Register document issued by HCFA/CMS, classified by title and type. Filing on top; fixing at the bottom.",ha="left",fontsize=9,color="#52514e")
fig.subplots_adjust(top=0.80,bottom=0.05,left=0.08,right=0.93)
fig.savefig("fr/cms-federal-register.png",bbox_inches="tight",facecolor=fig.get_facecolor())
print("saved")
