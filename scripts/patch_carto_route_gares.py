#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ajoute une branche `gares` a la route /carto de backend/app.py.
Insere le bloc juste avant 'Couches equipements BPE24 (Sante / Commerces)'.
Sert les gares depuis backend/data/gares_epci.json (meme forme que ecoles).

Idempotent (skip si deja applique) + fail-safe (n'ecrit rien si l'ancre manque).
Sauvegarde backend/app.py.bak.

Lancer depuis la racine du repo :
    python3 scripts/patch_carto_route_gares.py
"""
import sys
from pathlib import Path

APP = Path("backend/app.py")
if not APP.exists():
    print("ERREUR : backend/app.py introuvable. Lance le script depuis la racine du repo.")
    sys.exit(1)

src = APP.read_text(encoding="utf-8")

if "gares_epci.json" in src:
    print("Deja applique (gares_epci.json present dans app.py). Rien a faire.")
    sys.exit(0)

ANCHOR = "Couches équipements BPE24"
lines = src.splitlines(keepends=True)
idx = next((i for i, ln in enumerate(lines) if ANCHOR in ln), None)
if idx is None:
    print(f"ERREUR : ancre '{ANCHOR}' introuvable dans la route /carto. Rien ecrit.")
    print("Colle-moi ta route /carto si elle a change.")
    sys.exit(1)

BRANCH = '''    # ─── Couche gares (BPE24 : E107/E108/E109) ───
    if "gares" in (layers or ""):
        import json as _json
        from pathlib import Path as _Path
        _g_file = _Path(__file__).parent / "data" / "gares_epci.json"
        if _g_file.exists():
            try:
                _data = _json.loads(_g_file.read_text())
                _epcis_dict = _data.get("epcis", _data)
                _c2e = _data.get("commune_to_epci", {})
                _lookup_code = _c2e.get(code, code)
                _gares = _epcis_dict.get(_lookup_code, [])
                _features = [
                    {
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [g["lon"], g["lat"]]},
                        "properties": {"libcom": g.get("libcom", ""), "nom": g.get("nom", "")},
                    }
                    for g in _gares
                ]
                return {"gares": {"type": "FeatureCollection", "features": _features}}
            except Exception as _e:
                return {"gares": {"type": "FeatureCollection", "features": []}, "error": str(_e)}
        else:
            return {"gares": {"type": "FeatureCollection", "features": []}, "error": "gares_epci.json absent"}

'''

lines.insert(idx, BRANCH)

# Sauvegarde puis ecriture
APP.with_suffix(".py.bak").write_text(src, encoding="utf-8")
APP.write_text("".join(lines), encoding="utf-8")

# Verif de syntaxe immediate
import ast
try:
    ast.parse(APP.read_text(encoding="utf-8"))
except SyntaxError as e:
    APP.write_text(src, encoding="utf-8")  # rollback
    print(f"ERREUR de syntaxe apres patch ({e}). app.py restaure, rien modifie.")
    sys.exit(1)

print("OK : branche 'gares' ajoutee a la route /carto.")
print("Sauvegarde : backend/app.py.bak")
print("\nRelance uvicorn pour charger le changement :")
print("    pkill -f uvicorn        # puis relance ta commande habituelle")
