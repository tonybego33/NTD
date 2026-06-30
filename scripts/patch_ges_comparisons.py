#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Remplace la liste de comparaisons de l'etiquette ImpactCO2 par celle demandee
(tgv-paris-marseille, avion-pny, game-of-thrones, ter, biere, painauchocolat,
email, smartphone), en CONSERVANT la valeur dynamique du territoire ('?value=' + kg).

A lancer apres patch_ges_impactco2.py.
Idempotent + fail-safe. Sauvegarde app.js.bak_ges3.

    python3 scripts/patch_ges_comparisons.py
"""
import sys
from pathlib import Path

APP = Path("frontend/js/app.js")
if not APP.exists():
    print("ERREUR : frontend/js/app.js introuvable. Lance depuis la racine du repo.")
    sys.exit(1)

src = APP.read_text(encoding="utf-8")

NEW_LIST = "comparisons=tgv-paris-marseille,avion-pny,game-of-thrones,ter,biere,painauchocolat,email,smartphone"
OLD_LIST = "comparisons=avion-pny,tgv,ter,velo,smartphone"

if NEW_LIST in src:
    print("Deja applique. Rien a faire.")
    sys.exit(0)

n = src.count(OLD_LIST)
if n == 0:
    print("Ancre introuvable : la liste de comparaisons d'origine n'est pas presente.")
    print("As-tu bien lance patch_ges_impactco2.py avant ? Rien n'a ete modifie.")
    sys.exit(1)
if n > 1:
    print(f"Ancre ambigue (x{n}). Rien n'a ete modifie.")
    sys.exit(1)

out = src.replace(OLD_LIST, NEW_LIST, 1)
APP.with_suffix(".js.bak_ges3").write_text(src, encoding="utf-8")
APP.write_text(out, encoding="utf-8")

print("OK : liste de comparaisons remplacee (valeur du territoire conservee)")
print("  " + NEW_LIST)
print("Sauvegarde : app.js.bak_ges3")
print("\nVerifie :  node --check frontend/js/app.js")
