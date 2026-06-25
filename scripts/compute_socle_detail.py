"""
compute_socle_detail.py — Détail du socle d'équipements, type par type.

Complète score_socle_communes.csv (qui ne donne que le score agrégé) en sortant,
pour chaque commune et chaque EPCI, la LISTE des types du socle réellement présents.
C'est ce qui permet d'afficher la "grille du socle" dans l'outil (mairie présente,
boulangerie absente, etc.) au lieu d'un simple pourcentage.

Méthode identique à compute_score_socle.py / precompute_cache.py : même socle de
31 types pondérés, même lecture de BPE24.csv, même rattachement commune → EPCI via
le pickle précalculé.

À placer dans le même dossier scripts/ que precompute_cache.py, puis :
    python scripts/compute_socle_detail.py

Sorties (dans backend/data/) :
    socle_detail_communes.csv   codgeo ; types_presents (codes séparés par des virgules)
    socle_detail_epci.csv       code_epci ; types_presents (union des communes)
    socle_catalogue.json        référentiel des 31 types (code -> libellé, famille, poids)
"""
import csv
import gzip
import json
import pickle
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BPE = ROOT / "data_brut" / "BPE24.csv"
PICKLE = ROOT / "backend" / "data" / "precomputed.pkl.gz"
OUT_COMMUNES = ROOT / "backend" / "data" / "socle_detail_communes.csv"
OUT_EPCI = ROOT / "backend" / "data" / "socle_detail_epci.csv"
OUT_CATALOGUE = ROOT / "backend" / "data" / "socle_catalogue.json"

# ── Socle des 31 équipements essentiels (code BPE -> libellé, famille, poids) ──
# Strictement identique au barème utilisé pour le score_socle.
SCORES = {
    # Services
    "A129": ("Mairie", "Services", 2.80),
    "A203": ("Banque", "Services", 1.40),
    "A206": ("Bureau de poste", "Services", 1.40),
    "A207": ("Relais poste", "Services", 2.10),
    "A208": ("Agence postale", "Services", 1.40),
    "A301": ("Réparation auto", "Services", 2.28),
    "A302": ("Contrôle technique", "Services", 0.57),
    # Commerce
    "B105": ("Supermarché", "Commerce", 4.20),
    "B201": ("Supérette", "Commerce", 4.20),
    "B202": ("Épicerie", "Commerce", 2.10),
    "B207": ("Boulangerie-Pâtisserie", "Commerce", 6.30),
    "B204": ("Boucherie", "Commerce", 6.30),
    "B321": ("Librairie-Papeterie", "Commerce", 1.40),
    "B313": ("Optique", "Commerce", 1.40),
    "B316": ("Station-service", "Commerce", 1.14),
    # Écoles
    "C107": ("École maternelle", "Écoles", 2.88),
    "C108": ("École élémentaire", "Écoles", 4.44),
    "C109": ("RPI école", "Écoles", 4.44),
    # Santé
    "D108": ("Centre de santé", "Santé", 8.40),
    "D113": ("Maison de santé", "Santé", 8.40),
    "D279": ("Médecin généraliste", "Santé", 8.40),
    "D307": ("Pharmacie", "Santé", 8.40),
    "D401": ("EHPAD (hébergement)", "Santé", 0.72),
    "D402": ("Soins à domicile (PA)", "Santé", 0.72),
    "D403": ("Aide à domicile (PA)", "Santé", 0.72),
    # Équipements collectifs
    "D502": ("Crèche / EAJE", "Équipements", 2.40),
    "F111": ("Terrain de jeux", "Équipements", 1.20),
    "F113": ("Grand terrain de jeux", "Équipements", 3.60),
    "F116": ("Salle non spécialisée", "Équipements", 1.20),
    "F121": ("Salle multisports", "Équipements", 1.20),
    "F307": ("Bibliothèque", "Équipements", 1.40),
}
TYPES_CODES = set(SCORES.keys())


def main():
    print(f"\n=== Détail du socle ({len(SCORES)} types) ===\n")

    # 1. Communes (codgeo -> epci) depuis le pickle
    print("[1/4] Chargement du pickle...")
    with gzip.open(PICKLE, "rb") as f:
        data = pickle.load(f)
    commune_to_epci = {
        code: (c.get("epci") or "")
        for code, c in data["communes"].items()
    }
    print(f"      {len(commune_to_epci):,} communes".replace(",", " "))

    # 2. Lecture BPE — set des types du socle présents par commune
    print(f"\n[2/4] Lecture {BPE.name}...")
    t0 = time.time()
    types_par_commune = {}
    with open(BPE, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f, delimiter=";", quotechar='"')
        for i, row in enumerate(reader, 1):
            if i % 500000 == 0:
                print(f"      {i:,} lignes ({time.time()-t0:.0f}s)...".replace(",", " "))
            depcom = (row.get("DEPCOM") or "").strip()
            if depcom.startswith("751") and len(depcom) == 5:
                depcom = "75056"
            elif depcom.startswith("6938"):
                depcom = "69123"
            elif depcom.startswith("132") and len(depcom) == 5:
                depcom = "13055"
            if not depcom:
                continue
            typequ = (row.get("TYPEQU") or "").strip()
            if typequ in TYPES_CODES:
                types_par_commune.setdefault(depcom, set()).add(typequ)
    print(f"      Lecture en {time.time()-t0:.1f}s")
    print(f"      {len(types_par_commune):,} communes avec au moins 1 équipement du socle"
          .replace(",", " "))

    # 3. Sortie commune (ordre des codes = ordre du barème, pour un affichage stable)
    print(f"\n[3/4] Écriture {OUT_COMMUNES.name}...")
    ordre = list(SCORES.keys())
    OUT_COMMUNES.parent.mkdir(parents=True, exist_ok=True)
    n_comm = 0
    with open(OUT_COMMUNES, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["codgeo", "types_presents"])
        for code in commune_to_epci:
            presents = types_par_commune.get(code, set())
            codes_tries = [c for c in ordre if c in presents]
            w.writerow([code, ",".join(codes_tries)])
            n_comm += 1
    print(f"      ✓ {n_comm:,} communes".replace(",", " "))

    # 4. Agrégation EPCI = union des types présents dans au moins une commune
    print(f"\n[4/4] Écriture {OUT_EPCI.name}...")
    union_par_epci = {}
    for code, presents in types_par_commune.items():
        epci = commune_to_epci.get(code) or ""
        if not epci:
            continue
        union_par_epci.setdefault(epci, set()).update(presents)
    with open(OUT_EPCI, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["code_epci", "types_presents"])
        for epci, presents in union_par_epci.items():
            codes_tries = [c for c in ordre if c in presents]
            w.writerow([epci, ",".join(codes_tries)])
    print(f"      ✓ {len(union_par_epci):,} EPCI".replace(",", " "))

    # Référentiel des 31 types pour le frontend (libellés + familles + poids)
    catalogue = [
        {"code": code, "libelle": lbl, "famille": fam, "poids": poids}
        for code, (lbl, fam, poids) in SCORES.items()
    ]
    with open(OUT_CATALOGUE, "w", encoding="utf-8") as f:
        json.dump(catalogue, f, ensure_ascii=False, indent=2)
    print(f"\n      ✓ Catalogue des {len(catalogue)} types -> {OUT_CATALOGUE.name}")

    print("\nTerminé.\n")


if __name__ == "__main__":
    main()
