"""
Convertit le CSV INSEE "Évolution et structure de la population 2021"
en un mini-CSV léger pour Empreintes.

Source : https://www.insee.fr/fr/statistiques/8201904
Fichier d'entrée : base-cc-evol-struct-pop-2021.CSV (~250 Mo, ~200 colonnes)
Sortie : backend/data/age_communes.csv (~1.5 Mo, 9 colonnes)

Garde uniquement les tranches d'âge 2021 utiles :
  CODGEO + P21_POP + 7 tranches d'âge en 15 ans (0-14, 15-29, ..., 90+)

Usage en ligne de commande :
  python -m scripts.convert_age_to_csv /chemin/vers/base-cc-evol-struct-pop-2021.CSV
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path


COLS_KEEP = [
    "CODGEO",
    "P21_POP",
    "P21_POP0014",
    "P21_POP1529",
    "P21_POP3044",
    "P21_POP4559",
    "P21_POP6074",
    "P21_POP7589",
    "P21_POP90P",
]


def detect_delimiter(path: Path) -> str:
    """Lit la première ligne et devine le séparateur (',' ou ';')."""
    with open(path, "r", encoding="utf-8") as f:
        first = f.readline()
    if first.count(";") > first.count(","):
        return ";"
    return ","


def main():
    if len(sys.argv) < 2:
        sys.exit("Usage : python -m scripts.convert_age_to_csv <chemin_csv_insee>")

    src = Path(sys.argv[1])
    if not src.exists():
        sys.exit(f"[err] Fichier introuvable : {src}")

    out = Path(__file__).resolve().parent.parent / "backend" / "data" / "age_communes.csv"
    out.parent.mkdir(parents=True, exist_ok=True)

    delim = detect_delimiter(src)
    print(f"Lecture {src.name} (séparateur '{delim}')...")

    with open(src, "r", encoding="utf-8") as f_in, \
         open(out, "w", encoding="utf-8", newline="") as f_out:
        reader = csv.DictReader(f_in, delimiter=delim)

        # Vérifie que les colonnes attendues sont là
        missing = [c for c in COLS_KEEP if c not in reader.fieldnames]
        if missing:
            sys.exit(f"[err] Colonnes manquantes dans le CSV INSEE : {missing}")

        writer = csv.DictWriter(f_out, fieldnames=COLS_KEEP)
        writer.writeheader()

        count = 0
        for row in reader:
            writer.writerow({k: row.get(k, "") for k in COLS_KEEP})
            count += 1

    print(f"  {count:,} communes écrites".replace(",", " "))
    print(f"  Sortie : {out}")
    print(f"  Taille : {out.stat().st_size / 1024 / 1024:.2f} Mo")


if __name__ == "__main__":
    main()
