#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Patch chirurgical de frontend/js/carto.js :
  - sépare l'état unique `lens` en DEUX états independants : `couche` (POI) et `angle` (choroplethe)
  - cliquer un angle ne referme plus la couche active (Mobilite reste ouverte) et inversement
  - rend les deux groupes visuellement distincts (deux boites)
  - marqueur gare auto-contenu (ne depend plus du CSS .gare-sq)

Ne touche PAS aux icones base64 (CARTO_ICON). Sauvegarde carto.js.bak.
Idempotent (skip si deja applique). Fail-safe (n'ecrit rien si une ancre manque).

Lancer depuis la racine du repo :
    python3 scripts/patch_carto_boxes.py
"""

import sys
from pathlib import Path

CARTO = Path("frontend/js/carto.js")

if not CARTO.exists():
    print("ERREUR : frontend/js/carto.js introuvable. Lance le script depuis la racine du repo.")
    sys.exit(1)

src = CARTO.read_text(encoding="utf-8")

if "selectCouche" in src:
    print("Deja applique (selectCouche present). Rien a faire.")
    sys.exit(0)

# ---------------------------------------------------------------------------
# Liste des remplacements (label, ancien, nouveau).
# Chaque ancien doit apparaitre EXACTEMENT une fois.
# ---------------------------------------------------------------------------
EDITS = []

# 1) cartoState : lens -> couche + angle
EDITS.append((
    "cartoState (lens -> couche/angle)",
    "  lens: 'demo',",
    "  couche: null, angle: 'demo',",
))

# 2) buildLensRail : deux boites + highlight/onclick par groupe
EDITS.append((
    "buildLensRail (deux boites)",
    """function buildLensRail() {
  const host = document.getElementById('lensList');
  if (!host) return;
  host.innerHTML = '';
  const GROUPS = [
    { g: 'theme', title: 'Couches à cocher' },
    { g: 'lecture', title: 'Angles de lecture' },
  ];
  GROUPS.forEach(grp => {
    const lenses = CARTO_LENSES.filter(L0 => (L0.g || 'lecture') === grp.g);
    if (!lenses.length) return;
    const h = document.createElement('div');
    h.className = 'lens-group-title';
    h.textContent = grp.title;
    h.style.cssText = 'font:600 11px/1.4 system-ui,sans-serif;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3,#8a8f88);padding:14px 12px 5px;';
    host.appendChild(h);
    lenses.forEach(L0 => {
      const b = document.createElement('button');
      b.className = 'lens' + (L0.id === window.cartoState.lens ? ' on' : '');
      b.dataset.id = L0.id;
      b.innerHTML = `<span class="lens-ic" style="background:${L0.c}">${CARTO_ICON[L0.id] || ''}</span>
        <span class="lens-tx"><span class="n">${L0.n}</span><span class="d">${L0.d}</span></span>
        <span class="lens-chk"></span>`;
      b.onclick = () => selectLens(L0.id);
      host.appendChild(b);
    });
  });
}""",
    """function buildLensRail() {
  const host = document.getElementById('lensList');
  if (!host) return;
  host.innerHTML = '';
  const GROUPS = [
    { g: 'theme', title: 'Couches à cocher' },
    { g: 'lecture', title: 'Angles de lecture' },
  ];
  GROUPS.forEach(grp => {
    const lenses = CARTO_LENSES.filter(L0 => (L0.g || 'lecture') === grp.g);
    if (!lenses.length) return;
    const box = document.createElement('div');
    box.className = 'lens-box';
    box.style.cssText = 'background:var(--surface,#fff);border:1px solid var(--line,#e7e7e1);border-radius:14px;padding:6px 6px 8px;margin-bottom:14px;box-shadow:0 1px 2px rgba(20,20,20,.04);';
    const h = document.createElement('div');
    h.className = 'lens-group-title';
    h.textContent = grp.title;
    h.style.cssText = 'font:600 11px/1.4 system-ui,sans-serif;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3,#8a8f88);padding:9px 8px 6px;';
    box.appendChild(h);
    lenses.forEach(L0 => {
      const active = grp.g === 'theme' ? window.cartoState.couche : window.cartoState.angle;
      const b = document.createElement('button');
      b.className = 'lens' + (L0.id === active ? ' on' : '');
      b.dataset.id = L0.id;
      b.dataset.g = grp.g;
      b.innerHTML = `<span class="lens-ic" style="background:${L0.c}">${CARTO_ICON[L0.id] || ''}</span>
        <span class="lens-tx"><span class="n">${L0.n}</span><span class="d">${L0.d}</span></span>
        <span class="lens-chk"></span>`;
      b.onclick = () => (grp.g === 'theme' ? selectCouche(L0.id) : selectAngle(L0.id));
      box.appendChild(b);
    });
    host.appendChild(box);
  });
}""",
))

# 3) selectLens -> refreshLensHighlight + selectCouche + selectAngle
EDITS.append((
    "selectLens -> selectCouche/selectAngle",
    """function selectLens(id) {
  const cur = window.cartoState.lens;
  window.cartoState.lens = (cur === id) ? null : id; // reclic = désélection
  document.querySelectorAll('.lens').forEach(b => b.classList.toggle('on', b.dataset.id === window.cartoState.lens));
  renderCtrl();
  applyLens();
}""",
    """function refreshLensHighlight() {
  document.querySelectorAll('.lens').forEach(b => {
    const active = b.dataset.g === 'theme' ? window.cartoState.couche : window.cartoState.angle;
    b.classList.toggle('on', b.dataset.id === active);
  });
}
function selectCouche(id) {
  const cur = window.cartoState.couche;
  window.cartoState.couche = (cur === id) ? null : id; // reclic = referme le panneau
  refreshLensHighlight();
  renderCtrl();
  applyLens();
}
function selectAngle(id) {
  const cur = window.cartoState.angle;
  window.cartoState.angle = (cur === id) ? null : id; // reclic = masque le choroplèthe
  refreshLensHighlight();
  applyLens();
}""",
))

# 4) renderCtrl : 5 references lens -> couche
EDITS.append((
    "renderCtrl (L0 + garde)",
    """  const L0 = CARTO_LENSES.find(l => l.id === window.cartoState.lens);
  if (!L0 || L0.type !== 'poi') { ctrl.classList.remove('show'); div.hidden = true; ctrl.innerHTML = ''; return; }""",
    """  const L0 = CARTO_LENSES.find(l => l.id === window.cartoState.couche);
  if (!L0 || L0.type !== 'poi') { ctrl.classList.remove('show'); div.hidden = true; ctrl.innerHTML = ''; return; }""",
))
EDITS.append((
    "renderCtrl (opts)",
    "  const opts = LENS_POI[window.cartoState.lens] || [];",
    "  const opts = LENS_POI[window.cartoState.couche] || [];",
))
EDITS.append((
    "renderCtrl (sub)",
    "  const sub = window.cartoState.sub[window.cartoState.lens];",
    "  const sub = window.cartoState.sub[window.cartoState.couche];",
))
EDITS.append((
    "renderCtrl (buf)",
    "  const buf = window.cartoState.buffer[window.cartoState.lens] || 0;",
    "  const buf = window.cartoState.buffer[window.cartoState.couche] || 0;",
))
EDITS.append((
    "renderCtrl (range oninput)",
    "    window.cartoState.buffer[window.cartoState.lens] = +e.target.value;",
    "    window.cartoState.buffer[window.cartoState.couche] = +e.target.value;",
))

# 5) applyLens : 3 references
EDITS.append((
    "applyLens (L0 -> angleL)",
    """  const L0 = CARTO_LENSES.find(l => l.id === window.cartoState.lens);
  _clearChoro(); _clearBuffer(); _clearCommunesBase();""",
    """  const angleL = CARTO_LENSES.find(l => l.id === window.cartoState.angle);
  _clearChoro(); _clearBuffer(); _clearCommunesBase();""",
))
EDITS.append((
    "applyLens (choro)",
    """  if (L0 && L0.type === 'choro') {
    await drawChoro(L0.metric);
  }""",
    """  if (angleL && angleL.type === 'choro') {
    await drawChoro(angleL.metric);
  }""",
))
EDITS.append((
    "applyLens (poi -> couche)",
    """  if (L0 && L0.type === 'poi') {
    drawBuffer();
  }""",
    """  if (window.cartoState.couche) {
    drawBuffer();
  }""",
))

# 6) drawCommunesBase : lens -> angle
EDITS.append((
    "drawCommunesBase (lens -> angle)",
    "  const lens = CARTO_LENSES.find(l => l.id === window.cartoState.lens);",
    "  const lens = CARTO_LENSES.find(l => l.id === window.cartoState.angle);",
))

# 7) drawBuffer : lens -> couche
EDITS.append((
    "drawBuffer (lens -> couche)",
    "  const lens = window.cartoState.lens;",
    "  const lens = window.cartoState.couche;",
))

# 8) updateInsight : choisit L0 (angle prioritaire, sinon couche)
EDITS.append((
    "updateInsight (choix L0)",
    """  const L0 = CARTO_LENSES.find(l => l.id === window.cartoState.lens);
  if (!L0) {""",
    """  const _angleL = CARTO_LENSES.find(l => l.id === window.cartoState.angle);
  const _coucheL = CARTO_LENSES.find(l => l.id === window.cartoState.couche);
  const L0 = (_angleL && _angleL.type === 'choro') ? _angleL : ((_coucheL && _coucheL.type === 'poi') ? _coucheL : null);
  if (!L0) {""",
))

# 9) marqueur gare auto-contenu
EDITS.append((
    "marqueur gare auto-contenu",
    "html: '<span class=\"gare-sq\"></span>'",
    "html: '<span style=\"display:block;width:11px;height:11px;background:#16798c;border:2px solid #fff;box-shadow:0 0 0 1px #16798c\"></span>'",
))

# ---------------------------------------------------------------------------
# Verification (fail-safe) : chaque ancre doit apparaitre exactement une fois
# ---------------------------------------------------------------------------
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
    print("\nLe fichier n'a PAS ete modifie. Colle-moi la fonction concernee si besoin.")
    sys.exit(1)

# Sauvegarde puis application
CARTO.with_suffix(".js.bak").write_text(src, encoding="utf-8")

out = src
for label, old, new in EDITS:
    out = out.replace(old, new, 1)

CARTO.write_text(out, encoding="utf-8")
print(f"OK : {len(EDITS)} edits appliques sur frontend/js/carto.js")
print("Sauvegarde : frontend/js/carto.js.bak")
print("\nVerifie maintenant :  node --check frontend/js/carto.js")
print("Si erreur :  cp frontend/js/carto.js.bak frontend/js/carto.js")
