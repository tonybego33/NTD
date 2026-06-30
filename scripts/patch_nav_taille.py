#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Agrandit les liens de la barre de navigation, methode robuste : un petit script
JS injecte dans frontend/index.html cible les liens par leur TEXTE (Diagnostic,
Cartographie, Methodologie, Fondements, Indicateurs) et force leur taille.
Independant de la classe CSS et de la structure du header.

Idempotent + fail-safe. Sauvegarde index.html.bak_navjs.
    python3 scripts/patch_nav_taille.py

Pour changer la taille : edite la valeur 16 dans le bloc <script id="nav-size-fix-js">.
"""
import re
import sys
from pathlib import Path

CANDIDATES = [Path("frontend/index.html"), Path("index.html")]
IDX = next((p for p in CANDIDATES if p.exists()), None)
if IDX is None:
    print("ERREUR : index.html introuvable. Lance depuis la racine du repo.")
    sys.exit(1)

src = IDX.read_text(encoding="utf-8")

if 'nav-size-fix-js' in src:
    print("Deja applique. Rien a faire (pour changer la taille, edite la valeur 16 dans le bloc <script id=\"nav-size-fix-js\">).")
    sys.exit(0)

# nettoyer l'ancienne tentative <style> si presente (sans effet)
src = re.sub(r'<style id="nav-size-fix">.*?</style>\s*', '', src, flags=re.DOTALL)

BLOCK = """<script id="nav-size-fix-js">
(function () {
  var SIZE = 16; // <-- change la taille ici (px)
  var LABELS = ['Diagnostic', 'Cartographie', 'Méthodologie', 'Fondements', 'Indicateurs', 'Ressources'];
  function fix() {
    var els = document.querySelectorAll('a, button');
    for (var i = 0; i < els.length; i++) {
      var t = (els[i].textContent || '').trim();
      if (LABELS.indexOf(t) !== -1) {
        els[i].style.setProperty('font-size', SIZE + 'px', 'important');
      }
    }
  }
  if (document.readyState !== 'loading') fix();
  else document.addEventListener('DOMContentLoaded', fix);
  // re-applique au cas ou la nav est rendue/maj apres coup
  setTimeout(fix, 400);
  setTimeout(fix, 1200);
})();
</script>
"""

m = re.search(r'</body>', src, flags=re.IGNORECASE)
if m:
    i = m.start()
    out = src[:i] + BLOCK + src[i:]
    where = "avant </body>"
else:
    m = re.search(r'</html>', src, flags=re.IGNORECASE)
    if not m:
        print("Ni </body> ni </html> trouves. Le fichier n'a PAS ete modifie.")
        sys.exit(1)
    i = m.start()
    out = src[:i] + BLOCK + src[i:]
    where = "avant </html>"

IDX.with_suffix(".html.bak_navjs").write_text(IDX.read_text(encoding="utf-8"), encoding="utf-8")
IDX.write_text(out, encoding="utf-8")
print(f"OK : script taille nav injecte ({where}) dans {IDX}")
print("Sauvegarde : " + IDX.name + ".bak_navjs")
print("\nRecharge avec Ctrl+Shift+R. Taille reglable via la valeur 16 dans le bloc <script id=\"nav-size-fix-js\">.")
