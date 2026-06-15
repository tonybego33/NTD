"""
Notation par points — GT BDDe V3 (système Fabien, version discriminante).

Évolution vs barèmes en paliers : chaque bloc du capital est noté en CONTINU,
par rang percentile intra-typologique (CATAEU2010). Un territoire est comparé
à ses pairs de même type (grand pôle, moyen pôle, etc.), pas à la France entière.
=> Les scores s'étalent et distinguent réellement les territoires.

Capital (max 50) : 1A densité, 1B compacité, 1C variété équip, 1D gare, 1E emploi.
Pression (2A) : malus selon évolution démo + densité.
"""
import bisect
import statistics
from collections import defaultdict
from typing import Optional
from . import data_store

# Indicateurs du capital : code -> (champ fiche, sens). Sens +1 = plus c'est haut, mieux c'est.
CAPITAL_INDICS = {
    "1A_densite":        ("densite_brute", +1),
    "1B_compacite":      ("_compacite", +1),       # champ composite calculé
    "1C_variete_equip":  ("variete_equip", +1),
    "1E_emploi_commune": ("part_travail_commune", +1),
}

_cache_distrib = {"done": False, "distrib": {}}


def _build_distributions():
    """Pré-calcule les distributions par typologie pour chaque indicateur du capital (EPCI)."""
    if _cache_distrib["done"]:
        return _cache_distrib["distrib"]
    p = data_store._load_if_needed()
    distrib = defaultdict(lambda: defaultdict(list))  # typo -> indic -> [valeurs triées]
    for e in p["epcis"].values():
        typo = e.get("groupe_typo", "hors_influence")
        # compacité = moyenne habitat+équip zone écoles
        h = e.get("pct_habitat_zone_ecole_15")
        eq = e.get("pct_equipements_zone_ecole_15")
        comp = None
        if h is not None or eq is not None:
            vals = [v for v in (h, eq) if v is not None]
            comp = sum(vals) / len(vals)
        e["_compacite"] = comp
        for code, (champ, sens) in CAPITAL_INDICS.items():
            v = e.get(champ)
            if v is not None:
                distrib[typo][champ].append(v)
    # Trier
    for typo in distrib:
        for champ in distrib[typo]:
            distrib[typo][champ].sort()
    _cache_distrib["distrib"] = distrib
    _cache_distrib["done"] = True
    return distrib


def _rang_percentile(val, sorted_vals):
    """Position de val dans la distribution triée, en % (0-100)."""
    if not sorted_vals or val is None:
        return None
    i = bisect.bisect_left(sorted_vals, val)
    return i / len(sorted_vals) * 100


def _points_continu(val, sorted_vals, sens=+1):
    """Note /10 = rang percentile (continu). Sens -1 => inversé."""
    rang = _rang_percentile(val, sorted_vals)
    if rang is None:
        return None
    if sens < 0:
        rang = 100 - rang
    return round(rang / 10.0, 1)  # 0-100 -> 0-10


# ---- 1D : Bonus gare (national 10 / régional 6 / local 3 / aucune 0) ----
def points_gare(fiche: dict) -> float:
    if (fiche.get("gare_nat") or 0) > 0:
        return 10.0
    if (fiche.get("gare_reg") or 0) > 0:
        return 6.0
    if (fiche.get("gare_loc") or 0) > 0:
        return 3.0
    return 0.0


# ---- 2A : Pression démographique (malus) ----
def points_pression_demo(tcam, densite, seuils_tcam):
    if tcam is None:
        return 0
    moy, ec = seuils_tcam["moy"], seuils_tcam["ecart"]
    if tcam > moy + ec:
        base = 10
    elif tcam < moy - ec:
        base = 2
    else:
        base = 5
    if densite is None:
        modul = 0
    elif densite < 500:
        modul = +2
    elif densite < 2000:
        modul = 0
    else:
        modul = -2
    return max(0, base + modul)


def _seuils_tcam():
    p = data_store._load_if_needed()
    vals = [e.get("tcam_pop") for e in p["epcis"].values() if e.get("tcam_pop") is not None]
    if len(vals) < 2:
        return {"moy": 0.0, "ecart": 0.7}
    return {"moy": statistics.mean(vals), "ecart": statistics.pstdev(vals)}


def notation_points(territoire: dict) -> dict:
    fiche = data_store.get_territoire(territoire)
    if not fiche:
        return {"_erreur": "Territoire absent du cache."}

    distrib = _build_distributions()
    typo = fiche.get("groupe_typo", "hors_influence")
    seuils_tcam = _seuils_tcam()

    # compacité composite pour la fiche courante
    h = fiche.get("pct_habitat_zone_ecole_15")
    eq = fiche.get("pct_equipements_zone_ecole_15")
    fiche_comp = None
    if h is not None or eq is not None:
        vv = [v for v in (h, eq) if v is not None]
        fiche_comp = sum(vv) / len(vv)
    fiche["_compacite"] = fiche_comp

    densite = fiche.get("densite_brute")

    # Capital : blocs continus (percentile intra-typo) sauf gare (bonus discret)
    indic = {}
    for code, (champ, sens) in CAPITAL_INDICS.items():
        sv = distrib.get(typo, {}).get(champ, [])
        indic[code] = _points_continu(fiche.get(champ), sv, sens)
    indic["1D_gare"] = points_gare(fiche)
    indic["2A_pression_demo"] = points_pression_demo(fiche.get("tcam_pop"), densite, seuils_tcam)

    capital_codes = ["1A_densite", "1B_compacite", "1C_variete_equip", "1D_gare", "1E_emploi_commune"]
    capital = sum(indic[k] for k in capital_codes if indic[k] is not None)
    capital_max = 50.0

    pression = indic["2A_pression_demo"] or 0
    pression = max(0, min(pression, capital_max))

    score_global = round(capital / capital_max * 100, 1)
    score_global = round(max(0, score_global - (pression / capital_max * 100)), 1)

    return {
        "indicateurs": indic,
        "capital_positif": round(capital, 1),
        "capital_max": capital_max,
        "pression_demo": round(pression, 1),
        "score_global": score_global,
        "typologie": typo,
        "_note": "V3 continu : capital noté par rang percentile intra-typologique (CATAEU2010). Gare en bonus discret.",
    }
