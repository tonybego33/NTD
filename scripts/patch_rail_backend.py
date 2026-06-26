#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ajoute la couche « rail » (voies ferrees, railway=rail via Overpass) cote backend :
  - backend/services/carto.py : fonction get_rail (calquee sur get_cyclable) + dispatch
  - backend/app.py            : autorise 'rail' dans la route /carto

Idempotent + fail-safe. Sauvegardes carto.py.bak_rail et app.py.bak_rail.

Lancer depuis la racine du repo :
    python3 scripts/patch_rail_backend.py
"""
import sys
import ast
from pathlib import Path

CARTO = Path("backend/services/carto.py")
APP = Path("backend/app.py")
for f in (CARTO, APP):
    if not f.exists():
        print(f"ERREUR : {f} introuvable. Lance depuis la racine du repo.")
        sys.exit(1)

carto = CARTO.read_text(encoding="utf-8")
app = APP.read_text(encoding="utf-8")

if "def get_rail" in carto and '"rail"' in app:
    print("Deja applique. Rien a faire.")
    sys.exit(0)

GET_RAIL = '''def get_rail(bbox: tuple) -> dict:
    """Voies ferrees (railway=rail) dans une bbox. Hors voies de service."""
    s, w, n, e = bbox
    key = f"rail_{s:.3f}_{w:.3f}_{n:.3f}_{e:.3f}"
    query = f"""
[out:json][timeout:60];
(
  way["railway"="rail"][!"service"]({s},{w},{n},{e});
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
        features.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coords},
            "properties": {
                "name": tags.get("name", ""),
                "categorie": "rail",
                "railway": tags.get("railway", ""),
            },
        })
    return {"type": "FeatureCollection", "features": features}


'''

ANCHOR_CARTO_FN = "def get_layers_for_territoire(territoire: dict, layers: list = None) -> dict:"
ANCHOR_CARTO_DISPATCH = (
    '    if "velo" in layers and bbox:\n'
    '        result["velo"] = get_cyclable(bbox)\n'
    '    return result'
)
NEW_CARTO_DISPATCH = (
    '    if "velo" in layers and bbox:\n'
    '        result["velo"] = get_cyclable(bbox)\n'
    '    if "rail" in layers and bbox:\n'
    '        result["rail"] = get_rail(bbox)\n'
    '    return result'
)
ANCHOR_APP = '("tc", "velo", "gares")'
NEW_APP = '("tc", "velo", "gares", "rail")'

problemes = []
if ANCHOR_CARTO_FN not in carto:
    problemes.append("  carto.py : ancre 'def get_layers_for_territoire' introuvable")
if carto.count(ANCHOR_CARTO_DISPATCH) != 1:
    problemes.append(f"  carto.py : bloc dispatch velo trouve {carto.count(ANCHOR_CARTO_DISPATCH)} fois (attendu 1)")
if app.count(ANCHOR_APP) != 1:
    problemes.append(f"  app.py : filtre layers '{ANCHOR_APP}' trouve {app.count(ANCHOR_APP)} fois (attendu 1)")

if problemes:
    print("Patch NON applique. Ancres a verifier :")
    print("\n".join(problemes))
    print("\nRien n'a ete modifie.")
    sys.exit(1)

new_carto = carto.replace(ANCHOR_CARTO_FN, GET_RAIL + ANCHOR_CARTO_FN, 1)
new_carto = new_carto.replace(ANCHOR_CARTO_DISPATCH, NEW_CARTO_DISPATCH, 1)
new_app = app.replace(ANCHOR_APP, NEW_APP, 1)

# Verif syntaxe avant ecriture
for label, txt in [("carto.py", new_carto), ("app.py", new_app)]:
    try:
        ast.parse(txt)
    except SyntaxError as ex:
        print(f"ERREUR : {label} ne compile pas apres patch ({ex}). Rien ecrit.")
        sys.exit(1)

CARTO.with_suffix(".py.bak_rail").write_text(carto, encoding="utf-8")
APP.with_suffix(".py.bak_rail").write_text(app, encoding="utf-8")
CARTO.write_text(new_carto, encoding="utf-8")
APP.write_text(new_app, encoding="utf-8")

print("OK :")
print("  - carto.py : get_rail ajoute + branche dans le dispatch")
print("  - app.py   : 'rail' autorise dans la route /carto")
print("Sauvegardes : carto.py.bak_rail / app.py.bak_rail")
print("\nApres ca : pkill -f uvicorn puis relance uvicorn backend.app:app")
