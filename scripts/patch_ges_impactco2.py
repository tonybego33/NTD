#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Bloc GES : ajoute deux choses dans frontend/js/app.js (section environnement)
  1. Au-dessus du total GES : un rappel de l'objectif 2050 (2 tCO2e/hab/an),
     avec le positionnement du territoire (X fois l'objectif, ou deja sous).
  2. En dessous du total GES : l'etiquette animee ImpactCO2 (ADEME), alimentee
     avec la vraie valeur du territoire (gesTotPerHab en tonnes -> kg), pour
     traduire les emissions en equivalents concrets (avion Paris-NY, TGV, etc.).
     Source ADEME / ImpactCO2 citee sous l'etiquette.

Le script ImpactCO2 est injecte dynamiquement dans le hook post-rendu
mqAnimateSection (une balise <script> dans de l'innerHTML ne s'execute pas).

Idempotent + fail-safe. Sauvegarde app.js.bak_ges.

Lancer depuis la racine du repo :
    python3 scripts/patch_ges_impactco2.py
"""
import sys
from pathlib import Path

APP = Path("frontend/js/app.js")
if not APP.exists():
    print("ERREUR : frontend/js/app.js introuvable. Lance depuis la racine du repo.")
    sys.exit(1)

src = APP.read_text(encoding="utf-8")

if "gesEtiquette" in src or "ges-objectif" in src:
    print("Deja applique. Rien a faire.")
    sys.exit(0)

# --- 1. Definitions (inserees juste avant le return de mqRenderEnv) ---
ANCHOR_CONST = "  const stockPct = ar.surfKm2 > 0 ? Math.min(100, +(ar.stockHa / ar.surfKm2).toFixed(1)) : null;"
CONST_BLOCK = ANCHOR_CONST + """
  // --- GES : rappel objectif 2050 + etiquette ImpactCO2 (ADEME) ---
  const _ges = +e.gesTotPerHab || 0, _obj = 2;
  const _ratio = _ges > 0 ? _ges / _obj : 0;
  const gesObjLine = `<div class="ges-objectif" style="background:var(--paper,#f5f4f2);border:1px solid var(--line,#e4e3e0);border-radius:10px;padding:11px 13px;margin-bottom:16px">
      <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
        <span style="font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--terre)">Objectif 2050</span>
        <span style="font-size:13px;font-weight:700">2 tCO₂e par habitant et par an</span>
      </div>
      <div style="font-size:12px;color:var(--ink-3);margin-top:4px;line-height:1.45">Cible compatible avec la neutralité carbone (SNBC).${_ges > 0 ? ` Ce territoire émet <b>${mqComma(_ges.toFixed(1))}</b> tCO₂e/hab, soit ${_ges > _obj ? `<b>${mqComma(_ratio.toFixed(1))} ×</b> l'objectif` : `<b>déjà sous</b> l'objectif`}.` : ''}</div>
    </div>`;
  const _gesKg = Math.round(_ges * 1000);
  const gesEtiquette = `<div style="margin-top:4px">
      <div style="font-size:12px;color:var(--ink-3);margin-bottom:8px;line-height:1.45">À quoi correspondent ces <b>${mqComma(_ges.toFixed(1))} tCO₂e par habitant</b> ?</div>
      <div id="gesEtiquette" data-kg="${_gesKg}"></div>
      <div style="font-size:10.5px;color:var(--ink-4);margin-top:7px">Équivalences <b>ImpactCO2</b> · données ADEME</div>
    </div>`;"""

# --- 2. Rappel objectif AU-DESSUS du total GES ---
ANCHOR_PANEL = '      <div class="panel-head"><span class="panel-title">Émissions GES par habitant</span><span class="src">ADEME · inventaire territorial</span></div>'
NEW_PANEL = '      ${gesObjLine}\n' + ANCHOR_PANEL

# --- 3. Etiquette EN DESSOUS du total (apres la legende France/Pairs, avant la repartition) ---
_LEG = '      <div class="legend"><span><i class="line"></i>France</span><span><i class="line pr"></i>Pairs</span></div>'
ANCHOR_LEGEND = _LEG + '\n      <div class="divider-h"></div>\n      <div class="panel-head"><span class="panel-title">Répartition des émissions</span>'
NEW_LEGEND = _LEG + '\n      ${gesEtiquette}\n      <div class="divider-h"></div>\n      <div class="panel-head"><span class="panel-title">Répartition des émissions</span>'

# --- 4. Hook post-rendu : injection dynamique du script ImpactCO2 ---
ANCHOR_HOOK = "  const dn = sec.querySelector('#gesDonut'); if (dn && !dn.dataset.done) { dn.dataset.done = 1; mqDrawDonut(dn); }"
HOOK_BLOCK = ANCHOR_HOOK + """
  const et = sec.querySelector('#gesEtiquette');
  if (et && !et.dataset.done) {
    et.dataset.done = 1;
    const kg = et.dataset.kg || 2000;
    const sc = document.createElement('script');
    sc.setAttribute('data-name', 'impact-co2');
    sc.src = 'https://impactco2.fr/iframe.js';
    sc.setAttribute('data-type', 'comparateur/etiquette-animee');
    sc.setAttribute('data-search', '?value=' + kg + '&comparisons=avion-pny,tgv,ter,velo,smartphone&language=fr&theme=default');
    et.appendChild(sc);
  }"""

EDITS = [
    ("definitions GES", ANCHOR_CONST, CONST_BLOCK),
    ("rappel objectif au-dessus du total", ANCHOR_PANEL, NEW_PANEL),
    ("etiquette sous le total", ANCHOR_LEGEND, NEW_LEGEND),
    ("hook injection script ImpactCO2", ANCHOR_HOOK, HOOK_BLOCK),
]

problemes = []
for label, old, _ in EDITS:
    n = src.count(old)
    if n != 1:
        problemes.append(f"  [{'ABSENTE' if n == 0 else f'AMBIGUE x{n}'}] {label}")

if problemes:
    print("Patch NON applique. Ancres a verifier :")
    print("\n".join(problemes))
    print("\nLe fichier n'a PAS ete modifie.")
    sys.exit(1)

out = src
for label, old, new in EDITS:
    out = out.replace(old, new, 1)

APP.with_suffix(".js.bak_ges").write_text(src, encoding="utf-8")
APP.write_text(out, encoding="utf-8")

print("OK : bloc GES enrichi")
print("  - rappel objectif 2050 (2 tCO₂e/hab) au-dessus du total")
print("  - etiquette animee ImpactCO2 (ADEME) en dessous, vraie valeur du territoire")
print("Sauvegarde : app.js.bak_ges")
print("\nVerifie :  node --check frontend/js/app.js")
print("Si erreur :  cp frontend/js/app.js.bak_ges frontend/js/app.js")
