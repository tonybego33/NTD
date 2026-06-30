#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Corrige les definitions des indicateurs equipements dans frontend/js/app.js.
Version robuste : pour les deux blocs inline, on ancre sur le TEXTE et on absorbe
le style inline quel qu'il soit (le font-size du repo peut differer), puis on
force font-size:13px (lisibilite).

Idempotent + fail-safe. Sauvegarde app.js.bak_txt2.
    python3 scripts/patch_equip_textes.py
"""
import re
import sys
from pathlib import Path

APP = Path("frontend/js/app.js")
if not APP.exists():
    print("ERREUR : frontend/js/app.js introuvable. Lance depuis la racine du repo.")
    sys.exit(1)

src = APP.read_text(encoding="utf-8")
NEW_STYLE = 'font-size:13px;color:var(--ink-3);margin:1px 0 5px;line-height:1.4'

SOCLE_OLD = "Part existante sur les 31 types d'équipements du quotidien (mairie, médecin, école, boulangerie…), pondérés selon leur importance. Mesure la diversité des services présents, pas leur nombre."
SOCLE_NEW = "Part du poids des 31 équipements essentiels du quotidien (mairie, médecin, école, boulangerie…) présents sur le territoire. Chaque type compte selon son importance, et on regarde sa présence, pas le nombre d'équipements."

COUV_TXT_OLD = "Les essentiels sont-ils là ? Part existante sur les 31 types d'équipements, peu importe leur nombre."
COUV_TXT_NEW = "Les essentiels sont-ils là ? Part du poids des 31 types essentiels couverte, chaque type pondéré selon son importance."

VAR_TXT_OLD = "L'offre est-elle diversifiée ? Nombre de types d'équipements différents présents."
VAR_TXT_NEW = "L'offre est-elle diversifiée ? Part des types d'équipements présents, tous comptés à égalité, sans pondération."

def inline_pattern(txt_old):
    return r'<div style="[^"]*">' + re.escape(txt_old) + r'</div>'
def inline_repl(txt_new):
    return '<div style="' + NEW_STYLE + '">' + txt_new + '</div>'

if SOCLE_NEW in src and COUV_TXT_NEW in src and VAR_TXT_NEW in src:
    print("Deja applique. Rien a faire.")
    sys.exit(0)

problemes = []
if SOCLE_NEW not in src and src.count(SOCLE_OLD) != 1:
    problemes.append(f"  [{'ABSENTE' if SOCLE_OLD not in src else 'AMBIGUE'}] socle (.acc-note)")
if COUV_TXT_NEW not in src:
    n = len(re.findall(inline_pattern(COUV_TXT_OLD), src))
    if n != 1:
        problemes.append(f"  [{'ABSENTE' if n == 0 else f'AMBIGUE x{n}'}] couverture (KPI inline)")
if VAR_TXT_NEW not in src:
    n = len(re.findall(inline_pattern(VAR_TXT_OLD), src))
    if n != 1:
        problemes.append(f"  [{'ABSENTE' if n == 0 else f'AMBIGUE x{n}'}] variete (KPI inline)")

if problemes:
    print("Patch NON applique. Ancres a verifier :")
    print("\n".join(problemes))
    print("\nColle-moi la ligne reelle concernee pour que j'ajuste l'ancre.")
    print("Le fichier n'a PAS ete modifie.")
    sys.exit(1)

out = src
done = []
if SOCLE_NEW not in out:
    out = out.replace(SOCLE_OLD, SOCLE_NEW, 1); done.append("socle (.acc-note)")
if COUV_TXT_NEW not in out:
    out = re.sub(inline_pattern(COUV_TXT_OLD), inline_repl(COUV_TXT_NEW), out, count=1); done.append("couverture (inline, 13px)")
if VAR_TXT_NEW not in out:
    out = re.sub(inline_pattern(VAR_TXT_OLD), inline_repl(VAR_TXT_NEW), out, count=1); done.append("variete (inline, 13px)")

APP.with_suffix(".js.bak_txt2").write_text(src, encoding="utf-8")
APP.write_text(out, encoding="utf-8")
print("OK : textes corriges")
for d in done: print("  - " + d)
print("Sauvegarde : app.js.bak_txt2")
print("\nVerifie :  node --check frontend/js/app.js")
print("\nPour agrandir aussi ecole / gare / socle (classe .acc-note),")
print("ajoute a la fin de ton style.css :")
print('  #diag-root .acc-note { font-size: 13px; line-height: 1.5; }')
