#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Applique les corrections de libelles demandees par Fabien (annotations CAPTURE.pptx)
sur frontend/js/app.js. Uniquement du wording, aucune logique touchee.

Idempotent (skip si deja applique) + fail-safe (n'ecrit rien si une ancre manque).
Sauvegarde frontend/js/app.js.bak.

Lancer depuis la racine du repo :
    python3 scripts/patch_fabien_wording.py
"""
import sys
from pathlib import Path

APP = Path("frontend/js/app.js")
if not APP.exists():
    print("ERREUR : frontend/js/app.js introuvable. Lance le script depuis la racine du repo.")
    sys.exit(1)

src = APP.read_text(encoding="utf-8")

if "sont présents dans la Commune" in src:
    print("Deja applique. Rien a faire.")
    sys.exit(0)

# (label, ancien, nouveau)  -- chaque ancien doit apparaitre exactement une fois
EDITS = [
    (
        "densite : retirer les libelles Tres peu dense / Tres dense",
        '<div class="gauge-scale"><span>Très peu dense</span><span>Très dense</span></div>',
        '',
    ),
    (
        "socle : titre du pave -> Equipements et services du quotidien",
        '<span class="acc-title">Socle d\'équipements</span>',
        '<span class="acc-title">Équipements et services du quotidien</span>',
    ),
    (
        "socle : unite '% du socle' -> '% sont presents dans la Commune'",
        '<span class="u">% du socle</span>',
        '<span class="u">% sont présents dans la Commune</span>',
    ),
    (
        "socle : note 'Presence des 31...' -> 'Part existante sur les 31 types...'",
        'Présence des 31 équipements essentiels du quotidien',
        'Part existante sur les 31 types d\'équipements du quotidien',
    ),
    (
        "gare : note desserte -> accessibilite",
        'Marqueur de desserte ferroviaire du territoire.',
        "Marqueur d'accessibilité des équipements et services pour d'autres communes et de facilité d'accès pour les résidents à d'autres pôles d'activités et de services.",
    ),
    (
        "section 02 : titre -> Niveau d'equipements",
        "title: 'Accessibilité aux équipements'",
        "title: 'Niveau d\\'équipements'",
    ),
    (
        "equip (colonne) : note 'Presence des 31 de base' -> 'Part existante sur les 31 types'",
        'Présence des 31 équipements de base, peu importe leur nombre.',
        'Part existante sur les 31 types d\'équipements, peu importe leur nombre.',
    ),
    (
        "mobilite : retirer le badge 'futur malus'",
        ' <span class="malus">futur malus</span>',
        '',
    ),
    (
        "artif : libelle stock -> Part du territoire artificialisee / CLC 2018",
        '<div class="cell-label">Part du territoire déjà artificialisée · Corine Land Cover</div>',
        '<div class="cell-label">Part du territoire artificialisée · CLC 2018</div>',
    ),
    (
        "artif : libelle flux -> Artificialisation nouvelle 2015 - 2021",
        '<div class="cell-label">Consommé sur 2015–2021 · artificialisation nouvelle</div>',
        '<div class="cell-label">Artificialisation nouvelle 2015 - 2021</div>',
    ),
    (
        "artif : jauge MOINS/PLUS artificialise -> d'artificialisation",
        '<span>moins artificialisé</span><span>plus artificialisé</span>',
        "<span>moins d'artificialisation</span><span>plus d'artificialisation</span>",
    ),
]

# Verification fail-safe
problemes = []
for label, old, new in EDITS:
    n = src.count(old)
    if n == 0:
        problemes.append(f"  [ABSENTE] {label}")
    elif n > 1:
        problemes.append(f"  [AMBIGUE x{n}] {label}")

if problemes:
    print("Patch NON applique. Ancres a verifier :")
    print("\n".join(problemes))
    print("\nLe fichier n'a PAS ete modifie.")
    sys.exit(1)

APP.with_suffix(".js.bak").write_text(src, encoding="utf-8")

out = src
for label, old, new in EDITS:
    out = out.replace(old, new, 1)

APP.write_text(out, encoding="utf-8")
print(f"OK : {len(EDITS)} corrections de libelles appliquees sur frontend/js/app.js")
print("Sauvegarde : frontend/js/app.js.bak")
print("\nVerifie :  node --check frontend/js/app.js")
print("Si erreur :  cp frontend/js/app.js.bak frontend/js/app.js")
