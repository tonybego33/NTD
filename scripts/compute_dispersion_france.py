"""
Calcul dispersion habitat / équipements, AUX DEUX MAILLES (commune + EPCI).

Optimisation : BPE + carreaux lus UNE seule fois, puis calcul commune par commune,
les EPCI étant agrégés depuis les communes (chiffres EPCI identiques à la version
précédente, aucun double calcul).

Méthode :
  - Écoles : C108 (élémentaires) uniquement
  - Buffer : 1,5 km
  - Habitat : carreaux INSEE 200m Filosofi 2021
  - Équipements : BPE A+B+D+F (panier quotidien)
  - Calcul en EPSG:3035 (LAEA)
  - Pool d'écoles pour une commune = TOUTES les écoles de son EPCI
    (une école juste de l'autre côté de la limite communale compte ; évite les
    effets de bord sur les petites communes).

Sorties :
  - backend/data/dispersion_communes.csv   (NOUVEAU, une ligne par commune)
  - backend/data/dispersion_epci.csv       (inchangé dans sa structure)
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
OUTPUT_EPCI = ROOT / "backend" / "data" / "dispersion_epci.csv"
OUTPUT_COMMUNES = ROOT / "backend" / "data" / "dispersion_communes.csv"

RAYON_M = 1500
TYPEQU_ECOLES = {"C108"}
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


def _pop_in_buffer(carreaux, ecoles, rayon_sq):
    """carreaux : liste (x, y, ind). Retourne (pop_dans_buffer, pop_totale)."""
    pop_in = 0.0
    pop_tot = 0.0
    for cx, cy, ind in carreaux:
        pop_tot += ind
        for sx, sy in ecoles:
            if (cx - sx) ** 2 + (cy - sy) ** 2 <= rayon_sq:
                pop_in += ind
                break
    return pop_in, pop_tot


def _count_in_buffer(points, ecoles, rayon_sq):
    """points : liste (x, y). Retourne (nb_dans_buffer, nb_total)."""
    n_in = 0
    for px, py in points:
        for sx, sy in ecoles:
            if (px - sx) ** 2 + (py - sy) ** 2 <= rayon_sq:
                n_in += 1
                break
    return n_in, len(points)


def _pct(num, den):
    return round(100 * num / den, 2) if den and den > 0 else None


def main():
    print("Calcul dispersion habitat / équipements — communes + EPCI")
    print("Méthode : C108 + buffer 1.5km + carreaux 200m\n")

    for p, label in [(BPE, "BPE24.csv"), (CARREAUX, "carreaux_200m_met.csv"), (PICKLE, "pickle")]:
        if not p.exists():
            sys.exit(f"[err] {label} introuvable : {p}")

    try:
        from pyproj import Transformer
    except ImportError:
        print("[w] pyproj absent, installation...")
        import subprocess
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "pyproj", "--break-system-packages", "-q"]
        )
        from pyproj import Transformer
    to_laea = Transformer.from_crs("EPSG:2154", "EPSG:3035", always_xy=True)

    # 1. Pickle : mapping commune <-> EPCI
    print("[1/5] Chargement pickle...")
    with gzip.open(PICKLE, "rb") as f:
        data = pickle.load(f)
    commune_to_epci = {code: c.get("epci") for code, c in data["communes"].items() if c.get("epci")}
    commune_lib = {code: c.get("libgeo", "?") for code, c in data["communes"].items()}
    epci_to_communes = defaultdict(list)
    for code, epci in commune_to_epci.items():
        epci_to_communes[epci].append(code)
    epci_libelles = {}
    for code, c in data["communes"].items():
        epci = c.get("epci")
        if epci and epci not in epci_libelles:
            epci_libelles[epci] = c.get("libepci", "?")
    print(f"      {len(commune_to_epci):,} communes / {len(epci_to_communes):,} EPCI"
          .replace(",", " "))

    # 2. BPE — écoles et équipements, rangés par DEPCOM
    print(f"\n[2/5] Lecture BPE24.csv (1.4 Go)...")
    t0 = time.time()
    ecoles_raw = []
    equipements_raw = []
    with open(BPE, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f, delimiter=";", quotechar='"')
        for i, row in enumerate(reader, 1):
            if i % 500000 == 0:
                print(f"      {i:,} lignes ({time.time()-t0:.0f}s)...".replace(",", " "))
            depcom = (row.get("DEPCOM") or "").strip()
            if depcom not in commune_to_epci:
                continue
            x = parse_num(row.get("LAMBERT_X"))
            y = parse_num(row.get("LAMBERT_Y"))
            if x is None or y is None:
                continue
            typequ = (row.get("TYPEQU") or "").strip()
            if typequ in TYPEQU_ECOLES:
                ecoles_raw.append((x, y, depcom))
            if typequ in EQUIPEMENTS_QUOTIDIEN:
                equipements_raw.append((x, y, depcom))
    print(f"      {len(ecoles_raw):,} écoles C108, {len(equipements_raw):,} équipements"
          .replace(",", " "))

    # 3. Conversion Lambert93 -> LAEA en batch
    print(f"\n[3/5] Conversion Lambert93 -> LAEA (batch)...")
    ecoles_par_depcom = defaultdict(list)
    equipements_par_depcom = defaultdict(list)
    if ecoles_raw:
        ex, ey, ed = zip(*ecoles_raw)
        ex_l, ey_l = to_laea.transform(ex, ey)
        for x, y, d in zip(ex_l, ey_l, ed):
            ecoles_par_depcom[d].append((x, y))
    if equipements_raw:
        qx, qy, qd = zip(*equipements_raw)
        qx_l, qy_l = to_laea.transform(qx, qy)
        for x, y, d in zip(qx_l, qy_l, qd):
            equipements_par_depcom[d].append((x, y))

    # 4. Carreaux — rangés par DEPCOM
    print(f"\n[4/5] Lecture carreaux_200m_met.csv (447 Mo)...")
    t0 = time.time()
    carreaux_par_depcom = defaultdict(list)
    with open(CARREAUX, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader, 1):
            if i % 1000000 == 0:
                print(f"      {i:,} carreaux ({time.time()-t0:.0f}s)...".replace(",", " "))
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
            carreaux_par_depcom[depcom].append((x, y, ind))
    print(f"      Lecture en {time.time()-t0:.1f}s")

    # 5. Calcul commune par commune (pool d'écoles = toutes celles de l'EPCI),
    #    puis agrégation EPCI à partir des sommes communales.
    print(f"\n[5/5] Calcul dispersion (communes + agrégat EPCI)...")
    t0 = time.time()
    rayon_sq = RAYON_M ** 2
    results_communes = []
    results_epci = []

    for i, epci_code in enumerate(sorted(epci_to_communes.keys()), 1):
        if i % 100 == 0:
            print(f"      {i}/{len(epci_to_communes)} EPCI ({time.time()-t0:.0f}s)...")

        communes = epci_to_communes[epci_code]
        ecoles = [e for c in communes for e in ecoles_par_depcom.get(c, [])]
        libepci = epci_libelles.get(epci_code, "?")

        # accumulateurs EPCI
        epci_pop_in = epci_pop_tot = 0.0
        epci_eq_in = epci_eq_tot = 0
        epci_n_carreaux = 0

        for ccode in communes:
            car_c = carreaux_par_depcom.get(ccode, [])
            eq_c = equipements_par_depcom.get(ccode, [])
            epci_n_carreaux += len(car_c)

            if ecoles:
                pop_in, pop_tot = _pop_in_buffer(car_c, ecoles, rayon_sq)
                eq_in, eq_tot = _count_in_buffer(eq_c, ecoles, rayon_sq)
            else:
                pop_in, pop_tot = 0.0, sum(ind for _, _, ind in car_c)
                eq_in, eq_tot = 0, len(eq_c)

            results_communes.append({
                "codgeo": ccode,
                "libgeo": commune_lib.get(ccode, "?"),
                "code_epci": epci_code,
                "n_ecoles_epci": len(ecoles),
                "n_equipements": eq_tot,
                "n_carreaux": len(car_c),
                "pop_insee": round(pop_tot),
                "pct_habitat_zone_ecole_15": _pct(pop_in, pop_tot) if ecoles else None,
                "pct_equipements_zone_ecole_15": _pct(eq_in, eq_tot) if ecoles else None,
            })

            epci_pop_in += pop_in
            epci_pop_tot += pop_tot
            epci_eq_in += eq_in
            epci_eq_tot += eq_tot

        results_epci.append({
            "code_epci": epci_code,
            "libepci": libepci,
            "n_communes": len(communes),
            "n_ecoles_c108": len(ecoles),
            "n_equipements": epci_eq_tot,
            "n_carreaux": epci_n_carreaux,
            "pop_insee": round(epci_pop_tot),
            "pct_habitat_zone_ecole_15": _pct(epci_pop_in, epci_pop_tot) if ecoles else None,
            "pct_equipements_zone_ecole_15": _pct(epci_eq_in, epci_eq_tot) if ecoles else None,
        })

    print(f"      Calcul total en {time.time()-t0:.1f}s")

    # Sorties CSV
    OUTPUT_COMMUNES.parent.mkdir(parents=True, exist_ok=True)
    fields_com = ["codgeo", "libgeo", "code_epci", "n_ecoles_epci", "n_equipements",
                  "n_carreaux", "pop_insee",
                  "pct_habitat_zone_ecole_15", "pct_equipements_zone_ecole_15"]
    with open(OUTPUT_COMMUNES, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields_com)
        w.writeheader()
        w.writerows(results_communes)
    print(f"\n✓ Écrit : {OUTPUT_COMMUNES}  ({len(results_communes):,} communes)".replace(",", " "))

    fields_epci = ["code_epci", "libepci", "n_communes", "n_ecoles_c108", "n_equipements",
                   "n_carreaux", "pop_insee",
                   "pct_habitat_zone_ecole_15", "pct_equipements_zone_ecole_15"]
    with open(OUTPUT_EPCI, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields_epci)
        w.writeheader()
        w.writerows(results_epci)
    print(f"✓ Écrit : {OUTPUT_EPCI}  ({len(results_epci):,} EPCI)".replace(",", " "))

    # Vérification sur les 5 EPCI pilotes + dispersion intra-EPCI
    temoins = {
        "241700434": "CA La Rochelle", "200067213": "CU Grand Reims",
        "245804406": "CA Nevers", "200067106": "CA Pays Basque",
        "200067932": "CA Vannes",
    }
    print(f"\n--- Vérification 5 EPCI pilotes (valeur EPCI + écart entre communes) ---")
    com_by_epci = defaultdict(list)
    for r in results_communes:
        com_by_epci[r["code_epci"]].append(r)
    for code, name in temoins.items():
        e = next((x for x in results_epci if x["code_epci"] == code), None)
        if not e:
            print(f"  {code} {name} : absent")
            continue
        habs = [c["pct_habitat_zone_ecole_15"] for c in com_by_epci.get(code, [])
                if c["pct_habitat_zone_ecole_15"] is not None]
        ecart = f"{min(habs):.0f}–{max(habs):.0f}%" if habs else "n/a"
        print(f"  {code} {name:<18} EPCI habitat={e['pct_habitat_zone_ecole_15']}%  "
              f"communes: {ecart} (n={len(habs)})")


if __name__ == "__main__":
    main()