#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Construit backend/data/gares_epci.json : gares geolocalisees par EPCI,
depuis data_brut/BPE24.csv (equipements E107 / E108 / E109).
Reutilise commune_to_epci depuis backend/data/ecoles_epci.json (pas besoin du pickle).

Lancer depuis la racine du repo :
    python3 scripts/build_gares_epci.py
"""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BPE = ROOT / "data_brut" / "BPE24.csv"
ECOLES = ROOT / "backend" / "data" / "ecoles_epci.json"
OUT = ROOT / "backend" / "data" / "gares_epci.json"

GARE_TYPES = {"E107", "E108", "E109"}

if not BPE.exists():
    print(f"ERREUR : {BPE} introuvable. Mets BPE24.csv dans data_brut/ et relance.")
    sys.exit(1)
if not ECOLES.exists():
    print(f"ERREUR : {ECOLES} introuvable (besoin de commune_to_epci).")
    sys.exit(1)

c2e = json.loads(ECOLES.read_text(encoding="utf-8")).get("commune_to_epci", {})
if not c2e:
    print("ERREUR : commune_to_epci vide dans ecoles_epci.json.")
    sys.exit(1)


def pick(header, *cands):
    low = {h.lower(): h for h in header}
    for c in cands:
        if c.lower() in low:
            return low[c.lower()]
    return None


# Detection du separateur
with BPE.open(encoding="utf-8", errors="replace") as f:
    first = f.readline()
sep = ";" if first.count(";") >= first.count(",") else ","

epcis = {}
n_total = 0
n_kept = 0

with BPE.open(encoding="utf-8", errors="replace") as f:
    rdr = csv.DictReader(f, delimiter=sep)
    header = rdr.fieldnames or []
    col_typ = pick(header, "TYPEQU", "typequ")
    col_dep = pick(header, "DEPCOM", "depcom", "CODGEO", "codgeo")
    col_lon = pick(header, "LONGITUDE", "longitude", "lon")
    col_lat = pick(header, "LATITUDE", "latitude", "lat")
    col_lx = pick(header, "LAMBERT_X", "lambert_x")
    col_ly = pick(header, "LAMBERT_Y", "lambert_y")
    col_lib = pick(header, "LIBCOM", "libcom", "LIBGEO", "libgeo")
    col_nom = pick(header, "NOMRS", "nomrs", "NOM", "nom")

    if not col_typ or not col_dep:
        print("ERREUR : colonnes TYPEQU / DEPCOM introuvables. Colonnes vues :")
        print(header)
        sys.exit(1)

    conv = None
    use_lonlat = bool(col_lon and col_lat)
    if not use_lonlat:
        if col_lx and col_ly:
            try:
                from pyproj import Transformer
                conv = Transformer.from_crs("EPSG:2154", "EPSG:4326", always_xy=True)
            except ImportError:
                print("ERREUR : pas de LONGITUDE/LATITUDE et pyproj manquant pour convertir le Lambert.")
                print("Installe pyproj :  pip install pyproj --break-system-packages   puis relance.")
                sys.exit(1)
        else:
            print("ERREUR : aucune colonne de coordonnees exploitable. Colonnes vues :")
            print(header)
            sys.exit(1)

    for row in rdr:
        if (row.get(col_typ) or "").strip() not in GARE_TYPES:
            continue
        n_total += 1
        dep = (row.get(col_dep) or "").strip()
        epci = c2e.get(dep)
        if not epci:
            continue  # gare hors des EPCI pilotes -> ignoree
        try:
            if use_lonlat:
                lon = float((row.get(col_lon) or "").replace(",", "."))
                lat = float((row.get(col_lat) or "").replace(",", "."))
            else:
                x = float((row.get(col_lx) or "").replace(",", "."))
                y = float((row.get(col_ly) or "").replace(",", "."))
                lon, lat = conv.transform(x, y)
        except (ValueError, TypeError):
            continue
        epcis.setdefault(epci, []).append({
            "lon": round(lon, 6),
            "lat": round(lat, 6),
            "libcom": (row.get(col_lib) or "").strip() if col_lib else "",
            "nom": (row.get(col_nom) or "").strip() if col_nom else "",
        })
        n_kept += 1

OUT.write_text(json.dumps({"epcis": epcis, "commune_to_epci": c2e}, ensure_ascii=False), encoding="utf-8")

print(f"Coordonnees lues via : {'LONGITUDE/LATITUDE' if use_lonlat else 'LAMBERT_X/Y -> WGS84'}")
print(f"Gares E107/E108/E109 dans la BPE : {n_total}")
print(f"Gares gardees (dans les 5 EPCI pilotes) : {n_kept}")
print("Detail par EPCI :")
for k, v in sorted(epcis.items()):
    print(f"  {k} : {len(v)} gares")
print(f"\nEcrit : {OUT}")
