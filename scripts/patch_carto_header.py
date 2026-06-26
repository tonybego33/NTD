#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Donne a la cartographie le MEME bandeau que methodo / fondements
(site-header methodo-siteheader), pour qu'ouvrir la carto ne donne plus
l'impression de changer de page. On garde la recherche carto et le label
territoire. On corrige aussi la ligne de surbrillance dans openCartographie
(qui se basait sur un index global, faux des qu'il y a plusieurs .site-header).

Touche frontend/index.html + frontend/js/carto.js.
Idempotent + fail-safe. Sauvegardes index.html.bak4 et carto.js.bak4.

Lancer depuis la racine du repo :
    python3 scripts/patch_carto_header.py
"""
import sys
from pathlib import Path

HTML = Path("frontend/index.html")
CARTO = Path("frontend/js/carto.js")
for f in (HTML, CARTO):
    if not f.exists():
        print(f"ERREUR : {f} introuvable. Lance depuis la racine du repo.")
        sys.exit(1)

html = HTML.read_text(encoding="utf-8")
carto = CARTO.read_text(encoding="utf-8")

START = '<header class="carto-hdr">'
JS_OLD = "document.querySelectorAll('.site-header .nav-link').forEach((l, i) => l.classList.toggle('is-active', i === 1));"
JS_NEW = "document.querySelectorAll('#view-cartographie .nav-link').forEach(l => l.classList.toggle('is-active', l.textContent.trim() === 'Cartographie'));"

if START not in html and JS_OLD not in carto:
    print("Deja applique. Rien a faire.")
    sys.exit(0)

# Nouveau bandeau : clone exact de methodo/fondements, avec la recherche carto
# et le label territoire conserves (ids cartoSearchInput / cartoSearchDropdown /
# cartoTerritoireLabel inchanges pour ne rien casser dans carto.js).
NEW_HEADER = '''<header class="site-header methodo-siteheader">
    <div class="wrap site-header-inner">
      <a href="#" class="brand" onclick="closeCartographie(event)">
        <img src="/assets/arep-logo.png" alt="AREP" class="brand-arep" onerror="this.closest('.brand').classList.add('no-logo')">
        <span class="brand-arep-txt">AREP</span>
        <span class="brand-div"></span>
        <span class="brand-lockup">
          <span class="brand-name">Empreintes</span>
          <span class="brand-sub">Nos territoires décarbonés</span>
        </span>
      </a>
      <nav class="main-nav">
        <a href="#" class="nav-link" onclick="closeCartographie(event)">Diagnostic</a>
        <a href="#" class="nav-link is-active" onclick="event.preventDefault()">Cartographie</a>
        <a href="#" class="nav-link" onclick="closeCartographie(event); openMethodologie(event)">Méthodologie</a>
        <a href="#" class="nav-link" onclick="closeCartographie(event); openBiblio(event)">Fondements</a>
        <a href="#" class="nav-link">Ressources</a>
      </nav>
      <div class="header-aux">
        <span class="carto-hdr-context" id="cartoTerritoireLabel"></span>
        <div class="carto-hdr-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="cartoSearchInput" placeholder="Ville, EPCI, code…" autocomplete="off">
          <div class="search-dropdown" id="cartoSearchDropdown" hidden></div>
        </div>
      </div>
    </div>
  </header>'''

changed = []

# 1. index.html : remplacer le bloc <header class="carto-hdr"> ... </header>
if START in html:
    i = html.index(START)
    j = html.index('</header>', i)
    if j == -1:
        print("ERREUR : pas de </header> apres carto-hdr. Rien fait.")
        sys.exit(1)
    j += len('</header>')
    HTML.with_suffix(".html.bak4").write_text(html, encoding="utf-8")
    html = html[:i] + NEW_HEADER + html[j:]
    HTML.write_text(html, encoding="utf-8")
    changed.append("index.html : bandeau carto -> clone methodo/fondements")
else:
    changed.append("index.html : deja a jour")

# 2. carto.js : corriger la surbrillance dans openCartographie
if JS_OLD in carto:
    if carto.count(JS_OLD) != 1:
        print(f"ERREUR : ligne de surbrillance trouvee {carto.count(JS_OLD)} fois (attendu 1). Rien fait sur carto.js.")
    else:
        CARTO.with_suffix(".js.bak4").write_text(carto, encoding="utf-8")
        carto = carto.replace(JS_OLD, JS_NEW, 1)
        CARTO.write_text(carto, encoding="utf-8")
        changed.append("carto.js : surbrillance openCartographie corrigee")
else:
    changed.append("carto.js : deja a jour")

print("OK :")
for c in changed:
    print("  - " + c)
print("\nSauvegardes : index.html.bak4 / carto.js.bak4 (si modifies)")
print("Verifie :  node --check frontend/js/carto.js")
print("Puis Ctrl+Shift+R, clique Cartographie : meme bandeau que Fondements/Methodo.")
