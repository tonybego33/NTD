#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Agrandit le bloc objectif 2050 (GES) dans frontend/js/app.js et met le ratio
(ex "3,5 ×") nettement en avant : plus gros, gras, rouge AREP.

  - "Objectif 2050"            : 11px -> 13px
  - "2 tCO₂e par habitant..."  : 13px -> 16px
  - ligne "Cible compatible..."   : 12px -> 14px
  - ratio "X ×"                : grand (18px), gras, rouge

Idempotent + fail-safe. Sauvegarde app.js.bak_objsize.
    python3 scripts/patch_objectif_taille.py
"""
import sys
from pathlib import Path

APP = Path("frontend/js/app.js")
if not APP.exists():
    print("ERREUR : frontend/js/app.js introuvable. Lance depuis la racine du repo.")
    sys.exit(1)

src = APP.read_text(encoding="utf-8")

# --- tailles (ancres = sorties du patch GES) ---
SIMPLE = [
    ("Objectif 2050 -> 13px",
     '<span style="font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--terre)">Objectif 2050</span>',
     '<span style="font-size:13px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--terre)">Objectif 2050</span>'),
    ("2 tCO2e -> 16px",
     '<span style="font-size:13px;font-weight:700">2 tCO₂e par habitant et par an</span>',
     '<span style="font-size:16px;font-weight:700">2 tCO₂e par habitant et par an</span>'),
    ("ligne cible -> 14px",
     '<div style="font-size:12px;color:var(--ink-3);margin-top:4px;line-height:1.45">Cible compatible',
     '<div style="font-size:14px;color:var(--ink-3);margin-top:4px;line-height:1.5">Cible compatible'),
]

# --- ratio en avant : gere l'etat rouge (patch deja passe) OU non rouge ---
RATIO_TARGET = '<b style="color:#e2001a;font-size:19px;vertical-align:-1px">${mqComma(_ratio.toFixed(1))} ×</b>'
RATIO_VARIANTS = [
    '<b style="color:#e2001a">${mqComma(_ratio.toFixed(1))} ×</b>',  # apres patch rouge
    '<b>${mqComma(_ratio.toFixed(1))} ×</b>',                          # sans patch rouge
]

# idempotence
done_already = (RATIO_TARGET in src) and all(new in src for _, _, new in SIMPLE)
if done_already:
    print("Deja applique. Rien a faire.")
    sys.exit(0)

problemes = []
for label, old, new in SIMPLE:
    if new in src:
        continue
    n = src.count(old)
    if n != 1:
        problemes.append(f"  [{'ABSENTE' if n == 0 else f'AMBIGUE x{n}'}] {label}")

ratio_ok = RATIO_TARGET in src or any(src.count(v) == 1 for v in RATIO_VARIANTS)
if not ratio_ok:
    problemes.append("  [ABSENTE] ratio (3,5 ×)")

if problemes:
    print("Patch NON applique. Ancres a verifier :")
    print("\n".join(problemes))
    print("\nColle-moi la ligne du ratio si besoin. Le fichier n'a PAS ete modifie.")
    sys.exit(1)

out = src
done = []
for label, old, new in SIMPLE:
    if new not in out:
        out = out.replace(old, new, 1); done.append(label)

if RATIO_TARGET not in out:
    for v in RATIO_VARIANTS:
        if out.count(v) == 1:
            out = out.replace(v, RATIO_TARGET, 1); done.append("ratio en avant (19px, rouge)")
            break

APP.with_suffix(".js.bak_objsize").write_text(src, encoding="utf-8")
APP.write_text(out, encoding="utf-8")
print("OK : bloc objectif 2050 agrandi")
for d in done: print("  - " + d)
print("Sauvegarde : app.js.bak_objsize")
print("\nVerifie :  node --check frontend/js/app.js")
