"""
Service cartographie : couches pour la carte interactive.

2 couches actives :
  - Arrêts de transport en commun : via API Overpass OpenStreetMap
  - Pistes cyclables : via API Overpass OpenStreetMap

Renvoie du GeoJSON prêt à être affiché par Leaflet.
"""
from __future__ import annotations

from typing import Optional

import httpx

from ..cache_store import get as cache_get, set_ as cache_set


# ============================================================
# Couches OSM via Overpass
# ============================================================

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

OVERPASS_HEADERS = {
    "User-Agent": "GT-BDDe/0.2 (Sciences Po Bordeaux / AREP - projet de diagnostic territorial)",
    "Accept": "application/json",
    "Accept-Encoding": "gzip, deflate",
}


def _overpass_query(query: str, cache_key: str) -> Optional[dict]:
    """Exécute une requête Overpass avec cache disque et fallback sur miroirs."""
    cached = cache_get("overpass", cache_key)
    if cached is not None:
        return cached
    last_error = None
    for url in OVERPASS_ENDPOINTS:
        try:
            with httpx.Client(timeout=60.0, headers=OVERPASS_HEADERS) as client:
                r = client.post(url, data={"data": query})
                r.raise_for_status()
                data = r.json()
                cache_set("overpass", cache_key, data)
                return data
        except Exception as e:
            last_error = f"{url} -> {e}"
            continue
    return {"_error": last_error or "Overpass indisponible", "elements": []}


def _bbox_around(lat: float, lon: float, radius_km: float = 15) -> tuple:
    """Retourne une bbox (south, west, north, east) autour d'un point."""
    dlat = radius_km / 111.0
    dlon = radius_km / (111.0 * max(0.1, abs(0.7)))
    return (lat - dlat, lon - dlon, lat + dlat, lon + dlon)


def get_tc_arrets(bbox: tuple) -> dict:
    """Arrêts de bus/tram/métro dans une bbox. bbox = (south, west, north, east)."""
    s, w, n, e = bbox
    key = f"tc_{s:.3f}_{w:.3f}_{n:.3f}_{e:.3f}"
    query = f"""
[out:json][timeout:45];
(
  node["highway"="bus_stop"]({s},{w},{n},{e});
  node["railway"="tram_stop"]({s},{w},{n},{e});
  node["public_transport"="stop_position"]({s},{w},{n},{e});
  node["amenity"="bus_station"]({s},{w},{n},{e});
);
out body;
"""
    data = _overpass_query(query, key)
    if not data or "_error" in data:
        return {"type": "FeatureCollection", "features": [], "_error": data.get("_error") if data else "?"}
    features = []
    for el in data.get("elements", []):
        if el.get("type") != "node":
            continue
        tags = el.get("tags", {})
        type_tc = "bus"
        if tags.get("railway") == "tram_stop":
            type_tc = "tram"
        elif tags.get("amenity") == "bus_station":
            type_tc = "gare_routiere"
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [el["lon"], el["lat"]]},
            "properties": {
                "name": tags.get("name", ""),
                "type": type_tc,
                "operator": tags.get("operator", ""),
            },
        })
    return {"type": "FeatureCollection", "features": features}


def get_cyclable(bbox: tuple) -> dict:
    """Voies cyclables dans une bbox."""
    s, w, n, e = bbox
    key = f"velo_{s:.3f}_{w:.3f}_{n:.3f}_{e:.3f}"
    query = f"""
[out:json][timeout:60];
(
  way["highway"="cycleway"]({s},{w},{n},{e});
  way["cycleway"~"lane|track|opposite_lane|opposite_track"]({s},{w},{n},{e});
  way["cycleway:left"~"lane|track"]({s},{w},{n},{e});
  way["cycleway:right"~"lane|track"]({s},{w},{n},{e});
  way["bicycle"="designated"]({s},{w},{n},{e});
);
out geom;
"""
    data = _overpass_query(query, key)
    if not data or "_error" in data:
        return {"type": "FeatureCollection", "features": [], "_error": data.get("_error") if data else "?"}
    features = []
    for el in data.get("elements", []):
        if el.get("type") != "way" or "geometry" not in el:
            continue
        coords = [[pt["lon"], pt["lat"]] for pt in el["geometry"]]
        if len(coords) < 2:
            continue
        tags = el.get("tags", {})
        cat = "voie_partagee"
        if tags.get("highway") == "cycleway":
            cat = "piste_dediee"
        elif "track" in (tags.get("cycleway", "") + tags.get("cycleway:left", "") + tags.get("cycleway:right", "")):
            cat = "piste_dediee"
        features.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coords},
            "properties": {
                "name": tags.get("name", ""),
                "categorie": cat,
                "highway": tags.get("highway", ""),
            },
        })
    return {"type": "FeatureCollection", "features": features}


def get_layers_for_territoire(territoire: dict, layers: list = None) -> dict:
    """
    Agrège les couches demandées pour un territoire.
    layers : liste parmi ["tc", "velo"]. Si None, toutes.
    """
    layers = layers or ["tc", "velo"]
    result = {}

    bbox = _compute_bbox_from_territoire(territoire)

    if "tc" in layers and bbox:
        result["tc"] = get_tc_arrets(bbox)
    if "velo" in layers and bbox:
        result["velo"] = get_cyclable(bbox)
    return result


def _compute_bbox_from_territoire(territoire: dict) -> Optional[tuple]:
    """Retourne une bbox (south, west, north, east) à partir du contour ou du centre."""
    contour = territoire.get("contour")
    if contour:
        try:
            lons, lats = [], []
            def walk(g):
                if isinstance(g, dict):
                    if g.get("type") in ("Polygon", "MultiPolygon"):
                        coords = g["coordinates"]
                        _flatten(coords, lons, lats)
                    elif "coordinates" in g:
                        _flatten(g["coordinates"], lons, lats)
                    for v in g.values():
                        if isinstance(v, (list, dict)):
                            walk(v)
                elif isinstance(g, list):
                    for v in g:
                        walk(v)
            walk(contour)
            if lons and lats:
                return (min(lats), min(lons), max(lats), max(lons))
        except Exception:
            pass
    centre = territoire.get("centre")
    if centre and centre.get("coordinates"):
        lon, lat = centre["coordinates"]
        return _bbox_around(lat, lon, 15)
    return None


def _flatten(coords, lons: list, lats: list) -> None:
    """Extrait récursivement toutes les paires (lon, lat) d'une structure GeoJSON."""
    if not isinstance(coords, list):
        return
    if len(coords) == 2 and all(isinstance(c, (int, float)) for c in coords):
        lons.append(coords[0]); lats.append(coords[1])
        return
    for c in coords:
        _flatten(c, lons, lats)


# ════════════════════════════════════════════════════════════
# DENSITÉ COMMUNES — choropleth (option A cartographie)
# ════════════════════════════════════════════════════════════
_DENSITE_CACHE = {"indicateurs": None, "bpe": None}

def _load_densite_data():
    """Charge en mémoire les CSV nécessaires au calcul de densité (lazy)."""
    import csv
    from pathlib import Path

    if _DENSITE_CACHE["indicateurs"] is None:
        ind_path = Path(__file__).parent.parent / "data" / "indicateurs_export.csv"
        ind = {}
        with open(ind_path, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                code = (row.get("CODGEO") or "").strip()
                if code:
                    ind[code] = row
        _DENSITE_CACHE["indicateurs"] = ind

    if _DENSITE_CACHE["bpe"] is None:
        bpe_path = Path(__file__).parent.parent / "data" / "bpe_communes.csv"
        bpe = {}
        with open(bpe_path, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                code = (row.get("CODGEO") or "").strip()
                if code:
                    bpe[code] = row
        _DENSITE_CACHE["bpe"] = bpe

    if _DENSITE_CACHE.get("age") is None:
        age_path = Path(__file__).parent.parent / "data" / "age_communes.csv"
        age = {}
        try:
            with open(age_path, encoding="utf-8") as f:
                for row in csv.DictReader(f):
                    code = (row.get("CODGEO") or "").strip()
                    if code:
                        age[code] = row
        except FileNotFoundError:
            pass
        _DENSITE_CACHE["age"] = age

    if _DENSITE_CACHE.get("filosofi") is None:
        filo_path = Path(__file__).parent.parent / "data" / "filosofi_communes.csv"
        filo = {}
        try:
            with open(filo_path, encoding="utf-8") as f:
                for row in csv.DictReader(f):
                    code = (row.get("codgeo") or row.get("CODGEO") or "").strip()
                    if code:
                        filo[code] = row
        except FileNotFoundError:
            pass
        _DENSITE_CACHE["filosofi"] = filo

    return _DENSITE_CACHE["indicateurs"], _DENSITE_CACHE["bpe"]


def _compute_valeur_densite(code_commune: str, type_densite: str) -> Optional[float]:
    """Calcule la valeur d'un indicateur de densité pour une commune."""
    ind_data, bpe_data = _load_densite_data()
    ind = ind_data.get(code_commune)
    bpe = bpe_data.get(code_commune)
    if not ind:
        return None

    def _to_float(v):
        try:
            return float(str(v).replace(",", "."))
        except (ValueError, TypeError):
            return None

    pop = _to_float(ind.get("P21_POP"))

    if type_densite == "seniors":
        age = _DENSITE_CACHE.get("age", {}).get(code_commune)
        if not age or not pop:
            return None
        s60 = 0.0
        for k in ("P21_POP6074", "P21_POP7589", "P21_POP90P"):
            v = _to_float(age.get(k))
            if v:
                s60 += v
        return round(100 * s60 / pop, 1)

    if type_densite == "jeunes":
        age = _DENSITE_CACHE.get("age", {}).get(code_commune)
        if not age or not pop:
            return None
        j = _to_float(age.get("P21_POP0014"))
        return round(100 * j / pop, 1) if j is not None else None

    if type_densite == "revenu":
        filo = _DENSITE_CACHE.get("filosofi", {}).get(code_commune)
        if not filo:
            return None
        return _to_float(filo.get("revenu_median"))

    if type_densite == "ges":
        route = _to_float(ind.get("ROUTE"))
        if route is None or not pop:
            return None
        return round(route / pop, 2)

    if type_densite == "ges_total":
        hors = _to_float(ind.get("GES_tot_HorsTransp")) or 0.0
        route = _to_float(ind.get("ROUTE")) or 0.0
        tot = hors + route
        if not pop or tot <= 0:
            return None
        return round(tot / pop, 2)

    surf_km2 = _to_float(ind.get("SURFKM2"))
    if not surf_km2 or surf_km2 <= 0:
        return None

    if type_densite == "pop":
        # hab/km²
        pop = _to_float(ind.get("P21_POP"))
        return round(pop / surf_km2, 1) if pop else None

    if type_densite == "equip":
        # équipements/km²
        total = _to_float(bpe.get("total")) if bpe else None
        return round(total / surf_km2, 2) if total else 0.0

    if type_densite == "sante":
        # équipements santé/km²
        sante = _to_float(bpe.get("sante")) if bpe else None
        return round(sante / surf_km2, 3) if sante else 0.0

    if type_densite == "commerces":
        com = _to_float(bpe.get("commerces")) if bpe else None
        return round(com / surf_km2, 3) if com else 0.0

    if type_densite == "artif":
        # % artificialisé (CLC11 en hectares, surface en km², 1 km² = 100 ha)
        clc = _to_float(ind.get("TOTALCLC11"))
        if clc is None:
            return None
        pct = (clc / (surf_km2 * 100)) * 100
        return round(min(100, pct), 1)

    return None


async def get_densite_communes_geojson(territoire: dict, type_densite: str) -> dict:
    """Retourne un GeoJSON FeatureCollection des communes du territoire
    avec leur valeur de densité dans properties.valeur."""
    import httpx

    # 1) Récupérer la liste des codes communes
    if territoire["type"] == "commune":
        codes_communes = [territoire["code"]]
    else:
        # EPCI : on demande à geo.api.gouv.fr la liste + contours
        codes_communes = territoire.get("codes_communes") or []
        if not codes_communes:
            # Fallback : récupérer via geo.api.gouv.fr
            try:
                r = httpx.get(
                    f"https://geo.api.gouv.fr/epcis/{territoire['code']}/communes",
                    params={"fields": "code"},
                    timeout=15.0,
                )
                if r.status_code == 200:
                    codes_communes = [c["code"] for c in r.json()]
            except Exception as e:
                print(f"[densite] Erreur fetch communes EPCI: {e}")
                return {"type": "FeatureCollection", "features": []}

    if not codes_communes:
        return {"type": "FeatureCollection", "features": []}

    # 2) Récupérer les contours en GeoJSON (une requête par commune via cache geo)
    from . import geo as geo_service

    features = []
    for code in codes_communes:
        try:
            fiche = await geo_service.resolve(code)
            if not fiche or not fiche.get("contour"):
                continue
            valeur = _compute_valeur_densite(code, type_densite)
            features.append({
                "type": "Feature",
                "geometry": fiche["contour"],
                "properties": {
                    "code": code,
                    "nom": fiche.get("nom", ""),
                    "valeur": valeur,
                    "type_densite": type_densite,
                },
            })
        except Exception as e:
            print(f"[densite] Skip commune {code}: {e}")
            continue

    return {"type": "FeatureCollection", "features": features}
