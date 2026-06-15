"""
Calcul dispersion habitat / équipements pour TOUS les EPCI métropolitains.

Optimisation : BPE + carreaux lus UNE seule fois, puis 1261 calculs rapides.
Total estimé : 5-10 min.

Méthode validée sur 5 EPCI témoins :
  - Écoles : C108 (élémentaires) uniquement
  - Buffer : 1,5 km
  - Habitat : carreaux INSEE 200m Filosofi 2021
  - Équipements : BPE A+B+D+F
  - Calcul en EPSG:3035 (LAEA)

Sortie : backend/data/dispersion_epci.csv
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
OUTPUT = ROOT / "backend" / "data" / "dispersion_epci.csv"

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


def main():
    print("╔══════════════════════════════════════════════════════════════════╗")
    print("║  Calcul dispersion habitat / équipements — France entière       ║")
    print("║  Méthode : C108 + buffer 1.5km + carreaux 200m                   ║")
    print("╚══════════════════════════════════════════════════════════════════╝\n")

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

    # 1. Pickle : mapping commune ↔ EPCI
    print("[1/5] Chargement pickle...")
    with gzip.open(PICKLE, "rb") as f:
        data = pickle.load(f)
    commune_to_epci = {code: c.get("epci") for code, c in data["communes"].items() if c.get("epci")}
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

    # 2. BPE — extraire écoles et équipements, ranger par DEPCOM
    print(f"\n[2/5] Lecture BPE24.csv (1.4 Go)...")
    t0 = time.time()
    ecoles_raw = []      # (x, y, depcom)
    equipements_raw = [] # (x, y, depcom)
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
    print(f"      Lecture en {time.time()-t0:.1f}s")
    print(f"      {len(ecoles_raw):,} écoles C108, {len(equipements_raw):,} équipements"
          .replace(",", " "))

    # 3. Conversion Lambert93 → LAEA en batch
    print(f"\n[3/5] Conversion Lambert93 → LAEA (batch)...")
    t0 = time.time()
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
    print(f"      Conversion en {time.time()-t0:.1f}s")

    # 4. Carreaux — ranger par DEPCOM
    print(f"\n[4/5] Lecture carreaux_200m_met.csv (447 Mo)...")
    t0 = time.time()
    carreaux_par_depcom = defaultdict(list)
    with open(CARREAUX, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader, 1):
            if i % 1000000 == 0:
                print(f"      {i:,} carreaux ({time.time()-t0:.0f}s)...".replace(",", " "))
            lcog = (row.get("lcog_geo") or "").strip()
            # Si carreau à cheval, on prend la commune principale (1ère)
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
    n_carreaux = sum(len(v) for v in carreaux_par_depcom.values())
    print(f"      Lecture en {time.time()-t0:.1f}s")
    print(f"      {n_carreaux:,} carreaux".replace(",", " "))

    # 5. Boucle EPCI
    print(f"\n[5/5] Calcul dispersion sur {len(epci_to_communes):,} EPCI...".replace(",", " "))
    t0 = time.time()
    rayon_sq = RAYON_M ** 2
    results = []

    for i, epci_code in enumerate(sorted(epci_to_communes.keys()), 1):
        if i % 100 == 0:
            print(f"      {i}/{len(epci_to_communes)} EPCI ({time.time()-t0:.0f}s)...")

        communes = epci_to_communes[epci_code]
        ecoles = [e for c in communes for e in ecoles_par_depcom.get(c, [])]
        equipements = [e for c in communes for e in equipements_par_depcom.get(c, [])]
        carreaux = [k for c in communes for k in carreaux_par_depcom.get(c, [])]
        pop_total = sum(ind for _, _, ind in carreaux)

        result = {
            "code_epci": epci_code,
            "libepci": epci_libelles.get(epci_code, "?"),
            "n_communes": len(communes),
            "n_ecoles_c108": len(ecoles),
            "n_equipements": len(equipements),
            "n_carreaux": len(carreaux),
            "pop_insee": round(pop_total),
            "pct_habitat_zone_ecole_15": None,
            "pct_equipements_zone_ecole_15": None,
        }

        if not ecoles:
            results.append(result)
            continue

        # Habitat (carreaux dans buffer)
        if carreaux and pop_total > 0:
            pop_in = 0.0
            for cx, cy, ind in carreaux:
                for sx, sy in ecoles:
                    if (cx - sx) ** 2 + (cy - sy) ** 2 <= rayon_sq:
                        pop_in += ind
                        break
            result["pct_habitat_zone_ecole_15"] = round(100 * pop_in / pop_total, 2)

        # Équipements
        if equipements:
            eq_in = 0
            for ex, ey in equipements:
                for sx, sy in ecoles:
                    if (ex - sx) ** 2 + (ey - sy) ** 2 <= rayon_sq:
                        eq_in += 1
                        break
            result["pct_equipements_zone_ecole_15"] = round(100 * eq_in / len(equipements), 2)

        results.append(result)

    print(f"      Calcul total en {time.time()-t0:.1f}s")

    # Sortie CSV
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    fields = ["code_epci", "libepci", "n_communes", "n_ecoles_c108", "n_equipements",
              "n_carreaux", "pop_insee",
              "pct_habitat_zone_ecole_15", "pct_equipements_zone_ecole_15"]
    with open(OUTPUT, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for r in results:
            writer.writerow(r)
    print(f"\n✓ Écrit : {OUTPUT}")
    print(f"  Taille : {OUTPUT.stat().st_size / 1024:.1f} Ko")

    # Stats récap
    with_data = [r for r in results if r["pct_habitat_zone_ecole_15"] is not None]
    print(f"\n=== Stats ===")
    print(f"  {len(with_data)}/{len(results)} EPCI avec données complètes")
    if with_data:
        habs = sorted(r["pct_habitat_zone_ecole_15"] for r in with_data)
        eqs = sorted(r["pct_equipements_zone_ecole_15"] for r in with_data
                     if r["pct_equipements_zone_ecole_15"] is not None)
        print(f"  Habitat zone     : min {habs[0]:.1f}% | médiane {habs[len(habs)//2]:.1f}% | max {habs[-1]:.1f}%")
        print(f"  Équipements zone : min {eqs[0]:.1f}% | médiane {eqs[len(eqs)//2]:.1f}% | max {eqs[-1]:.1f}%")

    print(f"\n--- Top 5 plus DISPERSÉS (habitat le plus bas) ---")
    for r in sorted(with_data, key=lambda x: x["pct_habitat_zone_ecole_15"])[:5]:
        print(f"  {r['pct_habitat_zone_ecole_15']:5.1f}%  {r['libepci'][:55]:<55} ({r['n_communes']:>3} com)")
    print(f"\n--- Top 5 plus COMPACTS (habitat le plus haut) ---")
    for r in sorted(with_data, key=lambda x: x["pct_habitat_zone_ecole_15"])[-5:]:
        print(f"  {r['pct_habitat_zone_ecole_15']:5.1f}%  {r['libepci'][:55]:<55} ({r['n_communes']:>3} com)")

    # Vérification 5 EPCI témoins
    print(f"\n--- Vérification 5 EPCI témoins ---")
    temoins = {
        "241700434": "CA La Rochelle",
        "200067213": "CU Grand Reims",
        "245804406": "CA Nevers",
        "200067106": "CA Pays Basque",
        "200067932": "CA Vannes",
    }
    for code, name in temoins.items():
        r = next((x for x in results if x["code_epci"] == code), None)
        if r:
            h = r["pct_habitat_zone_ecole_15"]
            e = r["pct_equipements_zone_ecole_15"]
            print(f"  {code}  {name:<22}  Habitat {h}%   Équip {e}%")


if __name__ == "__main__":
    main()
