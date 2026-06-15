"""
Pré-calcul du cache pour le backend GT BDDe.

Génère backend/data/precomputed.pkl.gz à partir des CSV bruts :
  - backend/data/indicateurs_export.csv
  - backend/data/bpe_communes.csv
  - backend/data/filosofi_communes.csv
  - backend/data/filosofi_epci.csv

Ce pickle contient TOUT ce dont les services ont besoin pour répondre vite :
  - une fiche complète par commune (valeurs brutes + indicateurs dérivés + BPE + Filosofi)
  - une fiche complète par EPCI (agrégats déjà calculés)
  - les quantiles par groupe typologique pour le scoring
  - les listes triées par groupe pour le calcul de rang percentile

À lancer :
  - en local (Codespaces)  : python -m scripts.precompute_cache
  - sur Render             : à ajouter en fin de Build Command (voir README)

Fait également deux choses utiles :
  - écrit un fichier précomputed.pkl.gz compressé (~5 Mo attendu)
  - imprime un récap : nb communes, nb EPCI, taille du pickle, top 5 indicateurs en couverture
"""
from __future__ import annotations

import csv
import gzip
import pickle
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "backend" / "data"

CSV_INDICATEURS = DATA_DIR / "indicateurs_export.csv"
CSV_BPE = DATA_DIR / "bpe_communes.csv"
CSV_FILOSOFI_COMMUNES = DATA_DIR / "filosofi_communes.csv"
CSV_FILOSOFI_EPCI = DATA_DIR / "filosofi_epci.csv"
CSV_AGE_COMMUNES = DATA_DIR / "age_communes.csv"
CSV_REVENU_2017 = DATA_DIR / "filosofi_revenu_2017.csv"
CSV_REVENU_2019 = DATA_DIR / "filosofi_revenu_2019.csv"
CSV_DISPERSION = DATA_DIR / "dispersion_epci.csv"
CSV_SCORE_SOCLE = DATA_DIR / "score_socle_communes.csv"
CSV_SCORE_SOCLE_EPCI = DATA_DIR / "score_socle_epci.csv"
CSV_MOBILITE = DATA_DIR / "mobilite_communes.csv"
CSV_ASSOCIATIONS = DATA_DIR / "associations_communes.csv"
CSV_EQUIP_PANIER = DATA_DIR / "equip_panier_communes.csv"
CSV_EQUIP_PANIER_EPCI = DATA_DIR / "equip_panier_epci.csv"
CSV_GARES = DATA_DIR / "gares_communes.csv"
CSV_GARES_EPCI = DATA_DIR / "gares_epci.csv"
CSV_SOLAIRE_EPCI = DATA_DIR / "solaire_epci.csv"
OUT_PICKLE = DATA_DIR / "precomputed.pkl.gz"


# ===========================================================================
# Constantes méthodo (alignées sur scoring.py actuel)
# ===========================================================================
TYPOLOGIE_GROUPES = {
    "grand_pole":     [111, 112],
    "moyen_pole":     [211, 212, 221, 222],
    "multipol":       [120, 300],
    "hors_influence": [400],
}

INDICATEURS_A_QUANTIFIER = [
    "nb_install_par_1000hab",
    "variete_equip",
    "densite_equip_1000hab",
    "part_voiture",
    "taux_double_motorisation",
    "densite_assos_1000hab",
    "densite_brute",
    "tcam_pop",
    "ratio_60p_30m",
    "part_30_44",
    "artif_par_hab",
    "part_art_habitat",
    "dens_popclc",
    "ges_total_par_hab",
    "ges_transport_par_hab",
    "conso_energie_par_hab",
    "bpe_total_par_10k",
    "bpe_commerces_par_10k",
    "bpe_sante_par_10k",
    "bpe_enseignement_par_10k",
    "bpe_sport_culture_par_10k",
    "part_actifs",
    "revenu_median",
    "taux_pauvrete",
    "rapport_interdecile",
    "part_imposes",
]

# Colonnes lues telles quelles depuis indicateurs_export.csv (numériques)
COLS_NUM_INDIC = [
    "P21_POP", "P15_POP", "SURFM2", "SURFHA", "SURFKM2",
    "TOTALCLC11", "TOTALCLC11a13",
    "naf09art23", "art09hab23", "art09inc23", "PartArtHabitat", "art15naf21",
    "GES_tot_HorsTransp", "GES_agri", "CO2_BIOMASSE", "DECHETS", "ENERGIE",
    "INDUSTRIE", "RESID", "ROUTE", "TERTIAIRE",
    "Gaz", "Electricité", "TOTAL_FLUX",
    "P21_ACTOCC1564",
    "02a_DENS_POP", "02b_DENS_POPCLC", "03_ART_POPSUP", "04_GES_POP", "05_ENERGIE_POP",
]

BPE_DOMAINES = ["services", "commerces", "enseignement", "sante",
                "transport", "sport_culture", "tourisme"]

# Tranches d'âge INSEE Recensement 2021 (par 15 ans)
COLS_AGE = ["P21_POP0014", "P21_POP1529", "P21_POP3044", "P21_POP4559",
            "P21_POP6074", "P21_POP7589", "P21_POP90P"]

COLS_FILOSOFI = ["revenu_median", "taux_pauvrete", "rapport_interdecile",
                 "decile1", "decile9", "part_imposes", "nb_menages",
                 "nb_personnes", "part_rev_activite", "part_salaires",
                 "part_chomage", "part_non_salaries", "part_retraites",
                 "part_patrimoine", "part_presta_sociales",
                 "part_presta_familiales", "part_presta_logement",
                 "part_minima_sociaux", "part_impots"]


# ===========================================================================
# Helpers
# ===========================================================================
def to_float(v) -> Optional[float]:
    if v is None or v == "" or v == "s" or v == "nd":
        return None
    try:
        return float(str(v).replace(",", ".").replace(" ", ""))
    except (TypeError, ValueError):
        return None


def get_groupe_typo(cataeu) -> str:
    if cataeu is None or cataeu == "":
        return "hors_influence"
    try:
        code = int(float(str(cataeu)))
    except (ValueError, TypeError):
        return "hors_influence"
    for groupe, codes in TYPOLOGIE_GROUPES.items():
        if code in codes:
            return groupe
    return "hors_influence"


def safe_div(num: Optional[float], den: Optional[float]) -> Optional[float]:
    if num is None or den is None or den == 0:
        return None
    return num / den


def tcam(p1: Optional[float], p0: Optional[float], n_years: float) -> Optional[float]:
    """
    Taux de croissance annuel moyen (en %) entre p0 et p1 sur n_years années.
    Formule : ((p1/p0)^(1/n_years) - 1) * 100
    """
    if p1 is None or p0 is None or p0 <= 0 or n_years <= 0:
        return None
    try:
        return ((p1 / p0) ** (1.0 / n_years) - 1.0) * 100.0
    except (ValueError, ZeroDivisionError):
        return None


def _sum_none_safe(*vals) -> Optional[float]:
    """Somme en ignorant les None ; renvoie None si tous sont None."""
    filtered = [v for v in vals if v is not None]
    if not filtered:
        return None
    return sum(filtered)


# ===========================================================================
# Étape 1 : lecture du CSV principal
# ===========================================================================
def load_communes() -> dict:
    if not CSV_INDICATEURS.exists():
        sys.exit(f"[err] CSV manquant : {CSV_INDICATEURS}")

    print(f"[1/5] Lecture {CSV_INDICATEURS.name}...")
    communes = {}
    with open(CSV_INDICATEURS, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            codgeo = (row.get("CODGEO") or "").strip()
            if not codgeo:
                continue
            entry = {
                "code": codgeo,
                "libgeo": row.get("LIBGEO", ""),
                "epci": (row.get("EPCI") or "").strip(),
                "libepci": row.get("LIBEPCI", ""),
                "dep": row.get("DEP", ""),
                "cataeu": row.get("CATAEU2010", ""),
                "groupe_typo": get_groupe_typo(row.get("CATAEU2010")),
            }
            for col in COLS_NUM_INDIC:
                entry[col] = to_float(row.get(col))
            communes[codgeo] = entry
    print(f"      {len(communes):,} communes chargées".replace(",", " "))
    return communes


def enrich_bpe(communes: dict) -> None:
    if not CSV_BPE.exists():
        print(f"[2/5] {CSV_BPE.name} absent, BPE ignorée.")
        return
    print(f"[2/5] Lecture {CSV_BPE.name}...")
    count = 0
    with open(CSV_BPE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            codgeo = (row.get("CODGEO") or "").strip()
            if codgeo not in communes:
                continue
            comm = communes[codgeo]
            tot = 0
            for d in BPE_DOMAINES:
                try:
                    val = int(row.get(d, 0) or 0)
                except (TypeError, ValueError):
                    val = 0
                comm[f"bpe_{d}"] = val
                tot += val
            try:
                comm["bpe_total"] = int(row.get("total", 0) or 0) or tot
            except (TypeError, ValueError):
                comm["bpe_total"] = tot
            count += 1
    print(f"      {count:,} communes enrichies BPE".replace(",", " "))


def enrich_filosofi_communes(communes: dict) -> None:
    if not CSV_FILOSOFI_COMMUNES.exists():
        print(f"[3/5] {CSV_FILOSOFI_COMMUNES.name} absent, Filosofi communes ignorée.")
        return
    print(f"[3/5] Lecture {CSV_FILOSOFI_COMMUNES.name}...")
    count = 0
    with open(CSV_FILOSOFI_COMMUNES, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            codgeo = (row.get("codgeo") or "").strip()
            if codgeo not in communes:
                continue
            for col in COLS_FILOSOFI:
                v = to_float(row.get(col))
                if v is not None:
                    communes[codgeo][col] = v
            count += 1
    print(f"      {count:,} communes enrichies Filosofi".replace(",", " "))


def enrich_age_communes(communes: dict) -> None:
    """Enrichit les communes avec les tranches d'âge INSEE 2021."""
    if not CSV_AGE_COMMUNES.exists():
        print(f"[3b/5] {CSV_AGE_COMMUNES.name} absent, pyramide des âges ignorée.")
        return
    print(f"[3b/5] Lecture {CSV_AGE_COMMUNES.name}...")
    count = 0
    with open(CSV_AGE_COMMUNES, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            codgeo = (row.get("CODGEO") or "").strip()
            if codgeo not in communes:
                continue
            for col in COLS_AGE:
                v = to_float(row.get(col))
                if v is not None:
                    communes[codgeo][col] = v
            count += 1
    print(f"      {count:,} communes enrichies âge".replace(",", " "))


def enrich_revenu_history(communes: dict, epcis_provisoires: dict | None = None) -> None:
    """Enrichit avec le revenu médian 2017 et 2019.
    
    Les CSV `filosofi_revenu_2017.csv` et `filosofi_revenu_2019.csv` contiennent
    CODGEO (5 chiffres pour commune, 9 pour EPCI) + valeur. On enrichit les communes
    ici ; les EPCI seront enrichis plus tard via _epci_revenu_history.
    """
    print("[3c/5] Lecture historique revenu (2017, 2019)...")
    count_com_17 = count_com_19 = 0
    count_epci_17 = count_epci_19 = 0
    
    # Buffer pour EPCI : codgeo → {2017: val, 2019: val}
    if not hasattr(enrich_revenu_history, "_epci_buffer"):
        enrich_revenu_history._epci_buffer = {}
    epci_buf = enrich_revenu_history._epci_buffer

    for year, path in [(2017, CSV_REVENU_2017), (2019, CSV_REVENU_2019)]:
        if not path.exists():
            print(f"      {path.name} absent, revenu {year} ignoré.")
            continue
        col = f"revenu_median_{year}"
        with open(path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                codgeo = (row.get("CODGEO") or "").strip()
                if not codgeo:
                    continue
                v = to_float(row.get(col))
                if v is None:
                    continue
                if len(codgeo) == 5 and codgeo in communes:
                    communes[codgeo][col] = v
                    if year == 2017: count_com_17 += 1
                    else: count_com_19 += 1
                elif len(codgeo) == 9:
                    epci_buf.setdefault(codgeo, {})[year] = v
                    if year == 2017: count_epci_17 += 1
                    else: count_epci_19 += 1

    print(f"      communes : {count_com_17:,} en 2017, {count_com_19:,} en 2019".replace(",", " "))
    print(f"      EPCI     : {count_epci_17:,} en 2017, {count_epci_19:,} en 2019".replace(",", " "))


def apply_revenu_history_to_epcis(epcis: dict) -> None:
    """Reporte les revenus historiques EPCI (2017, 2019) sur les fiches EPCI déjà construites."""
    buf = getattr(enrich_revenu_history, "_epci_buffer", {})
    if not buf:
        return
    count = 0
    for codgeo, vals in buf.items():
        if codgeo not in epcis:
            continue
        for year, v in vals.items():
            epcis[codgeo][f"revenu_median_{year}"] = v
        count += 1
    print(f"      {count:,} EPCI enrichis revenu historique".replace(",", " "))


# ===========================================================================
# Étape 4 : indicateurs dérivés par commune + ratios BPE
# ===========================================================================
def compute_derived_per_commune(communes: dict) -> None:
    print("[4/5] Calcul indicateurs dérivés par commune...")
    for code, c in communes.items():
        pop = c.get("P21_POP")
        # Densité
        c["densite_brute"] = safe_div(pop, c.get("SURFKM2"))
        # TCAM population 2015→2021 (6 ans)
        c["tcam_pop"] = tcam(c.get("P21_POP"), c.get("P15_POP"), 6)
        # Indicateurs âge (si données dispo)
        p60p = _sum_none_safe(c.get("P21_POP6074"), c.get("P21_POP7589"), c.get("P21_POP90P"))
        p30m = _sum_none_safe(c.get("P21_POP0014"), c.get("P21_POP1529"))
        p3044 = c.get("P21_POP3044")
        c["ratio_60p_30m"] = safe_div(p60p, p30m)
        c["part_30_44"] = safe_div(p3044, pop)
        # Artif par hab
        c["artif_par_hab"] = safe_div(c.get("art15naf21"), pop)
        # GES total
        ges_hors = c.get("GES_tot_HorsTransp")
        route = c.get("ROUTE")
        ges_total = None
        if ges_hors is not None and route is not None:
            ges_total = ges_hors + route
        c["ges_total"] = ges_total
        c["ges_total_par_hab"] = safe_div(ges_total, pop)
        c["ges_transport_par_hab"] = safe_div(route, pop)
        # Énergie
        c["conso_energie_par_hab"] = safe_div(c.get("TOTAL_FLUX"), pop)
        # Actifs
        c["part_actifs"] = safe_div(c.get("P21_ACTOCC1564"), pop)
        # Alias des colonnes scorées
        c["part_art_habitat"] = c.get("PartArtHabitat")
        c["dens_popclc"] = c.get("02b_DENS_POPCLC")
        # Ratios BPE par 10k hab
        if pop and pop > 0:
            tot = c.get("bpe_total", 0)
            c["bpe_total_par_10k"] = tot / pop * 10000 if tot else None
            for d in ("commerces", "sante", "enseignement", "sport_culture"):
                v = c.get(f"bpe_{d}", 0)
                c[f"bpe_{d}_par_10k"] = v / pop * 10000 if v else None
        else:
            c["bpe_total_par_10k"] = None
            for d in ("commerces", "sante", "enseignement", "sport_culture"):
                c[f"bpe_{d}_par_10k"] = None


# ===========================================================================
# Étape 5 : agrégats EPCI
# ===========================================================================

def enrich_mobilite(communes: dict) -> None:
    """Enrichit les communes avec les indicateurs mobilité domicile-travail (MOBPRO 2021).
    Score : part_voiture + taux_double_motorisation.
    Affichage : part_travail_commune, part_voiture_sur_place, parts modales, actifs_occupes.
    """
    if not CSV_MOBILITE.exists():
        print(f"[4c/5] {CSV_MOBILITE.name} absent, mobilité ignorée.")
        return
    print(f"[4c/5] Lecture {CSV_MOBILITE.name}...")
    cols = [
        "part_voiture", "taux_double_motorisation",
        "part_travail_commune", "part_voiture_sur_place",
        "part_marche", "part_velo", "part_2roues_motor", "part_tc",
        "part_sans_transport", "actifs_occupes",
    ]
    count = 0
    with open(CSV_MOBILITE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            codgeo = (row.get("CODGEO") or "").strip()
            if codgeo not in communes:
                continue
            for col in cols:
                v = to_float(row.get(col))
                if v is not None:
                    communes[codgeo][col] = v
            count += 1
    print(f"      {count:,} communes enrichies mobilité".replace(",", " "))


def enrich_associations(communes: dict) -> None:
    """Indicateurs associatifs (RNA Waldec A+R)."""
    if not CSV_ASSOCIATIONS.exists():
        print(f"[4d/5] {CSV_ASSOCIATIONS.name} absent, associations ignorees.")
        return
    print(f"[4d/5] Lecture {CSV_ASSOCIATIONS.name}...")
    cols = ["nb_assos","nb_environnement","nb_culture","nb_social","nb_sport","nb_sante","nb_auto",
            "densite_assos_1000hab","densite_environnement_1000hab","densite_culture_1000hab",
            "densite_social_1000hab","densite_sport_1000hab"]
    count = 0
    with open(CSV_ASSOCIATIONS, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            codgeo = (row.get("CODGEO") or "").strip()
            if codgeo not in communes:
                continue
            for col in cols:
                v = to_float(row.get(col))
                if v is not None:
                    communes[codgeo][col] = v
            count += 1
    print(f"      {count} communes enrichies associations")


def enrich_equipements_panier(communes: dict) -> None:
    """Variete (nb types panier presents) + densite equipements (BPE24 panier elargi)."""
    if not CSV_EQUIP_PANIER.exists():
        print(f"[4e/5] {CSV_EQUIP_PANIER.name} absent, equipements panier ignores.")
        return
    print(f"[4e/5] Lecture {CSV_EQUIP_PANIER.name}...")
    count = 0
    with open(CSV_EQUIP_PANIER, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            codgeo = (row.get("CODGEO") or "").strip()
            if codgeo not in communes:
                continue
            for col in ["variete_equip","nb_equip_total","densite_equip_1000hab"]:
                v = to_float(row.get(col))
                if v is not None:
                    communes[codgeo][col] = v
            count += 1
    print(f"      {count} communes enrichies equipements panier")


def enrich_gares(communes: dict) -> None:
    """Gares par commune (E107 nat / E108 reg / E109 loc) + points bonus."""
    if not CSV_GARES.exists():
        print(f"[4f/5] {CSV_GARES.name} absent, gares ignorees.")
        return
    print(f"[4f/5] Lecture {CSV_GARES.name}...")
    count = 0
    with open(CSV_GARES, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            codgeo = (row.get("CODGEO") or "").strip()
            if codgeo not in communes:
                continue
            for col in ["gare_nat","gare_reg","gare_loc","points_gare"]:
                v = to_float(row.get(col))
                if v is not None:
                    communes[codgeo][col] = v
            count += 1
    print(f"      {count} communes enrichies gares")


def build_epcis(communes: dict) -> dict:
    """Construit la fiche complète par EPCI à partir des communes."""
    print("[5/5] Construction des fiches EPCI...")
    # Groupes par EPCI
    by_epci = defaultdict(list)
    for code, c in communes.items():
        epci = c.get("epci")
        if epci:
            by_epci[epci].append(code)

    # Colonnes sommables (stocks et flux)
    cols_somme = [
        "P21_POP", "P15_POP", "SURFM2", "SURFHA", "SURFKM2",
        "TOTALCLC11", "TOTALCLC11a13",
        "naf09art23", "art09hab23", "art09inc23", "art15naf21",
        "GES_tot_HorsTransp", "GES_agri", "CO2_BIOMASSE", "DECHETS",
        "ENERGIE", "INDUSTRIE", "RESID", "ROUTE", "TERTIAIRE",
        "Gaz", "Electricité", "TOTAL_FLUX",
        "P21_ACTOCC1564",
        "ges_total",
    ] + COLS_AGE + [f"bpe_{d}" for d in BPE_DOMAINES] + ["bpe_total"]

    # Colonnes en moyenne pondérée par population (ratios déjà existants dans le CSV)
    cols_moy_pond = [
        "PartArtHabitat", "02a_DENS_POP", "02b_DENS_POPCLC",
        "03_ART_POPSUP", "04_GES_POP", "05_ENERGIE_POP",
        "revenu_median_2017", "revenu_median_2019",  # Moyenne pondérée des médianes communales
    ]

    epcis = {}
    for epci_code, codes in by_epci.items():
        rows = [communes[c] for c in codes]
        first = rows[0]
        entry = {
            "code": epci_code,
            "libepci": first.get("libepci", ""),
            "codes_communes": list(codes),
        }
        # Sommes
        for col in cols_somme:
            total = 0.0
            any_present = False
            for r in rows:
                v = r.get(col)
                if v is not None:
                    total += v
                    any_present = True
            entry[col] = total if any_present else None

        # Moyennes pondérées
        for col in cols_moy_pond:
            num, den = 0.0, 0.0
            for r in rows:
                v = r.get(col)
                p = r.get("P21_POP")
                if v is not None and p is not None and p > 0:
                    num += v * p
                    den += p
            entry[col] = (num / den) if den > 0 else None

        # Moyenne pondérée par actifs (mobilité) : plus juste que par pop pour le domicile-travail
        cols_moy_actifs = [
            "part_voiture", "taux_double_motorisation",
            "part_travail_commune", "part_voiture_sur_place",
            "part_marche", "part_velo", "part_2roues_motor", "part_tc",
            "part_sans_transport",
        ]
        for col in cols_moy_actifs:
            num, den = 0.0, 0.0
            for r in rows:
                v = r.get(col)
                a = r.get("actifs_occupes")
                if v is not None and a is not None and a > 0:
                    num += v * a
                    den += a
            entry[col] = (num / den) if den > 0 else None
        # Somme des actifs occupés de l'EPCI
        entry["actifs_occupes"] = sum(
            (r.get("actifs_occupes") or 0) for r in rows
        ) or None

        # Agregation associations EPCI
        for col in ["nb_assos","nb_environnement","nb_culture","nb_social","nb_sport","nb_sante","nb_auto"]:
            tot = sum((r.get(col) or 0) for r in rows)
            entry[col] = tot if tot else None
        _pop = entry.get("P21_POP")
        if entry.get("nb_assos") and _pop and _pop > 0:
            entry["densite_assos_1000hab"] = entry["nb_assos"] / _pop * 1000
            for cat in ["environnement","culture","social","sport"]:
                nb = entry.get("nb_" + cat)
                entry["densite_" + cat + "_1000hab"] = (nb / _pop * 1000) if nb else None
        else:
            entry["densite_assos_1000hab"] = None

        # Indicateurs dérivés au niveau EPCI (calculés depuis les sommes)
        pop = entry.get("P21_POP")
        entry["densite_brute"] = safe_div(pop, entry.get("SURFKM2"))
        entry["tcam_pop"] = tcam(entry.get("P21_POP"), entry.get("P15_POP"), 6)
        # Indicateurs âge à partir des sommes EPCI
        p60p_epci = _sum_none_safe(entry.get("P21_POP6074"), entry.get("P21_POP7589"), entry.get("P21_POP90P"))
        p30m_epci = _sum_none_safe(entry.get("P21_POP0014"), entry.get("P21_POP1529"))
        entry["ratio_60p_30m"] = safe_div(p60p_epci, p30m_epci)
        entry["part_30_44"] = safe_div(entry.get("P21_POP3044"), pop)
        entry["artif_par_hab"] = safe_div(entry.get("art15naf21"), pop)
        entry["ges_total_par_hab"] = safe_div(entry.get("ges_total"), pop)
        entry["ges_transport_par_hab"] = safe_div(entry.get("ROUTE"), pop)
        entry["conso_energie_par_hab"] = safe_div(entry.get("TOTAL_FLUX"), pop)
        entry["part_actifs"] = safe_div(entry.get("P21_ACTOCC1564"), pop)
        entry["part_art_habitat"] = entry.get("PartArtHabitat")
        entry["dens_popclc"] = entry.get("02b_DENS_POPCLC")

        # Ratios BPE EPCI
        if pop and pop > 0:
            entry["bpe_total_par_10k"] = (entry.get("bpe_total") or 0) / pop * 10000
            for d in ("commerces", "sante", "enseignement", "sport_culture"):
                v = entry.get(f"bpe_{d}") or 0
                entry[f"bpe_{d}_par_10k"] = v / pop * 10000
        else:
            entry["bpe_total_par_10k"] = None
            for d in ("commerces", "sante", "enseignement", "sport_culture"):
                entry[f"bpe_{d}_par_10k"] = None

        # Groupe typo majoritaire (pondéré par population)
        groupe_pop = defaultdict(float)
        for r in rows:
            g = r.get("groupe_typo", "hors_influence")
            p = r.get("P21_POP") or 0
            groupe_pop[g] += p
        entry["groupe_typo"] = max(groupe_pop, key=groupe_pop.get) if groupe_pop else "hors_influence"

        epcis[epci_code] = entry

    print(f"      {len(epcis):,} EPCI construits".replace(",", " "))
    return epcis


def enrich_filosofi_epci(epcis: dict) -> None:
    """Pour les EPCI, Filosofi vient directement du CSV INSEE (pas de recalcul)."""
    if not CSV_FILOSOFI_EPCI.exists():
        print(f"      {CSV_FILOSOFI_EPCI.name} absent, Filosofi EPCI ignorée.")
        return
    count = 0
    with open(CSV_FILOSOFI_EPCI, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            code = (row.get("codgeo") or "").strip()
            if code not in epcis:
                continue
            for col in COLS_FILOSOFI:
                v = to_float(row.get(col))
                if v is not None:
                    epcis[code][col] = v
            count += 1
    print(f"      {count:,} EPCI enrichis Filosofi".replace(",", " "))


# ===========================================================================
# Quantiles + valeurs triées par groupe typo
# ===========================================================================
def _build_quantiles_for_entities(entities: dict) -> tuple[dict, dict]:
    """Quantiles + listes triées pour un ensemble d'entités (communes OU epcis)."""
    values_by_group = defaultdict(lambda: defaultdict(list))
    values_national = defaultdict(list)
    for code, ent in entities.items():
        groupe = ent.get("groupe_typo", "hors_influence")
        for ind in INDICATEURS_A_QUANTIFIER:
            v = ent.get(ind)
            if v is not None:
                values_by_group[groupe][ind].append(v)
                values_national[ind].append(v)
    quantiles = {}
    sorted_values = {}
    for groupe, by_ind in values_by_group.items():
        quantiles[groupe] = {}
        sorted_values[groupe] = {}
        for ind, vals in by_ind.items():
            s = sorted(vals)
            sorted_values[groupe][ind] = s
            quantiles[groupe][ind] = _qts(s)
    quantiles["national"] = {}
    sorted_values["national"] = {}
    for ind, vals in values_national.items():
        s = sorted(vals)
        sorted_values["national"][ind] = s
        quantiles["national"][ind] = _qts(s)
    return quantiles, sorted_values


def apply_equip_panier_epci(epcis: dict) -> None:
    """Injecte variete + densite equip EPCI depuis le CSV pre-agrege."""
    if not CSV_EQUIP_PANIER_EPCI.exists():
        print(f"      {CSV_EQUIP_PANIER_EPCI.name} absent.")
        return
    count = 0
    with open(CSV_EQUIP_PANIER_EPCI, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            code = (row.get("code_epci") or "").strip()
            if code not in epcis:
                continue
            for col in ["variete_equip","densite_equip_1000hab"]:
                v = to_float(row.get(col))
                if v is not None:
                    epcis[code][col] = v
            count += 1
    print(f"      {count} EPCI enrichis equipements panier")


def apply_gares_epci(epcis: dict) -> None:
    """Injecte gares EPCI (pre-agregees) + points bonus."""
    if not CSV_GARES_EPCI.exists():
        print(f"      {CSV_GARES_EPCI.name} absent.")
        return
    count = 0
    with open(CSV_GARES_EPCI, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            code = (row.get("code_epci") or "").strip()
            if code not in epcis:
                continue
            for col in ["gare_nat","gare_reg","gare_loc","points_gare"]:
                v = to_float(row.get(col))
                if v is not None:
                    epcis[code][col] = v
            count += 1
    print(f"      {count} EPCI enrichis gares")


def apply_solaire_epci(epcis: dict) -> None:
    """Injecte solaire EPCI (registre ODRE) : nb installations / 1000 hab."""
    if not CSV_SOLAIRE_EPCI.exists():
        print(f"      {CSV_SOLAIRE_EPCI.name} absent.")
        return
    count = 0
    with open(CSV_SOLAIRE_EPCI, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            code = (row.get("code_epci") or "").strip()
            if code not in epcis:
                continue
            for col in ["puis_solaire_mw","nb_install_solaire",
                        "puis_solaire_kw_par_hab","nb_install_par_1000hab"]:
                v = to_float(row.get(col))
                if v is not None:
                    epcis[code][col] = v
            count += 1
    print(f"      {count} EPCI enrichis solaire")


def build_quantiles(communes: dict, epcis: dict = None) -> tuple[dict, dict]:
    """Distributions SEPAREES par maille pour eviter le biais EPCI-vs-communes :
    sorted_values['commune'][groupe][ind] et sorted_values['epci'][groupe][ind]."""
    print("[6/6] Calcul des quantiles et listes triees (par maille)...")
    q_com, sv_com = _build_quantiles_for_entities(communes)
    quantiles = {"commune": q_com}
    sorted_values = {"commune": sv_com}
    if epcis:
        q_epci, sv_epci = _build_quantiles_for_entities(epcis)
        quantiles["epci"] = q_epci
        sorted_values["epci"] = sv_epci
    return quantiles, sorted_values


def _qts(sorted_vals: list, ps=(20, 40, 60, 80)) -> list:
    n = len(sorted_vals)
    if n < 5:
        return [None] * len(ps)
    out = []
    for p in ps:
        i = max(0, min(n - 1, int(round(n * p / 100)) - 1))
        out.append(sorted_vals[i])
    return out


# ===========================================================================
# Main
# ===========================================================================




def enrich_score_socle_epci(epcis: dict) -> None:
    """Enrichit chaque EPCI avec le score socle équipements (moyenne pondérée pop)."""
    print("[3g/5] Lecture score socle EPCI...")
    if not CSV_SCORE_SOCLE_EPCI.exists():
        print(f"      {CSV_SCORE_SOCLE_EPCI.name} absent, score socle EPCI ignoré.")
        return
    n = 0
    with open(CSV_SCORE_SOCLE_EPCI, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            code = (row.get("code_epci") or "").strip()
            if not code or code not in epcis:
                continue
            score = to_float(row.get("score_socle"))
            taux = to_float(row.get("taux_couverture_socle"))
            if score is not None: epcis[code]["score_socle"] = score
            if taux is not None: epcis[code]["taux_couverture_socle"] = taux
            n += 1
    print(f"      {n:,} EPCI enrichis socle".replace(",", " "))


def enrich_dispersion(communes: dict, epcis_provisoires: dict | None = None) -> None:
    """Enrichit communes avec les 2 indicateurs de dispersion habitat/équipements.

    Le CSV `dispersion_epci.csv` contient les % calculés par EPCI :
      - pct_habitat_zone_ecole_15 : % de la pop à <1.5 km d'une école élémentaire
      - pct_equipements_zone_ecole_15 : % équipements quotidien à <1.5 km

    Ces valeurs (indicateurs TERRITORIAUX) sont appliquées à toutes les communes
    de chaque EPCI, et stockées dans un buffer pour les EPCI eux-mêmes.
    """
    print("[3e/5] Lecture dispersion habitat/équipements...")
    if not CSV_DISPERSION.exists():
        print(f"      {CSV_DISPERSION.name} absent, dispersion ignorée.")
        return

    if not hasattr(enrich_dispersion, "_epci_buffer"):
        enrich_dispersion._epci_buffer = {}
    epci_buf = enrich_dispersion._epci_buffer

    count_epci = 0
    with open(CSV_DISPERSION, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            epci_code = (row.get("code_epci") or "").strip()
            if not epci_code:
                continue
            hab = to_float(row.get("pct_habitat_zone_ecole_15"))
            eq = to_float(row.get("pct_equipements_zone_ecole_15"))
            if hab is None and eq is None:
                continue
            epci_buf[epci_code] = {
                "pct_habitat_zone_ecole_15": hab,
                "pct_equipements_zone_ecole_15": eq,
            }
            count_epci += 1

    # Appliquer aux communes (héritage de leur EPCI)
    count_com = 0
    for code_com, c in communes.items():
        epci_code = c.get("epci")
        if not epci_code or epci_code not in epci_buf:
            continue
        vals = epci_buf[epci_code]
        if vals["pct_habitat_zone_ecole_15"] is not None:
            c["pct_habitat_zone_ecole_15"] = vals["pct_habitat_zone_ecole_15"]
        if vals["pct_equipements_zone_ecole_15"] is not None:
            c["pct_equipements_zone_ecole_15"] = vals["pct_equipements_zone_ecole_15"]
        count_com += 1

    print(f"      EPCI buffer : {count_epci}")
    print(f"      Communes enrichies (héritage EPCI) : {count_com:,}".replace(",", " "))


def apply_dispersion_to_epcis(epcis: dict) -> None:
    """Reporte les indicateurs de dispersion sur les fiches EPCI déjà construites."""
    buf = getattr(enrich_dispersion, "_epci_buffer", {})
    if not buf:
        return
    n = 0
    for code, vals in buf.items():
        if code in epcis:
            for k, v in vals.items():
                if v is not None:
                    epcis[code][k] = v
            n += 1
    print(f"      {n}/{len(buf)} EPCI enrichis dispersion")




def enrich_score_socle(communes: dict) -> None:
    """Enrichit chaque commune avec le score socle équipements (méthode Fabien Rosa).

    Lit `score_socle_communes.csv` qui contient pour chaque commune :
      - score_socle : somme des scores (Fréquence × Public) des types présents
      - taux_couverture_socle : score / total_max × 100
      - n_types_socle_presents : nb de types d'équipements du socle présents
    """
    print("[3f/5] Lecture score socle équipements...")
    if not CSV_SCORE_SOCLE.exists():
        print(f"      {CSV_SCORE_SOCLE.name} absent, score socle ignoré.")
        return

    n = 0
    with open(CSV_SCORE_SOCLE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            code = (row.get("codgeo") or "").strip()
            if not code or code not in communes:
                continue
            score = to_float(row.get("score_socle"))
            taux = to_float(row.get("taux_couverture_socle"))
            n_types = row.get("n_types_socle_presents")
            if score is not None:
                communes[code]["score_socle"] = score
            if taux is not None:
                communes[code]["taux_couverture_socle"] = taux
            if n_types is not None:
                try:
                    communes[code]["n_types_socle_presents"] = int(n_types)
                except ValueError:
                    pass
            n += 1
    print(f"      {n:,} communes enrichies socle".replace(",", " "))


def main() -> None:
    t0 = time.time()
    DATA_DIR.mkdir(exist_ok=True)

    communes = load_communes()
    enrich_bpe(communes)
    enrich_filosofi_communes(communes)
    enrich_age_communes(communes)
    enrich_revenu_history(communes)
    enrich_dispersion(communes)
    enrich_score_socle(communes)
    enrich_mobilite(communes)
    enrich_associations(communes)
    enrich_equipements_panier(communes)
    enrich_gares(communes)
    compute_derived_per_commune(communes)
    epcis = build_epcis(communes)
    apply_equip_panier_epci(epcis)
    apply_gares_epci(epcis)
    apply_solaire_epci(epcis)
    enrich_filosofi_epci(epcis)
    apply_dispersion_to_epcis(epcis)
    enrich_score_socle_epci(epcis)
    apply_revenu_history_to_epcis(epcis)
    quantiles, sorted_values = build_quantiles(communes, epcis)

    payload = {
        "version": "1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "communes": communes,
        "epcis": epcis,
        "quantiles": quantiles,
        "sorted_values": sorted_values,
    }

    print(f"\n[w] Écriture {OUT_PICKLE.name} (gzip)...")
    with gzip.open(OUT_PICKLE, "wb", compresslevel=6) as f:
        pickle.dump(payload, f, protocol=pickle.HIGHEST_PROTOCOL)

    size_mo = OUT_PICKLE.stat().st_size / (1024 * 1024)
    dt = time.time() - t0

    # Récap
    print("\n========== RÉCAP ==========")
    print(f"  communes        : {len(communes):,}".replace(",", " "))
    print(f"  epcis           : {len(epcis):,}".replace(",", " "))
    print(f"  groupes quantif : {sorted(quantiles.keys())}")
    print(f"  taille pickle   : {size_mo:.2f} Mo")
    print(f"  durée totale    : {dt:.1f} s")
    print(f"  fichier         : {OUT_PICKLE}")
    print("===========================\n")

    # Sanity check : on vérifie qu'un des 5 codes pilotes est bien là
    sample_epcis = ["241700434", "200067213", "200067106", "245804406", "200067932"]
    for c in sample_epcis:
        if c in epcis:
            e = epcis[c]
            print(f"  ✓ {c} {e.get('libepci', '?')[:35]:<35} "
                  f"pop={e.get('P21_POP')} densité={e.get('densite_brute')}")
        else:
            print(f"  ✗ {c} absent du pickle")


if __name__ == "__main__":
    main()
