"""
Backend FastAPI du GT BDDe.

Routes principales :
  GET  /                          → health check
  GET  /territoire/{code}         → métadonnées + contour (geo.api.gouv.fr)
  GET  /indicateurs/{code}        → diagnostic multicritère (Indicateurs_GT_BDDe)
  GET  /indicateurs/def           → définition des indicateurs exposés
  GET  /gouvernance/indicateurs   → liste des indicateurs manuels
  POST /gouvernance/{code}        → saisie d'un indicateur manuel

Lancement :
    python -m uvicorn backend.app:app --reload --host 0.0.0.0
"""
from __future__ import annotations

import bisect
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .config import APP_TITLE, APP_VERSION, ALLOWED_ORIGINS
from .services import geo as geo_service
from .services import gouvernance as gouv_service
from .services import indicateurs_locaux as local_service
from .services import bpe as bpe_service
from .services import notation_points as notation_service
from .services import filosofi as filosofi_service
from .services import scoring as scoring_service
from .services import carto as carto_service
from .services import data_store


DIMENSIONS_META = {
    "struct": {"libelle": "Structure territoriale", "ordre": 1},
    "access": {"libelle": "Accessibilité et maillage", "ordre": 2},
    "mob":    {"libelle": "Mobilité", "ordre": 3},
    "env":    {"libelle": "Performance environnementale", "ordre": 4},
    "socio":  {"libelle": "Structure socio-économique", "ordre": 5},
    "gouv":   {"libelle": "Gouvernance", "ordre": 6},
}


app = FastAPI(title=APP_TITLE, version=APP_VERSION)

app.mount("/assets", StaticFiles(directory="frontend/assets"), name="assets")
app.mount("/css", StaticFiles(directory="frontend/css"), name="css")
app.mount("/js", StaticFiles(directory="frontend/js"), name="js")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"app": APP_TITLE, "version": APP_VERSION, "status": "ok"}


@app.get("/search")
async def search(q: str = "", limit: int = 10):
    if not q or len(q.strip()) < 2:
        return {"results": []}
    try:
        results = await geo_service.search_territoires(q.strip(), limit=limit)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur recherche : {e}")
    return {"results": results}


@app.get("/territoire/{code}")
async def territoire(code: str):
    try:
        t = await geo_service.resolve(code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return t


@app.get("/indicateurs/def")
def indicateurs_def():
    return {
        "indicateurs_locaux": local_service.list_indicateurs_def(),
        "indicateurs_filosofi": filosofi_service.list_indicateurs_def(),
        "indicateurs_gouvernance": gouv_service.INDICATEURS_GOUVERNANCE,
        "dimensions": DIMENSIONS_META,
    }


@app.get("/indicateurs/{code}")
async def indicateurs(code: str):
    try:
        t = await geo_service.resolve(code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))

    local_indicateurs = local_service.get_indicateurs(t)
    local_error = local_indicateurs.pop("_erreur", None)

    bpe_indicateurs = bpe_service.get_indicateurs(t)
    bpe_error = bpe_indicateurs.pop("_erreur", None)

    filosofi_indicateurs = filosofi_service.get_indicateurs(t)
    filosofi_error = filosofi_indicateurs.pop("_erreur", None)

    gouv_list = gouv_service.indicateurs_gouvernance(t)

    dimensions = {}
    for dim_code, meta in DIMENSIONS_META.items():
        dimensions[dim_code] = {
            "libelle": meta["libelle"],
            "ordre": meta["ordre"],
            "indicateurs": [],
        }

    for ind_code, ind_data in local_indicateurs.items():
        dim = ind_data.get("dimension")
        if dim and dim in dimensions:
            dimensions[dim]["indicateurs"].append({"code": ind_code, **ind_data})

    for ind_code, ind_data in bpe_indicateurs.items():
        dim = ind_data.get("dimension")
        if dim and dim in dimensions:
            dimensions[dim]["indicateurs"].append({"code": ind_code, **ind_data})

    for ind_code, ind_data in filosofi_indicateurs.items():
        dim = ind_data.get("dimension")
        if dim and dim in dimensions:
            dimensions[dim]["indicateurs"].append({"code": ind_code, **ind_data})

    for g in gouv_list:
        dimensions["gouv"]["indicateurs"].append({
            "code": g["code"],
            "libelle": g["libelle"],
            "valeur": g["valeur"],
            "valeur_formatee": g["valeur"] if g["valeur"] else None,
            "unite": g["unite"],
            "source": "Saisie manuelle GT BDDe",
            "statut": g["statut"],
            "type_saisie": g["type"],
            "remplisseur": g.get("remplisseur"),
            "saisie_at": g.get("saisie_at"),
            "source_url": g.get("source_url"),
            "mode": "manuel",
        })

    for dim_code in ["access"]:
        if not dimensions[dim_code]["indicateurs"]:
            dimensions[dim_code]["statut"] = "a_brancher"
            dimensions[dim_code]["note"] = {
                "access": "Sera alimenté par BPE (INSEE) et GTFS des AOM.",
            }[dim_code]

    try:
        indicateurs_pour_scoring = {**local_indicateurs, **filosofi_indicateurs}
        scoring = scoring_service.get_scoring_for_territoire(t, indicateurs_pour_scoring, bpe_indicateurs)
        scoring_error = scoring.get("_erreur")
    except Exception as e:
        scoring = {}
        scoring_error = str(e)

    # Niveau dens7 du territoire (pour le rang vs pairs de meme densite)
    try:
        _fiche_d7 = data_store.get_territoire(t)
        _dens7 = _fiche_d7.get("dens7") if _fiche_d7 else None
    except Exception:
        _dens7 = None
    _maille_d7 = "epci" if t.get("type") == "epci" else "commune"

    if "scores_indicateurs" in scoring:
        scores_ind = scoring["scores_indicateurs"]
        for dim_code, dim in dimensions.items():
            for ind in dim.get("indicateurs", []):
                code = ind.get("code")
                if code in scores_ind:
                    s = scores_ind[code]
                    ind["score"] = s["score"]
                    ind["score_national"] = s.get("score_national")
                    ind["rang_typo"] = s.get("rang_typo")
                    ind["rang_national"] = s.get("rang_national")
                    ind["libelle_typo"] = s.get("libelle_typo")
                    ind["n_typo"] = s.get("n_typo")
                    ind["n_national"] = s.get("n_national")
                    ind["quantiles"] = s["quantiles"]
                    ind["sens"] = s["sens"]
                    # Rang vs pairs dens7 (additif, ne casse rien si absent du pickle)
                    _val = s.get("valeur")
                    if _dens7 is not None and _val is not None:
                        _sd7 = data_store.get_sorted_values("dens7_" + str(_dens7), code, _maille_d7)
                        if _sd7:
                            ind["rang_dens7"] = round(100 * bisect.bisect_right(_sd7, _val) / len(_sd7), 1)
                            ind["n_dens7"] = len(_sd7)

    if "scores_dimensions" in scoring:
        for dim_code, score_dim in scoring["scores_dimensions"].items():
            if dim_code in dimensions and score_dim["score"] is not None:
                dimensions[dim_code]["score"] = score_dim["score"]
                dimensions[dim_code]["grade"] = score_dim["grade"]

    response = {
        "territoire": {
            "type": t["type"],
            "code": t["code"],
            "nom": t["nom"],
            "population": t.get("population"),
            "superficie_km2": t.get("superficie_km2"),
            "nb_communes": t.get("nb_communes"),
        },
        "dimensions": dimensions,
        "score_global": scoring.get("score_global"),
        "scoring_meta": scoring.get("meta"),
    }
    if local_error:
        response["_warning_indicateurs_locaux"] = local_error
    if bpe_error:
        response["_warning_bpe"] = bpe_error
    if filosofi_error:
        response["_warning_filosofi"] = filosofi_error
    if scoring_error:
        response["_warning_scoring"] = scoring_error
    return response


class GouvValueIn(BaseModel):
    indicateur_code: str
    valeur: Optional[str] = None
    source_url: Optional[str] = None
    remplisseur: Optional[str] = None


@app.post("/gouvernance/{code}")
async def set_gouv(code: str, payload: GouvValueIn):
    try:
        t = await geo_service.resolve(code)
    except (ValueError, LookupError) as e:
        raise HTTPException(status_code=400, detail=str(e))

    valid_codes = {i["code"] for i in gouv_service.INDICATEURS_GOUVERNANCE}
    if payload.indicateur_code not in valid_codes:
        raise HTTPException(
            status_code=400,
            detail=f"indicateur_code inconnu. Valides : {sorted(valid_codes)}",
        )
    gouv_service.set_value(
        t["type"], t["code"], payload.indicateur_code,
        payload.valeur, payload.source_url, payload.remplisseur,
    )
    return {"ok": True, "saved": payload.model_dump()}


@app.get("/gouvernance/indicateurs")
def list_gouv_indicateurs():
    return gouv_service.INDICATEURS_GOUVERNANCE


@app.get("/notation/{code}")
async def notation(code: str):
    """Notation par points (systeme V3 Fabien) : capital + pression, score global."""
    try:
        t = await geo_service.resolve(code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    res = notation_service.notation_points(t)
    if "_erreur" in res:
        raise HTTPException(status_code=404, detail=res["_erreur"])
    # Libelles lisibles des blocs
    libelles = {
        "1A_densite": "Densite de population",
        "1B_compacite": "Compacite (habitat + equipements zone ecoles)",
        "1C_variete_equip": "Variete des equipements",
        "1D_gare": "Desserte par la gare",
        "1E_emploi_commune": "Part de l emploi dans la commune",
        "2A_pression_demo": "Pression demographique (artificialisation)",
    }
    blocs = []
    for code_ind, val in res["indicateurs"].items():
        blocs.append({
            "code": code_ind,
            "libelle": libelles.get(code_ind, code_ind),
            "points": val,
            "type": "pression" if code_ind.startswith("2") else "capital",
        })
    return {
        "code": t.get("code"),
        "type": t.get("type"),
        "typologie": res.get("typologie"),
        "score_global": res["score_global"],
        "capital_positif": res["capital_positif"],
        "capital_max": res["capital_max"],
        "pression": res["pression_demo"],
        "blocs": blocs,
        "note_methodo": res["_note"],
    }


@app.get("/carto/{code}")
async def carto(code: str, layers: Optional[str] = None):
    # ─── Couche écoles élémentaires + buffers 1,5 km (Empreintes / GT BDDe) ───
    if "ecoles" in (layers or ""):
        import json as _json
        from pathlib import Path as _Path
        _eco_file = _Path(__file__).parent / "data" / "ecoles_epci.json"
        if _eco_file.exists():
            try:
                _data = _json.loads(_eco_file.read_text())
                _epcis_dict = _data.get("epcis", _data)  # rétrocompat
                _c2e = _data.get("commune_to_epci", {})
                # Si code est une commune, résoudre vers son EPCI
                _lookup_code = _c2e.get(code, code)
                _ecoles = _epcis_dict.get(_lookup_code, [])
                _features = [
                    {
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [e["lon"], e["lat"]]},
                        "properties": {"libcom": e.get("libcom", ""), "nom": e.get("nom", "")},
                    }
                    for e in _ecoles
                ]
                return {"ecoles": {"type": "FeatureCollection", "features": _features}}
            except Exception as _e:
                return {"ecoles": {"type": "FeatureCollection", "features": []}, "error": str(_e)}
        else:
            return {"ecoles": {"type": "FeatureCollection", "features": []}, "error": "ecoles_epci.json absent"}

    # ─── Couches équipements BPE24 (Santé / Commerces) ───
    for _cat in ("sante", "commerces"):
        if _cat in (layers or ""):
            import json as _json
            from pathlib import Path as _Path
            _eq_file = _Path(__file__).parent / "data" / "equipements_epci.json"
            if _eq_file.exists():
                try:
                    _data = _json.loads(_eq_file.read_text())
                    _c2e = _data.get("commune_to_epci", {})
                    _lookup_code = _c2e.get(code, code)
                    _eq = _data.get("epcis", {}).get(_lookup_code, {}).get(_cat, [])
                    _features = [
                        {
                            "type": "Feature",
                            "geometry": {"type": "Point", "coordinates": [e["lon"], e["lat"]]},
                            "properties": {"libcom": e.get("libcom", ""), "nom": e.get("nom", ""), "type": e.get("type", "")},
                        }
                        for e in _eq
                    ]
                    return {_cat: {"type": "FeatureCollection", "features": _features}}
                except Exception as _e:
                    return {_cat: {"type": "FeatureCollection", "features": []}, "error": str(_e)}
            return {_cat: {"type": "FeatureCollection", "features": []}, "error": "equipements_epci.json absent"}

    try:
        t = await geo_service.resolve(code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))

    requested = None
    if layers:
        requested = [x.strip() for x in layers.split(",") if x.strip() in ("tc", "velo", "gares")]
    return carto_service.get_layers_for_territoire(t, requested)





@app.get("/densite/{code}")
async def get_densite(code: str, type: str = "pop"):
    """Retourne un GeoJSON des communes du territoire avec leur valeur de densité.

    type : pop | equip | sante | artif
    """
    if type not in ("pop", "equip", "sante", "artif"):
        raise HTTPException(status_code=400, detail="type invalide (pop|equip|sante|artif)")

    territoire = await geo_service.resolve(code)
    if not territoire:
        raise HTTPException(status_code=404, detail="Territoire introuvable")

    return await carto_service.get_densite_communes_geojson(territoire, type)


@app.get("/voisinage/{code}")
async def get_voisinage(code: str, type: str = "pop", rayon: int = 0):
    """GeoJSON des communes voisines (hors EPCI) dans un rayon autour du centroïde,
    colorables sur la même échelle que la choroplèthe.

    type  : pop | equip | sante | artif
    rayon : km (0 = rien). Borné à 100 km.
    """
    if type not in ("pop", "equip", "sante", "artif"):
        raise HTTPException(status_code=400, detail="type invalide (pop|equip|sante|artif)")
    if rayon <= 0:
        return {"type": "FeatureCollection", "features": []}
    rayon = min(int(rayon), 100)

    territoire = await geo_service.resolve(code)
    if not territoire:
        raise HTTPException(status_code=404, detail="Territoire introuvable")

    return await carto_service.get_voisinage_geojson(territoire, type, rayon)


@app.get("/app")
def frontend():
    return FileResponse("frontend/index.html")