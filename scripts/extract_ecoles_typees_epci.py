"""
extract_ecoles_typees_epci.py — Regenere ecoles_epci.json avec les 5 niveaux.
Lit la BPE geolocalisee, range les ecoles par EPCI, tagge chaque point avec son
niveau (creche/maternelle/elementaire/college/lycee). Coordonnees WGS84 directes.

Codes BPE 2024 :
  D502 creche | C107 maternelle | C108+C109 elementaire | C201 college |
  C301+C302+C303 lycee
"""
import csv
import gzip
import json
import pickle
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PICKLE = ROOT / "backend" / "data" / "precomputed.pkl.gz"
BPE = ROOT / "data_brut" / "BPE24.csv"
OUTPUT = ROOT / "backend" / "data" / "ecoles_epci.json"

NIVEAUX = {
    "D502": "creche",
    "C107": "maternelle",
    "C108": "elementaire",
    "C109": "elementaire",
    "C201": "college",
    "C301": "lycee",
    "C302": "lycee",
    "C303": "lycee",
    "C501": "universite",
    "C502": "universite",
}


def parse_num(s):
    if not s:
        return None
    try:
        return float(s.replace(",", ".").strip())
    except (ValueError, AttributeError):
        return None


def sniff_delim(path):
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        head = f.readline()
    return ";" if head.count(";") >= head.count(",") else ","


def main():
    print("\n=== Extraction ecoles typees par EPCI (5 niveaux) ===\n")
    for p, label in [(BPE, "BPE24.csv"), (PICKLE, "pickle")]:
        if not p.exists():
            sys.exit(f"[err] {label} introuvable : {p}")

    print("[1/3] Pickle...")
    with gzip.open(PICKLE, "rb") as f:
        data = pickle.load(f)
    commune_to_epci = {code: c.get("epci") for code, c in data["communes"].items() if c.get("epci")}
    print(f"      {len(commune_to_epci)} communes rattachees a un EPCI")

    print("\n[2/3] BPE24.csv...")
    delim = sniff_delim(BPE)
    print(f"      separateur detecte : {delim}")
    epcis = defaultdict(list)
    par_niveau = defaultdict(int)
    sans_coord = 0
    with open(BPE, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f, delimiter=delim, quotechar='"')
        for i, row in enumerate(reader, 1):
            if i % 500000 == 0:
                print(f"      {i} lignes...")
            typequ = (row.get("TYPEQU") or "").strip()
            niveau = NIVEAUX.get(typequ)
            if not niveau:
                continue
            depcom = (row.get("DEPCOM") or "").strip()
            epci = commune_to_epci.get(depcom)
            if not epci:
                continue
            lon = parse_num(row.get("LONGITUDE"))
            lat = parse_num(row.get("LATITUDE"))
            if lon is None or lat is None:
                sans_coord += 1
                continue
            epcis[epci].append({
                "lon": round(lon, 6),
                "lat": round(lat, 6),
                "libcom": (row.get("LIBCOM") or "").strip(),
                "nom": (row.get("NOMRS") or "").strip(),
                "niveau": niveau,
            })
            par_niveau[niveau] += 1

    total = sum(par_niveau.values())
    print(f"      {total} ecoles retenues ({sans_coord} sans coordonnees, ignorees)")

    print("\n[3/3] Ecriture ecoles_epci.json...")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {"epcis": dict(epcis), "commune_to_epci": commune_to_epci}
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    taille = OUTPUT.stat().st_size / (1024 * 1024)
    print(f"      ok {OUTPUT}  ({taille:.1f} Mo)")

    print("\n[controle par niveau]")
    for niv in ("creche", "maternelle", "elementaire", "college", "lycee"):
        print(f"   {niv:12} {par_niveau.get(niv, 0)}")

    LR = "241700434"
    ecoles_lr = epcis.get(LR, [])
    detail = defaultdict(int)
    for e in ecoles_lr:
        detail[e["niveau"]] += 1
    print(f"\n[controle La Rochelle {LR}] {len(ecoles_lr)} ecoles : "
          + ", ".join(f"{k} {v}" for k, v in sorted(detail.items())))
    print()


if __name__ == "__main__":
    main()
