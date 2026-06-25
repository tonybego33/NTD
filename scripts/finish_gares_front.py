"""finish_gares_front.py — references.json (reperes) + app.js (carte gare). Idempotent."""
import csv, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REFS = ROOT / "frontend" / "js" / "references.json"
APP = ROOT / "frontend" / "js" / "app.js"
CSV_GARES = ROOT / "backend" / "data" / "gares_dispersion_epci.csv"
report = []


def _f(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


if not REFS.exists():
    report.append("references.json : INTROUVABLE")
elif not CSV_GARES.exists():
    report.append("gares_dispersion_epci.csv : INTROUVABLE")
else:
    refs = json.loads(REFS.read_text(encoding="utf-8"))
    epci_dens7 = refs.get("epci_dens7", {})
    nat = {"h": [0.0, 0.0], "e": [0.0, 0.0]}
    grp = {str(g): {"h": [0.0, 0.0], "e": [0.0, 0.0]} for g in range(1, 8)}
    with open(CSV_GARES, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            code = (row.get("code_epci") or "").strip()
            pop = _f(row.get("pop_insee")) or 0.0
            if pop <= 0:
                continue
            h = _f(row.get("pct_habitat_gare_3"))
            e = _f(row.get("pct_equipements_gare_3"))
            d7 = str(epci_dens7.get(code, "")).strip()
            for key, val in (("h", h), ("e", e)):
                if val is None:
                    continue
                nat[key][0] += val * pop
                nat[key][1] += pop
                if d7 in grp:
                    grp[d7][key][0] += val * pop
                    grp[d7][key][1] += pop

    def moy(acc):
        return round(acc[0] / acc[1], 1) if acc[1] > 0 else 0.0

    refs.setdefault("national", {})
    refs["national"]["centralite_habitat_gare"] = moy(nat["h"])
    refs["national"]["centralite_equip_gare"] = moy(nat["e"])
    refs.setdefault("dens7_epci", {})
    for g in range(1, 8):
        gk = str(g)
        refs["dens7_epci"].setdefault(gk, {})
        refs["dens7_epci"][gk]["centralite_habitat_gare"] = moy(grp[gk]["h"])
        refs["dens7_epci"][gk]["centralite_equip_gare"] = moy(grp[gk]["e"])
    REFS.write_text(json.dumps(refs, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    report.append(f"references.json : OK (national habitat {refs['national']['centralite_habitat_gare']} %)")

if not APP.exists():
    report.append("app.js : INTROUVABLE")
else:
    s = APP.read_text(encoding="utf-8")
    orig = s
    anchor = "pr: pairs.centralite_equip_ecole || 0 },"
    add = (anchor
           + "\n      gareHab: { v: V('pct_habitat_gare_3'), fr: nat.centralite_habitat_gare || 0, pr: pairs.centralite_habitat_gare || 0 },"
           + "\n      gareEq: { v: V('pct_equipements_gare_3'), fr: nat.centralite_equip_gare || 0, pr: pairs.centralite_equip_gare || 0 },")
    if "gareHab:" in s:
        report.append("app.js objet ce : deja present, ignore")
    elif anchor in s:
        s = s.replace(anchor, add, 1)
        report.append("app.js objet ce : gareHab / gareEq ajoutes")
    else:
        report.append("app.js objet ce : ANCRE INTROUVABLE")
    new_block = ('<div class="acc-head"><span class="acc-pic">${mqGareEcolePic(\'gare\')}</span>'
                 '<span class="acc-title">À moins de 3 km d\'une gare</span>'
                 '<span class="src">BPE 2024 · Filosofi 2021</span></div>\n'
                 '        <div class="dual">${ecole(\'Habitants\', ce.gareHab)}${ecole(\'Équipements\', ce.gareEq)}'
                 '${barLegend}<div class="acc-note">Part des habitants (et des équipements du quotidien) '
                 'situés à moins de 3 km d\'une gare de voyageurs. Marqueur de desserte ferroviaire du territoire.</div></div>')
    pat = re.compile(r'<div class="acc-head"><span class="acc-pic">\$\{mqGareEcolePic\(\'gare\'\)\}.*?'
                     r'acc-pending">Équipements</span>.*?</div>\s*</div>', re.DOTALL)
    if pat.search(s):
        s = pat.sub(lambda m: new_block, s, count=1)
        report.append("app.js carte gare : branchee")
    else:
        report.append("app.js carte gare : motif introuvable (deja branchee ou texte different)")
    if s != orig:
        APP.write_text(s, encoding="utf-8")

print("=== Resultat ===")
for r in report:
    print("  " + r)
