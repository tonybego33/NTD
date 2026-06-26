"""
compute_gares_3km.py — Proximité aux gares (jumeau du 1,5 km école).

Calcule, à moins de 1,5 km d'une gare de voyageurs (BPE E107/E108/E109) :
  - le % d'habitants (via carreaux de population Filosofi 200 m)
  - le % d'équipements du quotidien (même panier que l'indicateur école)
à l'échelle COMMUNE et à l'échelle EPCI.

CRS unifié en EPSG:3035 (LAEA), comme le script école corrigé.

Sorties :
  backend/data/gares_dispersion_communes.csv
  backend/data/gares_dispersion_epci.csv
"""
import csv
import gzip
import pickle
import re
import sys
import time
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PICKLE = ROOT / "backend" / "data" / "precomputed.pkl.gz"
BPE = ROOT / "data_brut" / "BPE24.csv"
CARREAUX = ROOT / "data_brut" / "carreaux_200m_met.csv"
OUT_COM = ROOT / "backend" / "data" / "gares_dispersion_communes.csv"
OUT_EPCI = ROOT / "backend" / "data" / "gares_dispersion_epci.csv"

RAYON_M = 1500
GARES = {"E107", "E108", "E109"}
EQUIPEMENTS_QUOTIDIEN = {
    "A129", "A203", "A206", "A207", "A208", "A301", "A302",
    "B102", "B201", "B202", "B203", "B204", "B301", "B313", "B316",
    "D108", "D113", "D201", "D307", "D401", "D402", "D403",
    "D502", "F111", "F113", "F116", "F121", "F307",
}
IDCAR_RE = re.compile(r"N(\d+)E(\d+)")


def parse_num(s):
    if not s:
        return None
    try:
        return float(s.replace(",", ".").strip())
    except (ValueError, AttributeError):
        return None


def parse_idcar(idcar):
    m = IDCAR_RE.search(idcar or "")
    if not m:
        return None, None
    return int(m.group(2)) + 100, int(m.group(1)) + 100


def sniff_delim(path):
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        head = f.readline()
    return ";" if head.count(";") >= head.count(",") else ","


def pct_in_rayon(points_pop, ancres, rayon_sq):
    """points_pop : liste (x, y, poids) ; ancres : liste (x, y).
    Renvoie le poids couvert (au moins une ancre a moins de rayon)."""
    couvert = 0.0
    for px, py, w in points_pop:
        for ax, ay in ancres:
            if (px - ax) ** 2 + (py - ay) ** 2 <= rayon_sq:
                couvert += w
                break
    return couvert


def main():
    print("\n=== Proximite gares (1,5 km) — commune + EPCI ===\n")
    for p, label in [(BPE, "BPE24.csv"), (CARREAUX, "carreaux_200m_met.csv"), (PICKLE, "pickle")]:
        if not p.exists():
            sys.exit(f"[err] {label} introuvable : {p}")

    try:
        from pyproj import Transformer
    except ImportError:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyproj", "--break-system-packages", "-q"])
        from pyproj import Transformer
    to_laea = Transformer.from_crs("EPSG:2154", "EPSG:3035", always_xy=True)

    print("[1/5] Pickle...")
    with gzip.open(PICKLE, "rb") as f:
        data = pickle.load(f)
    commune_to_epci = {c: d.get("epci") for c, d in data["communes"].items() if d.get("epci")}
    commune_lib = {c: d.get("libgeo", "?") for c, d in data["communes"].items()}
    epci_lib = {c: d.get("libgeo", "?") for c, d in data.get("epci", {}).items()}
    print(f"      {len(commune_to_epci)} communes")

    print("\n[2/5] BPE24.csv (gares + equipements)...")
    t0 = time.time()
    gares_raw, equip_raw = [], []
    delim = sniff_delim(BPE)
    print(f"      separateur : {delim}")
    with open(BPE, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f, delimiter=delim, quotechar='"')
        for i, row in enumerate(reader, 1):
            if i % 500000 == 0:
                print(f"      {i} lignes ({time.time()-t0:.0f}s)...")
            depcom = (row.get("DEPCOM") or "").strip()
            if depcom not in commune_to_epci:
                continue
            x = parse_num(row.get("LAMBERT_X"))
            y = parse_num(row.get("LAMBERT_Y"))
            if x is None or y is None:
                continue
            typequ = (row.get("TYPEQU") or "").strip()
            if typequ in GARES:
                gares_raw.append((x, y, depcom))
            if typequ in EQUIPEMENTS_QUOTIDIEN:
                equip_raw.append((x, y, depcom))
    print(f"      {len(gares_raw)} gares, {len(equip_raw)} equipements")

    print("\n[3/5] Conversion Lambert93 -> LAEA...")
    gares_com, equip_com = defaultdict(list), defaultdict(list)
    if gares_raw:
        gx, gy, gd = zip(*gares_raw)
        gx2, gy2 = to_laea.transform(gx, gy)
        for x, y, d in zip(gx2, gy2, gd):
            gares_com[d].append((x, y))
    if equip_raw:
        qx, qy, qd = zip(*equip_raw)
        qx2, qy2 = to_laea.transform(qx, qy)
        for x, y, d in zip(qx2, qy2, qd):
            equip_com[d].append((x, y))
    gares_epci = defaultdict(list)
    for com, pts in gares_com.items():
        gares_epci[commune_to_epci[com]].extend(pts)
    equip_epci = defaultdict(list)
    for com, pts in equip_com.items():
        equip_epci[commune_to_epci[com]].extend(pts)

    print("\n[4/5] carreaux_200m_met.csv...")
    t0 = time.time()
    carreaux_com = defaultdict(list)
    dc = sniff_delim(CARREAUX)
    with open(CARREAUX, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter=dc)
        for i, row in enumerate(reader, 1):
            if i % 1000000 == 0:
                print(f"      {i} carreaux ({time.time()-t0:.0f}s)...")
            lcog = (row.get("lcog_geo") or "").strip()
            depcom = lcog.split("|")[0] if lcog else ""
            if depcom not in commune_to_epci:
                continue
            try:
                ind = float(row.get("ind") or 0)
            except ValueError:
                continue
            x, y = parse_idcar(row.get("idcar_200m"))
            if x is None:
                continue
            carreaux_com[depcom].append((x, y, ind))
    carreaux_epci = defaultdict(list)
    for com, pts in carreaux_com.items():
        carreaux_epci[commune_to_epci[com]].extend(pts)

    rayon_sq = RAYON_M ** 2

    print(f"\n[5/5] Calcul commune ({len(commune_to_epci)}) + EPCI ({len(carreaux_epci)})...")
    t0 = time.time()

    # --- Communes : carreaux de la commune vs gares de tout l'EPCI ---
    res_com = []
    for j, (com, epci) in enumerate(sorted(commune_to_epci.items()), 1):
        if j % 5000 == 0:
            print(f"      commune {j}/{len(commune_to_epci)} ({time.time()-t0:.0f}s)...")
        gares = gares_epci.get(epci, [])
        cars = carreaux_com.get(com, [])
        eqs = equip_com.get(com, [])
        pop = sum(w for _, _, w in cars)
        ph = pe = None
        if gares and cars and pop > 0:
            ph = round(100 * pct_in_rayon(cars, gares, rayon_sq) / pop, 2)
        if gares and eqs:
            eq_pts = [(x, y, 1) for x, y in eqs]
            pe = round(100 * pct_in_rayon(eq_pts, gares, rayon_sq) / len(eqs), 2)
        res_com.append({
            "codgeo": com, "libgeo": commune_lib.get(com, "?"), "code_epci": epci,
            "n_gares": len(gares_com.get(com, [])), "n_equipements": len(eqs),
            "n_carreaux": len(cars), "pop_insee": round(pop),
            "pct_habitat_gare_3": ph, "pct_equipements_gare_3": pe,
        })

    # --- EPCI : tous les carreaux de l'EPCI vs toutes ses gares ---
    res_epci = []
    for epci in sorted(carreaux_epci.keys()):
        gares = gares_epci.get(epci, [])
        cars = carreaux_epci.get(epci, [])
        eqs = equip_epci.get(epci, [])
        pop = sum(w for _, _, w in cars)
        ph = pe = None
        if gares and cars and pop > 0:
            ph = round(100 * pct_in_rayon(cars, gares, rayon_sq) / pop, 2)
        if gares and eqs:
            eq_pts = [(x, y, 1) for x, y in eqs]
            pe = round(100 * pct_in_rayon(eq_pts, gares, rayon_sq) / len(eqs), 2)
        res_epci.append({
            "code_epci": epci, "libepci": epci_lib.get(epci, "?"),
            "n_gares": len(gares), "n_equipements": len(eqs),
            "n_carreaux": len(cars), "pop_insee": round(pop),
            "pct_habitat_gare_3": ph, "pct_equipements_gare_3": pe,
        })
    print(f"      calcul en {time.time()-t0:.0f}s")

    fcom = ["codgeo", "libgeo", "code_epci", "n_gares", "n_equipements",
            "n_carreaux", "pop_insee", "pct_habitat_gare_3", "pct_equipements_gare_3"]
    fepci = ["code_epci", "libepci", "n_gares", "n_equipements",
             "n_carreaux", "pop_insee", "pct_habitat_gare_3", "pct_equipements_gare_3"]
    OUT_COM.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_COM, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fcom)
        w.writeheader()
        w.writerows(res_com)
    with open(OUT_EPCI, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fepci)
        w.writeheader()
        w.writerows(res_epci)
    print(f"\nEcrit : {OUT_COM}")
    print(f"Ecrit : {OUT_EPCI}")

    # Controle : les 5 EPCI temoins
    print("\n[controle EPCI temoins]")
    temoins = {
        "241700434": "CA La Rochelle", "200067213": "Grand Reims",
        "200067106": "CA Pays Basque", "245804406": "Nevers Agglo",
        "200067932": "Golfe Morbihan-Vannes",
    }
    for r in res_epci:
        if r["code_epci"] in temoins:
            print(f"   {temoins[r['code_epci']]:26} habitat {r['pct_habitat_gare_3']}%  "
                  f"equip {r['pct_equipements_gare_3']}%  (gares {r['n_gares']})")
    print()


if __name__ == "__main__":
    main()
