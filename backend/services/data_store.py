"""
Data store unifié du backend GT BDDe.

Charge UNE SEULE FOIS au démarrage le fichier précalculé
backend/data/precomputed.pkl.gz (généré par scripts/precompute_cache.py),
puis expose des fonctions de lookup ultra rapides utilisées par les services
indicateurs_locaux, bpe, filosofi et scoring.

Fallback : si le pickle n'existe pas (oubli de build), on lève une erreur
explicite plutôt que de relire les CSV à la main. Ça évite que l'app démarre
dans un état dégradé sans s'en rendre compte.
"""
from __future__ import annotations

import gzip
import pickle
import threading
from pathlib import Path
from typing import Optional

from ..config import DATA_DIR


PICKLE_PATH = DATA_DIR / "precomputed.pkl.gz"

_lock = threading.Lock()
_state: dict = {"loaded": False, "payload": None, "error": None}


def _load_if_needed() -> dict:
    """Charge le pickle en mémoire au premier appel. Thread-safe."""
    if _state["loaded"]:
        if _state["error"]:
            raise RuntimeError(_state["error"])
        return _state["payload"]
    with _lock:
        if _state["loaded"]:
            if _state["error"]:
                raise RuntimeError(_state["error"])
            return _state["payload"]
        if not PICKLE_PATH.exists():
            msg = (
                f"Cache précalculé introuvable ({PICKLE_PATH}). "
                "Lance 'python -m scripts.precompute_cache' pour le générer."
            )
            _state["error"] = msg
            _state["loaded"] = True
            raise RuntimeError(msg)
        with gzip.open(PICKLE_PATH, "rb") as f:
            payload = pickle.load(f)
        _state["payload"] = payload
        _state["loaded"] = True
        return payload


# ===========================================================================
# API publique : lookups
# ===========================================================================
def is_ready() -> bool:
    """True si le pickle est chargeable. Pour les routes /health par exemple."""
    try:
        _load_if_needed()
        return True
    except Exception:
        return False


def get_commune(code: str) -> Optional[dict]:
    """Renvoie la fiche complète d'une commune (toutes les valeurs précalculées)."""
    p = _load_if_needed()
    return p["communes"].get(str(code))


def get_epci(code: str) -> Optional[dict]:
    """Renvoie la fiche complète d'un EPCI (agrégats déjà calculés)."""
    p = _load_if_needed()
    return p["epcis"].get(str(code))


def get_territoire(territoire: dict) -> Optional[dict]:
    """
    Helper : prend un dict territoire {'type': 'commune'|'epci', 'code': ...}
    et renvoie la fiche correspondante.
    """
    if territoire["type"] == "commune":
        return get_commune(territoire["code"])
    return get_epci(territoire["code"])


def get_quantiles(groupe: str, indicateur: str) -> Optional[list]:
    """Quantiles [p20, p40, p60, p80] pour un groupe typo et un indicateur."""
    p = _load_if_needed()
    return p["quantiles"].get(groupe, {}).get(indicateur)


def get_sorted_values(groupe: str, indicateur: str, maille: str = "commune") -> list:
    """Liste triee des valeurs pour le rang percentile.
    maille : 'commune' ou 'epci' (entites comparees a leurs pairs)."""
    p = _load_if_needed()
    sv = p["sorted_values"]
    if maille in sv:
        return sv[maille].get(groupe, {}).get(indicateur, [])
    # Fallback ancienne structure
    return sv.get(groupe, {}).get(indicateur, [])


def meta() -> dict:
    """Méta du pickle : version, date de génération, tailles."""
    p = _load_if_needed()
    return {
        "version": p.get("version"),
        "generated_at": p.get("generated_at"),
        "nb_communes": len(p["communes"]),
        "nb_epcis": len(p["epcis"]),
        "groupes_quantiles": sorted(p["quantiles"].keys()),
    }
