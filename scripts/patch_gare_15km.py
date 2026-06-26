#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fait passer le rayon gare de 3 km a 1,5 km (comme l'ecole), proprement :
  - scripts/compute_gares_3km.py : RAYON_M = 3000 -> 1500 + libelles d'execution
  - frontend/js/app.js           : les deux libelles "3 km" -> "1,5 km"

Les NOMS de colonnes internes (pct_habitat_gare_3 / pct_equipements_gare_3)
restent inchanges : ce sont des cles techniques que personne ne voit. Renommer
en _gare_15 serait plus propre mais inutile pour la presentation (a faire apres).

Idempotent + fail-safe. Sauvegardes .bak_gare15.

Lancer depuis la racine du repo :
    python3 scripts/patch_gare_15km.py

APRES ce patch, dans l'ordre :
    python3 scripts/compute_gares_3km.py      # recalcul (quelques minutes)
    python3 scripts/precompute_cache.py       # reconstruction du pickle
    pkill -9 -f uvicorn; sleep 2
    uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000
"""
import sys
import ast
from pathlib import Path

COMPUTE = Path("scripts/compute_gares_3km.py")
APP = Path("frontend/js/app.js")
for f in (COMPUTE, APP):
    if not f.exists():
        print(f"ERREUR : {f} introuvable. Lance depuis la racine du repo.")
        sys.exit(1)

compute = COMPUTE.read_text(encoding="utf-8")
app = APP.read_text(encoding="utf-8")

if "RAYON_M = 1500" in compute:
    print("Deja applique (RAYON_M = 1500). Rien a faire.")
    sys.exit(0)

# --- edits compute script ---
EDITS_COMPUTE = [
    ("rayon constante", "RAYON_M = 3000", "RAYON_M = 1500"),
    ("titre execution", "=== Proximite gares (3 km)", "=== Proximite gares (1,5 km)"),
    ("docstring calcul", "Calcule, à moins de 3 km", "Calcule, à moins de 1,5 km"),
]
# --- edits front (À majuscule = titre ligne 1662 ; à minuscule = note ligne 1663) ---
EDITS_APP = [
    ("titre accordeon", "À moins de 3 km", "À moins de 1,5 km"),
    ("note accordeon", "à moins de 3 km", "à moins de 1,5 km"),
]

problemes = []
for label, old, _ in EDITS_COMPUTE:
    n = compute.count(old)
    if n != 1:
        problemes.append(f"  compute : [{'ABSENTE' if n == 0 else f'AMBIGUE x{n}'}] {label}")
for label, old, _ in EDITS_APP:
    n = app.count(old)
    if n != 1:
        problemes.append(f"  app.js  : [{'ABSENTE' if n == 0 else f'AMBIGUE x{n}'}] {label}")

if problemes:
    print("Patch NON applique. Ancres a verifier :")
    print("\n".join(problemes))
    print("\nRien n'a ete modifie.")
    sys.exit(1)

new_compute = compute
for _, old, new in EDITS_COMPUTE:
    new_compute = new_compute.replace(old, new, 1)
new_app = app
for _, old, new in EDITS_APP:
    new_app = new_app.replace(old, new, 1)

# verif syntaxe du script python
try:
    ast.parse(new_compute)
except SyntaxError as ex:
    print(f"ERREUR : compute_gares_3km.py ne compile pas apres patch ({ex}). Rien ecrit.")
    sys.exit(1)

COMPUTE.with_suffix(".py.bak_gare15").write_text(compute, encoding="utf-8")
APP.with_suffix(".js.bak_gare15").write_text(app, encoding="utf-8")
COMPUTE.write_text(new_compute, encoding="utf-8")
APP.write_text(new_app, encoding="utf-8")

print("OK :")
print("  - compute_gares_3km.py : RAYON_M -> 1500 (+ libelles d'execution)")
print("  - app.js               : 2 libelles '3 km' -> '1,5 km'")
print("Sauvegardes : .py.bak_gare15 / .js.bak_gare15")
print("\nEnsuite, dans l'ordre :")
print("  python3 scripts/compute_gares_3km.py")
print("  python3 scripts/precompute_cache.py")
print("  pkill -9 -f uvicorn; sleep 2")
print("  uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000")
print("\nVerifie aussi :  node --check frontend/js/app.js")
