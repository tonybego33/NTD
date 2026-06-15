"""
Service Filosofi : revenu médian, pauvreté, inégalités (INSEE Filosofi 2021).

Refondu : ne lit plus filosofi_communes.csv ni filosofi_epci.csv. Les valeurs
sont déjà jointes aux fiches communes / EPCI dans le data_store.

Contrat de retour inchangé.
"""
from __future__ import annotations

from typing import Optional

from . import data_store


INDICATEURS_DEF = [
    {"code": "revenu_median", "key": "revenu_median",
     "label": "Revenu médian disponible par UC", "unite": "€/an", "format": "int_euro",
     "source": "INSEE Filosofi 2021"},
    {"code": "revenu_median_2017", "key": "revenu_median_2017",
     "label": "Revenu médian 2017", "unite": "€/an", "format": "int_euro",
     "source": "INSEE Filosofi 2017"},
    {"code": "revenu_median_2019", "key": "revenu_median_2019",
     "label": "Revenu médian 2019", "unite": "€/an", "format": "int_euro",
     "source": "INSEE Filosofi 2019"},
    {"code": "taux_pauvrete", "key": "taux_pauvrete",
     "label": "Taux de pauvreté (seuil 60 %)", "unite": "%", "format": "float1",
     "source": "INSEE Filosofi 2021"},
    {"code": "rapport_interdecile", "key": "rapport_interdecile",
     "label": "Rapport interdécile D9/D1", "unite": "", "format": "float1",
     "source": "INSEE Filosofi 2021"},
    {"code": "part_imposes", "key": "part_imposes",
     "label": "Part des ménages imposés", "unite": "%", "format": "float1",
     "source": "INSEE Filosofi 2021"},
    {"code": "part_presta_sociales", "key": "part_presta_sociales",
     "label": "Part des prestations sociales dans le revenu", "unite": "%", "format": "float1",
     "source": "INSEE Filosofi 2021"},
]


def _format_value(v: Optional[float], fmt: str) -> Optional[str]:
    if v is None:
        return None
    if fmt == "int_euro":
        return f"{round(v):,}".replace(",", " ") + " €"
    if fmt == "float1":
        return f"{v:,.1f}".replace(",", " ").replace(".", ",")
    if fmt == "float2":
        return f"{v:,.2f}".replace(",", " ").replace(".", ",")
    return str(v)


def get_indicateurs(territoire: dict) -> dict:
    """Renvoie les indicateurs Filosofi pour un territoire."""
    try:
        fiche = data_store.get_territoire(territoire)
    except RuntimeError as e:
        return {"_erreur": str(e)}

    # Pas d'erreur si la fiche est absente : on renvoie juste un dict vide
    # (secret statistique INSEE possible pour les petites communes)
    if not fiche:
        return {}

    result = {}
    for ind in INDICATEURS_DEF:
        val = fiche.get(ind["key"])
        result[ind["code"]] = {
            "valeur": val,
            "valeur_formatee": _format_value(val, ind["format"]),
            "libelle": ind["label"],
            "unite": ind["unite"],
            "source": ind["source"],
            "dimension": "socio",
            "statut": "ok" if val is not None else "indisponible",
        }
    return result


def list_indicateurs_def() -> list:
    """Pour la route /indicateurs/def."""
    return [
        {"code": ind["code"], "label": ind["label"], "unite": ind["unite"],
         "source": ind["source"], "dimension": "socio"}
        for ind in INDICATEURS_DEF
    ]
