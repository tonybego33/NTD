"""
Service Accessibilité / Maillage · Base Permanente des Équipements (BPE).

Refondu : ne lit plus bpe_communes.csv. Les compteurs BPE par commune et les
agrégats EPCI sont déjà dans le data_store.

Contrat de retour inchangé pour compatibilité frontend :
    {code_ind: {valeur, valeur_formatee, libelle, unite, source, dimension, statut}}
"""
from __future__ import annotations

from . import data_store


DOMAINES = ["services", "commerces", "enseignement", "sante",
            "transport", "sport_culture", "tourisme"]

LIBELLES = {
    "services": "Services pour les particuliers",
    "commerces": "Commerces",
    "enseignement": "Enseignement",
    "sante": "Santé et action sociale",
    "transport": "Transports et déplacements",
    "sport_culture": "Sports, loisirs, culture",
    "tourisme": "Tourisme",
}

# Domaines exposés en ratio /10k hab (les autres restent en absolu)
RATIO_DOMAINES = ("commerces", "sante", "enseignement", "sport_culture")


def _fmt_int(v) -> str:
    if v is None:
        return None
    return f"{int(round(v)):,}".replace(",", " ")


def _fmt_float2(v) -> str:
    if v is None:
        return None
    return f"{v:,.2f}".replace(",", " ").replace(".", ",")


def _fmt_float1(v) -> str:
    if v is None:
        return None
    return f"{v:,.1f}".replace(",", " ").replace(".", ",")


def get_indicateurs(territoire: dict) -> dict:
    """Renvoie les indicateurs BPE d'un territoire."""
    try:
        fiche = data_store.get_territoire(territoire)
    except RuntimeError as e:
        return {"_erreur": str(e)}

    if not fiche:
        return {"_erreur": f"{territoire.get('type', '?').capitalize()} {territoire.get('code')} absent."}

    result = {}

    # Total
    total = fiche.get("bpe_total")
    result["bpe_total"] = {
        "valeur": total,
        "valeur_formatee": _fmt_int(total),
        "libelle": "Total équipements BPE",
        "unite": "équip.",
        "source": "INSEE BPE 2023",
        "dimension": "access",
        "statut": "ok" if total is not None else "indisponible",
    }
    # Total par 10k hab
    ratio_total = fiche.get("bpe_total_par_10k")
    if ratio_total is not None:
        result["bpe_total_par_10k"] = {
            "valeur": round(ratio_total, 1),
            "valeur_formatee": _fmt_float1(ratio_total),
            "libelle": "Équipements pour 10 000 habitants",
            "unite": "équip./10k hab",
            "source": "INSEE BPE 2023 + RP 2021",
            "dimension": "access",
            "statut": "ok",
        }

    # Par domaine (counts) + ratios par 10k hab pour les domaines clés
    for d in DOMAINES:
        v = fiche.get(f"bpe_{d}")
        result[f"bpe_{d}"] = {
            "valeur": v,
            "valeur_formatee": _fmt_int(v),
            "libelle": f"Équipements · {LIBELLES[d]}",
            "unite": "équip.",
            "source": "INSEE BPE 2023",
            "dimension": "access",
            "statut": "ok" if v is not None else "indisponible",
        }
        if d in RATIO_DOMAINES:
            r = fiche.get(f"bpe_{d}_par_10k")
            if r is not None:
                result[f"bpe_{d}_par_10k"] = {
                    "valeur": round(r, 2),
                    "valeur_formatee": _fmt_float2(r),
                    "libelle": f"{LIBELLES[d]} pour 10 000 hab",
                    "unite": "équip./10k hab",
                    "source": "INSEE BPE 2023 + RP 2021",
                    "dimension": "access",
                    "statut": "ok",
                }
    return result
