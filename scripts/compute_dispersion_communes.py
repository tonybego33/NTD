"""
compute_dispersion_communes.py — Dispersion habitat/équipements PAR COMMUNE.

Version commune du calcul "à moins de 1,5 km d'une centralité", calquée sur le
script EPCI (convert_filosofi_communes.py) qui, lui, est correct. Corrige le bug
de la version précédente où toutes les communes sortaient à 0 % : les écoles
étaient comparées aux carreaux dans deux systèmes de coordonnées différents.

Ici TOUT est en EPSG:3035 (LAEA) :
  - écoles/équipements : Lambert-93 (LAMBERT_X/Y) -> converti en LAEA
  - carreaux 200 m : déjà en LAEA, lus via l'identifiant idcar

Deux choix importants :
  1. Ancrages élargis (demande Tony) : on ne se limite plus à l'élémentaire.
     ANCRAGES = maternelle (C107) + élémentaire (C108) + RPI (C109) + crèche (D502).
     C'est l'ensemble des points de centralité "petite enfance / école".
  2. Effet de bord : pour une commune, on teste ses carreaux contre TOUTES les
     écoles de son EPCI, pas seulement les siennes. Un habitant proche d'une école
     de la commune voisine compte bien (les cercles de 1,5 km débordent les limites).

Entrées (dans data_brut/) :
    BPE24.csv, carreaux_200m_met.csv  +  backend/data/precomputed.pkl.gz
Sortie :
    backend/data/dispersion_communes.csv
    (même schéma de colonnes que l'ancien fichier, pour ne rien casser en aval)

À lancer après avoir les gros fichiers en place, puis reconstruire le pickle.
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
OUTPUT = ROOT / "backend" / "data" / "dispersion_communes.csv"

RAYON_M = 1500

# Ancrages de centralité : maternelle, élémentaire, RPI, crèche.
# (Avant : {"C108"} seulement. Élargi à la demande pour intégrer petite enfance.)
ANCRAGES = {"C107", "C108", "C109", "D502"}

# Équipements du quotidien (identique au script EPCI)
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
    # idcar 200 m INSEE en EPSG:3035 ; +100 pour viser le centre de la maille
    m = IDCAR_RE.search(idcar or "")
    if not m:
        return None, None
    return int(m.group(2)) + 100, int(m.group(1)) + 100


def sniff_delim(path):
    # Les CSV INSEE sont tantôt en ';' tantôt en ',' : on détecte sur l'en-tête
    # pour ne pas lire 0 ligne en silence (ce qui redonnerait des 0 %).
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        head = f.readline()
    return ";" if head.count(";") >= head.count(",") else ","


def main():
    print("\n=== Dispersion PAR COMMUNE (CRS corrigé, ancrages élargis) ===\n")
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

    # 1. Pickle : commune <-> EPCI
    print("[1/5] Pickle...")
    with gzip.open(PICKLE, "rb") as f:
        data = pickle.load(f)
    commune_to_epci = {code: c.get("epci") for code, c in data["communes"].items() if c.get("epci")}
    commune_lib = {code: c.get("libgeo", "?") for code, c in data["communes"].items()}
    epci_to_communes = defaultdict(list)
    for code, epci in commune_to_epci.items():
        epci_to_communes[epci].append(code)
    print(f"      {len(commune_to_epci):,} communes / {len(epci_to_communes):,} EPCI".replace(",", " "))

    # 2. BPE : ancrages + équipements, en Lambert-93
    print(f"\n[2/5] BPE24.csv...")
    t0 = time.time()
    ancrages_raw, equip_raw = [], []
    delim_bpe = sniff_delim(BPE)
    print(f"      (séparateur BPE détecté : « {delim_bpe} »)")
    with open(BPE, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f, delimiter=delim_bpe, quotechar='"')
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
            if typequ in ANCRAGES:
                ancrages_raw.append((x, y, depcom))
            if typequ in EQUIPEMENTS_QUOTIDIEN:
                equip_raw.append((x, y, depcom))
    print(f"      {len(ancrages_raw):,} ancrages, {len(equip_raw):,} équipements".replace(",", " "))

    # 3. Lambert-93 -> LAEA (batch), rangé par commune
    print(f"\n[3/5] Conversion Lambert93 -> LAEA...")
    ancrages_par_com, equip_par_com = defaultdict(list), defaultdict(list)
    if ancrages_raw:
        ax, ay, ad = zip(*ancrages_raw)
        ax2, ay2 = to_laea.transform(ax, ay)
        for x, y, d in zip(ax2, ay2, ad):
            ancrages_par_com[d].append((x, y))
    if equip_raw:
        qx, qy, qd = zip(*equip_raw)
        qx2, qy2 = to_laea.transform(qx, qy)
        for x, y, d in zip(qx2, qy2, qd):
            equip_par_com[d].append((x, y))

    # Pool des ancrages par EPCI (pour gérer les effets de bord entre communes)
    ancrages_par_epci = defaultdict(list)
    for com, pts in ancrages_par_com.items():
        ancrages_par_epci[commune_to_epci[com]].extend(pts)

    # 4. Carreaux 200 m (déjà LAEA), rangés par commune
    print(f"\n[4/5] carreaux_200m_met.csv...")
    t0 = time.time()
    carreaux_par_com = defaultdict(list)
    delim_car = sniff_delim(CARREAUX)
    print(f"      (séparateur carreaux détecté : « {delim_car} »)")
    with open(CARREAUX, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter=delim_car)
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
            carreaux_par_com[depcom].append((x, y, ind))

    # 5. Calcul PAR COMMUNE (carreaux de la commune vs écoles de tout l'EPCI)
    print(f"\n[5/5] Calcul sur {len(commune_to_epci):,} communes...".replace(",", " "))
    t0 = time.time()
    rayon_sq = RAYON_M ** 2
    results = []
    for j, (com, epci) in enumerate(sorted(commune_to_epci.items()), 1):
        if j % 5000 == 0:
            print(f"      {j}/{len(commune_to_epci)} ({time.time()-t0:.0f}s)...")
        ecoles = ancrages_par_epci.get(epci, [])
        carreaux = carreaux_par_com.get(com, [])
        equipements = equip_par_com.get(com, [])
        pop_total = sum(ind for _, _, ind in carreaux)

        pct_hab = None
        pct_eq = None
        if ecoles and carreaux and pop_total > 0:
            pop_in = 0.0
            for cx, cy, ind in carreaux:
                for sx, sy in ecoles:
                    if (cx - sx) ** 2 + (cy - sy) ** 2 <= rayon_sq:
                        pop_in += ind
                        break
            pct_hab = round(100 * pop_in / pop_total, 2)
        if ecoles and equipements:
            eq_in = 0
            for ex, ey in equipements:
                for sx, sy in ecoles:
                    if (ex - sx) ** 2 + (ey - sy) ** 2 <= rayon_sq:
                        eq_in += 1
                        break
            pct_eq = round(100 * eq_in / len(equipements), 2)

        results.append({
            "codgeo": com,
            "libgeo": commune_lib.get(com, "?"),
            "code_epci": epci,
            "n_ecoles_c108": len(ancrages_par_com.get(com, [])),
            "n_equipements": len(equipements),
            "n_carreaux": len(carreaux),
            "pop_insee": round(pop_total),
            "pct_habitat_zone_ecole_15": pct_hab,
            "pct_equipements_zone_ecole_15": pct_eq,
        })
    print(f"      Calcul en {time.time()-t0:.0f}s")

    fields = ["codgeo", "libgeo", "code_epci", "n_ecoles_c108", "n_equipements",
              "n_carreaux", "pop_insee", "pct_habitat_zone_ecole_15", "pct_equipements_zone_ecole_15"]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in results:
            w.writerow(r)
    print(f"\n✓ Écrit : {OUTPUT}")

    # Contrôle : Imphy (58134) doit sortir un chiffre élevé, pas 0
    imphy = next((r for r in results if r["codgeo"] == "58134"), None)
    if imphy:
        print(f"\n[contrôle Imphy 58134] habitat={imphy['pct_habitat_zone_ecole_15']}% "
              f"équip={imphy['pct_equipements_zone_ecole_15']}% "
              f"(ancrages={imphy['n_ecoles_c108']}, carreaux={imphy['n_carreaux']})")
    with_data = [r for r in results if r["pct_habitat_zone_ecole_15"] is not None]
    if with_data:
        habs = sorted(r["pct_habitat_zone_ecole_15"] for r in with_data)
        print(f"[stats] {len(with_data)} communes calculées | "
              f"habitat min {habs[0]:.0f}% médiane {habs[len(habs)//2]:.0f}% max {habs[-1]:.0f}%")
    print()


if __name__ == "__main__":
    main()
