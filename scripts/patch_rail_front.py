#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ajoute la couche « Voies ferrees » (rail) au menu Mobilite de la carto, en trait
ROUGE AREP, distinct du velo. Cote front uniquement (frontend/js/carto.js).
Le rendu LineString existant trace deja la couche ; on l'enregistre dans les
couleurs / le menu, et on l'exclut du buffer (comme le velo).

Idempotent + fail-safe. Sauvegarde carto.js.bak_rail.

Lancer depuis la racine du repo :
    python3 scripts/patch_rail_front.py
"""
import sys
from pathlib import Path

CARTO = Path("frontend/js/carto.js")
if not CARTO.exists():
    print("ERREUR : frontend/js/carto.js introuvable. Lance depuis la racine du repo.")
    sys.exit(1)

src = CARTO.read_text(encoding="utf-8")

if "'Voies ferrées'" in src or "['rail'," in src:
    print("Deja applique. Rien a faire.")
    sys.exit(0)

EDITS = [
    # 1. menu Mobilite : ajout de l'entree rail
    (
        "menu Mobilite : ajout Voies ferrees",
        "mobilite: [['tc', 'Arrêts TC'], ['velo', 'Pistes cyclables'], ['gares', 'Gares']],",
        "mobilite: [['tc', 'Arrêts TC'], ['velo', 'Pistes cyclables'], ['gares', 'Gares'], ['rail', 'Voies ferrées']],",
    ),
    # 2. POICOLOR : couleur rail (rouge AREP)
    (
        "POICOLOR : rail",
        "gares: 'var(--eau)', velo: '#1f9d55' };",
        "gares: 'var(--eau)', velo: '#1f9d55', rail: '#e2001a' };",
    ),
    # 3. POIHEX : hex rail
    (
        "POIHEX : rail",
        "gares: '#16798c', velo: '#1f9d55' };",
        "gares: '#16798c', velo: '#1f9d55', rail: '#e2001a' };",
    ),
    # 4. POINAME : libelle rail
    (
        "POINAME : rail",
        "velo: 'Pistes cyclables', gares: 'Gares' };",
        "velo: 'Pistes cyclables', gares: 'Gares', rail: 'Voies ferrées' };",
    ),
    # 5. style des lignes : rail un peu plus epais et plus opaque
    (
        "style LineString : emphase rail",
        "L.geoJSON(f, { style: { color: hex, weight: 3, opacity: 0.85 } }).addTo(group);",
        "L.geoJSON(f, { style: { color: hex, weight: cat === 'rail' ? 3.6 : 3, opacity: cat === 'rail' ? 0.92 : 0.85 } }).addTo(group);",
    ),
    # 6. buffer : exclure rail (comme velo, ce sont des lignes)
    (
        "buffer : exclure rail",
        "|| [])].filter(c => c !== 'velo')",
        "|| [])].filter(c => c !== 'velo' && c !== 'rail')",
    ),
    # 7. points a bufferiser : exclure rail aussi
    (
        "ptCats : exclure rail",
        "sub.filter(c => c !== 'velo')",
        "sub.filter(c => c !== 'velo' && c !== 'rail')",
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

CARTO.with_suffix(".js.bak_rail").write_text(src, encoding="utf-8")
out = src
for label, old, new in EDITS:
    out = out.replace(old, new, 1)
CARTO.write_text(out, encoding="utf-8")

print(f"OK : {len(EDITS)} edits appliques sur frontend/js/carto.js")
print("  - 'Voies ferrées' ajoute sous Mobilite, en trait rouge AREP")
print("Sauvegarde : carto.js.bak_rail")
print("\nVerifie :  node --check frontend/js/carto.js")
print("Si erreur :  cp frontend/js/carto.js.bak_rail frontend/js/carto.js")
