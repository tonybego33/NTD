"""
Extrait les écoles élémentaires (C108) de la BPE 2024 et les groupe par EPCI.

Sortie : backend/data/ecoles_epci.json
  {
    "<code_epci>": [
      {"lon": -1.158, "lat": 46.158, "libcom": "La Rochelle", "nom": "ECOLE..."},
      ...
    ]
  }

Usage : python scripts/extract_ecoles_epci.py
"""
import csv
import gzip
import json
import pickle
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BPE = ROOT / "data_brut" / "BPE24.csv"
PICKLE = ROOT / "backend" / "data" / "precomputed.pkl.gz"
OUTPUT = ROOT / "backend" / "data" / "ecoles_epci.json"

CODES_ECOLE = {"C108", "C109"}  # élémentaire + RPI


def main():
    print("[1/3] Chargement pickle (mapping commune → EPCI)...")
    with gzip.open(PICKLE, "rb") as f:
        data = pickle.load(f)
    commune_to_epci = {
        code: c.get("epci") for code, c in data["communes"].items()
        if c.get("epci")
    }
    # Mapping arrondissements
    arr_map = {}
    for d in range(1, 21):
        arr_map[f"751{d:02d}"] = "75056"
    for d in range(81, 90):
        arr_map[f"693{d}"] = "69123"
    for d in range(1, 17):
        arr_map[f"132{d:02d}"] = "13055"

    print(f"      {len(commune_to_epci):,} communes avec EPCI"
          .replace(",", " "))

    print(f"\n[2/3] Lecture BPE24.csv (écoles élémentaires C108 + RPI C109)...")
    t0 = time.time()
    ecoles_par_epci = {}
    n_lignes = 0
    n_ecoles = 0
    n_geoloc_ko = 0

    with open(BPE, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f, delimiter=";", quotechar='"')
        for row in reader:
            n_lignes += 1
            if n_lignes % 500000 == 0:
                print(f"      {n_lignes:,} lignes ({time.time()-t0:.0f}s)..."
                      .replace(",", " "))
            typequ = (row.get("TYPEQU") or "").strip()
            if typequ not in CODES_ECOLE:
                continue
            n_ecoles += 1
            # Coordonnées
            try:
                lon = float((row.get("LONGITUDE") or "").replace(",", "."))
                lat = float((row.get("LATITUDE") or "").replace(",", "."))
            except (ValueError, TypeError):
                n_geoloc_ko += 1
                continue
            # EPCI via mapping commune (gestion arrondissements)
            depcom = (row.get("DEPCOM") or "").strip()
            depcom = arr_map.get(depcom, depcom)
            epci = commune_to_epci.get(depcom)
            if not epci:
                continue
            ecoles_par_epci.setdefault(epci, []).append({
                "lon": round(lon, 5),
                "lat": round(lat, 5),
                "libcom": (row.get("LIBCOM") or "").strip(),
                "nom": (row.get("NOMRS") or "").strip(),
            })

    print(f"      Lecture en {time.time()-t0:.1f}s")
    print(f"      {n_ecoles:,} écoles trouvées".replace(",", " "))
    print(f"      {n_geoloc_ko:,} écoles sans coordonnées (ignorées)"
          .replace(",", " "))
    print(f"      {len(ecoles_par_epci):,} EPCI ont au moins une école"
          .replace(",", " "))

    print(f"\n[3/3] Écriture du JSON...")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(ecoles_par_epci, f, ensure_ascii=False, separators=(",", ":"))
    print(f"      ✓ {OUTPUT}")
    print(f"      Taille : {OUTPUT.stat().st_size / 1024:.1f} Ko")

    # Stats récap
    counts = sorted([(len(v), k) for k, v in ecoles_par_epci.items()],
                    reverse=True)
    print(f"\n      Top 5 EPCI par nombre d'écoles :")
    for n, code in counts[:5]:
        nom = data["epcis"].get(code, {}).get("libepci", "?")
        print(f"        {code} {nom[:45]:<45} {n:>5} écoles")

    # 5 EPCI témoins
    print(f"\n      EPCI témoins :")
    for code in ["241700434", "200067213", "200067106", "245804406", "200067932"]:
        n = len(ecoles_par_epci.get(code, []))
        nom = data["epcis"].get(code, {}).get("libepci", "?")
        print(f"        {code} {nom[:40]:<40} {n:>4} écoles")


if __name__ == "__main__":
    main()
