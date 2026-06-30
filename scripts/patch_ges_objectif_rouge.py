#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Deux retouches dans frontend/js/app.js :
  1. Le rapport a l'objectif 2050 (X × l'objectif) ressort en gras + rouge AREP.
  2. Retrait du texte "· la dernière marque la fraction" sous le stadometre.

Idempotent + fail-safe. Sauvegarde app.js.bak_ges2.

Lancer depuis la racine du repo :
    python3 scripts/patch_ges_objectif_rouge.py
"""
import sys
from pathlib import Path

APP = Path("frontend/js/app.js")
if not APP.exists():
    print("ERREUR : frontend/js/app.js introuvable. Lance depuis la racine du repo.")
    sys.exit(1)

src = APP.read_text(encoding="utf-8")

EDITS = [
    # 1. ratio objectif en gras + rouge AREP
    (
        "ratio objectif en rouge",
        '`<b>${mqComma(_ratio.toFixed(1))} ×</b> l\'objectif`',
        '`<b style="color:#e2001a">${mqComma(_ratio.toFixed(1))} ×</b> <b style="color:#e2001a">l\'objectif</b>`',
    ),
    # 2. retrait du texte sur la fraction
    (
        "retrait mention fraction",
        ' · la dernière marque la fraction',
        '',
    ),
]

# verif idempotence / presence
already = []
problemes = []
for label, old, new in EDITS:
    n = src.count(old)
    if n == 0:
        # peut etre deja applique (edit 1) ou deja retire (edit 2)
        already.append(label)
    elif n > 1:
        problemes.append(f"  [AMBIGUE x{n}] {label}")

if problemes:
    print("Patch NON applique. Ancres a verifier :")
    print("\n".join(problemes))
    print("\nLe fichier n'a PAS ete modifie.")
    sys.exit(1)

if len(already) == len(EDITS):
    print("Deja applique. Rien a faire.")
    sys.exit(0)

out = src
done = []
for label, old, new in EDITS:
    if src.count(old) == 1:
        out = out.replace(old, new, 1)
        done.append(label)

APP.with_suffix(".js.bak_ges2").write_text(src, encoding="utf-8")
APP.write_text(out, encoding="utf-8")

print("OK :")
for d in done:
    print("  - " + d)
if already:
    print("Deja en place (ignores) : " + ", ".join(already))
print("Sauvegarde : app.js.bak_ges2")
print("\nVerifie :  node --check frontend/js/app.js")
