"""
Convertit un CSV INSEE Filosofi historique (2017, 2019) en mini-CSV léger
pour la sparkline revenu d'Empreintes.

Sources :
  - 2019 : https://www.insee.fr/fr/statistiques/fichier/6036902/base-cc-filosofi-2019_CSV.zip
  - 2017 : https://www.insee.fr/fr/statistiques/fichier/4507225/base-cc-filosofi-2017_CSV.zip

Le CSV brut contient tous les niveaux géographiques (régions, départements, EPCI,
communes...). On filtre les codes commune (5 chiffres) et EPCI (9 chiffres) et on
extrait juste CODGEO + revenu médian (€/UC).

Usage :
  python -m scripts.convert_filosofi_history /chemin/cc_filosofi.csv ANNEE
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path


def detect_med_col(fieldnames, year):
    """Trouve la colonne médiane (MED20, MED18, MEDIANE, etc.) selon l'année.

    Convention INSEE : 'MEDYY' où YY = millésime fiscal-2 (ex: MED19 pour Filosofi 2019).
    """
    year_short = str(year)[2:]
    yy_minus_2 = str(year - 2)[2:]
    candidates = [
        f"MED{year_short}",
        f"MED{int(year_short):02d}",
        f"MEDIANE_NV{year_short}",
        f"MED{yy_minus_2}",  # parfois utilise YY-2
        "MED",
        "MEDIANE",
    ]
    for c in candidates:
        if c in fieldnames:
            return c
    # Fallback : 1ère colonne qui commence par MED
    for fn in fieldnames:
        if fn and fn.upper().startswith("MED"):
            return fn
    return None


def detect_delim(path: Path) -> str:
    with open(path, "r", encoding="utf-8") as f:
        first = f.readline()
    return ";" if first.count(";") > first.count(",") else ","


def main():
    if len(sys.argv) < 3:
        sys.exit("Usage : python -m scripts.convert_filosofi_history <chemin_csv> <année>")
    src = Path(sys.argv[1])
    year = int(sys.argv[2])
    if not src.exists():
        sys.exit(f"[err] Fichier introuvable : {src}")

    out = Path(__file__).resolve().parent.parent / "backend" / "data" / f"filosofi_revenu_{year}.csv"
    out.parent.mkdir(parents=True, exist_ok=True)

    delim = detect_delim(src)
    print(f"Lecture {src.name} (séparateur '{delim}')...")

    with open(src, "r", encoding="utf-8") as f_in, \
         open(out, "w", encoding="utf-8", newline="") as f_out:
        reader = csv.DictReader(f_in, delimiter=delim)
        med_col = detect_med_col(reader.fieldnames, year)
        if not med_col:
            print(f"[err] Colonne médiane introuvable.")
            print(f"      Colonnes disponibles : {reader.fieldnames[:20]}")
            sys.exit(1)
        print(f"  Colonne médiane détectée : {med_col}")

        writer = csv.writer(f_out)
        writer.writerow(["CODGEO", f"revenu_median_{year}"])

        count_com = 0
        count_epci = 0
        for row in reader:
            codgeo = (row.get("CODGEO") or row.get("Code") or row.get("CODE") or "").strip()
            if not codgeo:
                continue
            # Filtre : 5 chiffres (commune) ou 9 chiffres (EPCI)
            if not codgeo.isdigit() and not (len(codgeo) == 5 and codgeo[0].isalpha()):
                continue
            if len(codgeo) == 5:
                count_com += 1
            elif len(codgeo) == 9:
                count_epci += 1
            else:
                continue

            raw_val = (row.get(med_col) or "").strip().replace(",", ".").replace(" ", "")
            if not raw_val or raw_val.lower() in ("nd", "na", "n/a", "s", ""):
                writer.writerow([codgeo, ""])
                continue
            try:
                val = float(raw_val)
            except ValueError:
                writer.writerow([codgeo, ""])
                continue
            writer.writerow([codgeo, val])

    print(f"  {count_com:,} communes + {count_epci:,} EPCI écrits".replace(",", " "))
    print(f"  Sortie : {out}")
    print(f"  Taille : {out.stat().st_size / 1024:.1f} Ko")


if __name__ == "__main__":
    main()
