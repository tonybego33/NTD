"""
Service de scoring par quantiles typologiques (refondu).

Avant : rechargeait indicateurs_export.csv + bpe_communes.csv + filosofi_communes.csv
à chaque démarrage, recalculait toutes les valeurs pour les 35k communes, puis
calculait les quantiles à la volée. Coûtait 10-20s de CPU par démarrage.

Maintenant : tout est dans data_store (valeurs précalculées par commune et EPCI,
quantiles et listes triées par groupe typologique). Ce service ne fait plus
que du lookup + calcul de rang percentile (O(log n) via bisect).
"""
from __future__ import annotations

import bisect
from typing import Optional

from . import data_store


# +1 = valeur haute = mieux ; -1 = valeur basse = mieux
INDICATEURS_SENS = {
    "densite_assos_1000hab":     +1,
    "nb_install_par_1000hab":    +1,
    "part_voiture":              -1,  # moins de voiture domicile-travail = mieux
    "taux_double_motorisation":  -1,  # moins de ménages multi-équipés = mieux
    "densite_brute":              +1,  # densité = compacité = potentiel décarbonation
    "part_30_44":                 +1,  # part actifs (vitalité, capacité à agir)
    "artif_par_hab":              -1,
    "part_art_habitat":           -1,
    "dens_popclc":                +1,
    "ges_total_par_hab":          -1,
    "ges_transport_par_hab":      -1,
    "conso_energie_par_hab":      -1,
    "bpe_total_par_10k":          +1,
    "bpe_commerces_par_10k":      +1,
    "bpe_sante_par_10k":          +1,
    "bpe_enseignement_par_10k":   +1,
    "bpe_sport_culture_par_10k":  +1,
    "part_actifs":                +1,
    "revenu_median":              +1,
    "taux_pauvrete":              -1,
    "rapport_interdecile":        -1,
    "part_imposes":               +1,
}

PONDERATIONS_DIMENSIONS = {
    "struct": {
        # Vision A (decarbonation) : compacite et densite = leviers structurels.
        # tcam_pop retire (la croissance est traitee en pression dans la notation V3).
        # ratio_60p_30m retire (le vieillissement n a pas de lien carbone clair).
        "densite_brute":  50,   # densite brute = compacite, levier cle
        "dens_popclc":    35,   # densite sur sol bati = forme urbaine
        "part_30_44":     15,   # part actifs (vitalite)
    },
    "access": {
        "bpe_total_par_10k":         30,
        "bpe_commerces_par_10k":     15,
        "bpe_sante_par_10k":         20,
        "bpe_enseignement_par_10k":  20,
        "bpe_sport_culture_par_10k": 15,
    },
    "env": {
        "ges_transport_par_hab": 30,
        "ges_total_par_hab":     25,
        "conso_energie_par_hab": 20,
        "artif_par_hab":         15,
        "part_art_habitat":      10,
    },
    "gouv": {
        "densite_assos_1000hab": 60,
        "nb_install_par_1000hab": 40,
    },
    "mob": {
        "part_voiture":              60,
        "taux_double_motorisation":  40,
    },
    "socio": {
        # Vision A : la socio-eco mesure la CAPACITE A AGIR (faisabilite de la transition),
        # pas la richesse en soi. On retire le rapport interdecile (les inegalites
        # ne disent pas la capacite a decarboner et penalisaient a tort les villes
        # touristiques type Cannes).
        "revenu_median":       30,   # moyens d investissement du territoire
        "part_actifs":         35,   # dynamisme economique, capacite a agir
        "taux_pauvrete":       20,   # frein social a la transition
        "part_imposes":        15,
    },
}

PONDERATIONS_GLOBALES = {
    # Vision A : potentiel de decarbonation. L environnement et la forme urbaine dominent.
    # La socio-eco passe a 5% : facteur de faisabilite, pas coeur du potentiel.
    "env":    30,
    "struct": 20,
    "access": 20,
    "mob":    15,
    "gouv":   10,
    "socio":   5,
}

LIBELLES_TYPO = {
    "grand_pole":     "Grand pôle urbain et couronne",
    "moyen_pole":     "Pôle moyen ou petit",
    "multipol":       "Territoire multipolarisé",
    "hors_influence": "Hors influence des pôles",
    "national":       "Ensemble national",
}

SEUIL_TYPO_MIN = 10  # en-dessous, on retombe sur le national


# ============================================================================
# Helpers
# ============================================================================
def _percentile_rank(val: float, sorted_values: list) -> Optional[float]:
    if not sorted_values:
        return None
    n = len(sorted_values)
    idx = bisect.bisect_right(sorted_values, val)
    return round(100 * idx / n, 1)


def _score_from_rank(rang: float, sens: int) -> float:
    return rang if sens == +1 else 100 - rang


def _grade(score: Optional[float]) -> str:
    if score is None:
        return "nd"
    if score >= 65:
        return "high"
    if score >= 45:
        return "mid"
    return "low"


# ============================================================================
# Point d'entrée
# ============================================================================
def get_scoring_for_territoire(territoire: dict,
                                indicateurs_locaux: dict,
                                bpe_ind: dict) -> dict:
    """
    Calcule le scoring complet pour un territoire.

    Les paramètres `indicateurs_locaux` et `bpe_ind` sont conservés pour
    compatibilité avec app.py mais ne sont plus utilisés : toutes les valeurs
    viennent désormais directement du data_store.
    """
    try:
        fiche = data_store.get_territoire(territoire)
    except RuntimeError as e:
        return {"_erreur": str(e)}

    if not fiche:
        return {"_erreur": f"Territoire {territoire.get('code')} absent du cache."}

    groupe = fiche.get("groupe_typo", "hors_influence")
    maille = "epci" if territoire.get("type") == "epci" else "commune"

    scores_indicateurs = {}
    for code, sens in INDICATEURS_SENS.items():
        val = fiche.get(code)
        if val is None:
            continue

        # Listes triées : on essaie d'abord la typologie, sinon le national
        sorted_typo = data_store.get_sorted_values(groupe, code, maille)
        sorted_national = data_store.get_sorted_values("national", code, maille)

        if len(sorted_typo) < SEUIL_TYPO_MIN:
            sorted_typo = sorted_national
            groupe_effectif = "national"
        else:
            groupe_effectif = groupe

        rang_typo = _percentile_rank(val, sorted_typo)
        rang_national = _percentile_rank(val, sorted_national)

        # Rang vs pairs dens7 (meme type de densite que l'outil), additif et optionnel
        dens7 = fiche.get("dens7")
        rang_dens7 = None
        n_dens7 = 0
        if dens7 is not None:
            sorted_dens7 = data_store.get_sorted_values("dens7_" + str(dens7), code, maille)
            if sorted_dens7:
                rang_dens7 = _percentile_rank(val, sorted_dens7)
                n_dens7 = len(sorted_dens7)

        if rang_typo is None and rang_national is None:
            continue

        ref_rang = rang_typo if rang_typo is not None else rang_national
        score = _score_from_rank(ref_rang, sens)
        score_national = _score_from_rank(rang_national, sens) if rang_national is not None else None

        scores_indicateurs[code] = {
            "score": round(score, 1),
            "score_national": round(score_national, 1) if score_national is not None else None,
            "rang_typo": rang_typo,
            "rang_national": rang_national,
            "rang_dens7": rang_dens7,
            "n_dens7": n_dens7,
            "valeur": val,
            "quantiles": data_store.get_quantiles(groupe_effectif, code),
            "sens": sens,
            "groupe": groupe_effectif,
            "libelle_typo": LIBELLES_TYPO.get(groupe_effectif, groupe_effectif),
            "n_typo": len(sorted_typo),
            "n_national": len(sorted_national),
        }

    # === Agrégation par dimension ===
    scores_dimensions = {}
    for dim, ponds in PONDERATIONS_DIMENSIONS.items():
        total_weight, total_score = 0, 0
        inds_detail = []
        for code, weight in ponds.items():
            if code in scores_indicateurs:
                total_score += scores_indicateurs[code]["score"] * weight
                total_weight += weight
                inds_detail.append({
                    "code": code,
                    "score": scores_indicateurs[code]["score"],
                    "poids": weight,
                })
        if total_weight > 0:
            score = total_score / total_weight
            scores_dimensions[dim] = {
                "score": round(score, 1),
                "grade": _grade(score),
                "indicateurs_utilises": inds_detail,
            }
        else:
            scores_dimensions[dim] = {"score": None, "grade": "nd", "indicateurs_utilises": []}

    # === Score global ===
    total_w, total_s = 0, 0
    for dim, weight in PONDERATIONS_GLOBALES.items():
        if dim in scores_dimensions and scores_dimensions[dim]["score"] is not None:
            total_s += scores_dimensions[dim]["score"] * weight
            total_w += weight
    score_global = round(total_s / total_w, 1) if total_w > 0 else None

    return {
        "scores_indicateurs": scores_indicateurs,
        "scores_dimensions": scores_dimensions,
        "score_global": {
            "valeur": score_global,
            "grade": _grade(score_global) if score_global is not None else "nd",
            "groupe_typo": groupe,
            "libelle_typo": LIBELLES_TYPO.get(groupe, groupe),
        },
        "meta": {
            "ponderations_dimensions": PONDERATIONS_DIMENSIONS,
            "ponderations_globales": PONDERATIONS_GLOBALES,
            "avertissement": "Scoring indicatif V1. À valider avec Fabien Rosa.",
        },
    }
