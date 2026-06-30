#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ajoute le symbole % a l'indicateur Variete de l'offre dans frontend/js/app.js :
  - le gros chiffre (ex "63" -> "63 %")
  - la ligne France / pairs (ex "France 55 · pairs 71" -> "... 55 % ... 71 %")
Aligne l'affichage de la variete sur celui de la couverture du socle.

Idempotent + fail-safe. Sauvegarde app.js.bak_pct.
    python3 scripts/patch_variete_pct.py
"""
import sys
from pathlib import Path

APP = Path("frontend/js/app.js")
if not APP.exists():
    print("ERREUR : frontend/js/app.js introuvable. Lance depuis la racine du repo.")
    sys.exit(1)

src = APP.read_text(encoding="utf-8")

EDITS = [
    (
        "gros chiffre variete + %",
        '<div class="v tabular">${mqFmt(eq.variete.v)}</div><div class="l">Variété de l\'offre</div>',
        '<div class="v tabular">${mqFmt(eq.variete.v)}<span class="u"> %</span></div><div class="l">Variété de l\'offre</div>',
    ),
    (
        "ref France/pairs variete + %",
        '<div class="ref">France ${mqFmt(eq.variete.fr)} · pairs ${mqFmt(eq.variete.pr)}</div>',
        '<div class="ref">France ${mqFmt(eq.variete.fr)} % · pairs ${mqFmt(eq.variete.pr)} %</div>',
    ),
]

if all(new in src for _, _, new in EDITS):
    print("Deja applique. Rien a faire.")
    sys.exit(0)

problemes = []
for label, old, new in EDITS:
    if new in src:
        continue
    n = src.count(old)
    if n != 1:
        problemes.append(f"  [{'ABSENTE' if n == 0 else f'AMBIGUE x{n}'}] {label}")

if problemes:
    print("Patch NON applique. Ancres a verifier :")
    print("\n".join(problemes))
    print("\nColle-moi la ligne reelle pour ajuster. Le fichier n'a PAS ete modifie.")
    sys.exit(1)

out = src
done = []
for label, old, new in EDITS:
    if new in out:
        continue
    out = out.replace(old, new, 1)
    done.append(label)

APP.with_suffix(".js.bak_pct").write_text(src, encoding="utf-8")
APP.write_text(out, encoding="utf-8")

print("OK : % ajoute a la variete")
for d in done:
    print("  - " + d)
print("Sauvegarde : app.js.bak_pct")
print("\nVerifie :  node --check frontend/js/app.js")
