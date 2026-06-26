#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Trois ajustements demandes par Fabien qui touchent au calcul / a l'affichage,
sur frontend/js/app.js :
  1. Indice de jeunesse : moins de 30 ans (00-14 + 15-29) au lieu de moins de 15.
  2. Reglette France/Pairs ajoutee sous le m2/habitant (comme les autres paves).
  3. Ventilation par usage : preciser que « Autres » = activite + tertiaire.

Idempotent (skip si deja applique) + fail-safe (n'ecrit rien si une ancre manque).
Sauvegarde frontend/js/app.js.bak3.

Lancer depuis la racine du repo :
    python3 scripts/patch_fabien_struct.py
"""
import sys
from pathlib import Path

APP = Path("frontend/js/app.js")
if not APP.exists():
    print("ERREUR : frontend/js/app.js introuvable. Lance depuis la racine du repo.")
    sys.exit(1)

src = APP.read_text(encoding="utf-8")

if "moins de 30 ans" in src:
    print("Deja applique. Rien a faire.")
    sys.exit(0)

# Reglette inseree apres la valeur m2/hab (IIFE dans le template literal).
REGLETTE = (
    '\n        ${(() => { const v=+ar.parHab||0, fr=ar.frHab!=null?+ar.frHab:null, pr=ar.prHab!=null?+ar.prHab:null;'
    ' if(fr==null&&pr==null) return ""; const scl=Math.ceil(Math.max(v,fr||0,pr||0,1)*1.12/5)*5;'
    ' const p=x=>(x!=null&&scl>0)?Math.min(100,+(x/scl*100).toFixed(1)):0;'
    ' return `<div class="track" style="margin-top:10px"><i data-w="${p(v).toFixed(1)}" style="background:var(--terre)"></i>'
    '<span class="tick fr" data-pos="${p(fr).toFixed(1)}"></span><span class="tick pr" data-pos="${p(pr).toFixed(1)}"></span></div>`; })()}'
)

EDITS = [
    # 1. indice de jeunesse : calcul moins de 30 ans
    (
        "indice jeunesse : calcul -> moins de 30 ans",
        'const jeu = k => (a[0]?.[k] || 0);',
        'const jeu = k => (a[0]?.[k] || 0) + (a[1]?.[k] || 0);',
    ),
    (
        "indice jeunesse : commentaire",
        '// moins de 15 ans',
        '// moins de 30 ans',
    ),
    (
        "indice jeunesse : note du panneau",
        'Nombre de jeunes de moins de 15 ans pour 100 personnes de 60 ans et plus.',
        'Nombre de jeunes de moins de 30 ans pour 100 personnes de 60 ans et plus.',
    ),
    (
        "indice jeunesse : unite affichee",
        'jeunes (&lt;15 ans) pour 100 seniors (60+)',
        'jeunes (&lt;30 ans) pour 100 seniors (60+)',
    ),
    # 2. reglette sur le m2/hab : on insere apres la div de la valeur
    (
        "m2/hab : reglette France/Pairs",
        '<span style="font-size:13px;color:var(--ink-3);font-weight:600">m² · 2015–2021</span></div>',
        '<span style="font-size:13px;color:var(--ink-3);font-weight:600">m² · 2015–2021</span></div>' + REGLETTE,
    ),
    # 3. ventilation : note « Autres » = activite + tertiaire
    (
        "ventilation : note Autres = activite + tertiaire",
        '        <span><i style="background:var(--ink-4)"></i>Autres <b style="font-weight:800;margin-left:5px">${pA}%</b></span>\n      </div>` : \'\'}',
        '        <span><i style="background:var(--ink-4)"></i>Autres <b style="font-weight:800;margin-left:5px">${pA}%</b></span>\n      </div>\n      <div style="font-size:11px;color:var(--ink-3);margin-top:8px;line-height:1.4">« Autres » regroupe l\'artificialisation à usage d\'activité et de tertiaire.</div>` : \'\'}',
    ),
]

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

APP.with_suffix(".js.bak3").write_text(src, encoding="utf-8")

out = src
for label, old, new in EDITS:
    out = out.replace(old, new, 1)

APP.write_text(out, encoding="utf-8")
print(f"OK : {len(EDITS)} ajustements appliques sur frontend/js/app.js")
print("  1. indice de jeunesse -> moins de 30 ans (00-14 + 15-29)")
print("  2. reglette France/Pairs ajoutee sous le m2/hab")
print("  3. note « Autres » = activite + tertiaire")
print("Sauvegarde : frontend/js/app.js.bak3")
print("\nVerifie :  node --check frontend/js/app.js")
print("Si erreur :  cp frontend/js/app.js.bak3 frontend/js/app.js")
