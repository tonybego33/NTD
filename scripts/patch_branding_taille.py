#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Agrandit le branding du header : logo AREP, "Empreintes" (.brand-em) et
"Nos territoires decarbones" (.brand-sub). Script JS injecte dans
frontend/index.html, force les tailles (independant du CSS prefixe #diag-root
et du cache).

Reglable : EM / SUB / LOGO en haut du bloc <script>.
Idempotent + fail-safe. Sauvegarde index.html.bak_brand.
    python3 scripts/patch_branding_taille.py
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
if 'brand-size-fix-js' in src:
    print("Deja applique. Pour ajuster, edite EM/SUB/LOGO dans le bloc <script id=\"brand-size-fix-js\">.")
    sys.exit(0)

BLOCK = """<script id="brand-size-fix-js">
(function () {
  var EM   = 32;  // "Empreintes"                     (avant 16)
  var SUB  = 22;  // "Nos territoires decarbones"      (avant 9.5)
  var LOGO = 52;  // hauteur du logo AREP (px)         (avant 22)
  function fix() {
    document.querySelectorAll('.brand-em').forEach(function (e) {
      e.style.setProperty('font-size', EM + 'px', 'important');
    });
    document.querySelectorAll('.brand-sub').forEach(function (e) {
      e.style.setProperty('font-size', SUB + 'px', 'important');
    });
    document.querySelectorAll('.hdr-brand img, .carto-hdr-brand img').forEach(function (e) {
      e.style.setProperty('height', LOGO + 'px', 'important');
      e.style.setProperty('width', 'auto', 'important');
    });
    document.querySelectorAll('.hdr-brand .div, .carto-hdr-brand .div').forEach(function (e) {
      e.style.setProperty('height', (LOGO + 4) + 'px', 'important');
    });
  }
  if (document.readyState !== 'loading') fix();
  else document.addEventListener('DOMContentLoaded', fix);
  setTimeout(fix, 500);
  setTimeout(fix, 1500);
})();
</script>
"""

m = re.search(r'</body>', src, flags=re.IGNORECASE) or re.search(r'</html>', src, flags=re.IGNORECASE)
if not m:
    print("Ni </body> ni </html> trouves. Le fichier n'a PAS ete modifie.")
    sys.exit(1)

i = m.start()
out = src[:i] + BLOCK + src[i:]
IDX.with_suffix(".html.bak_brand").write_text(src, encoding="utf-8")
IDX.write_text(out, encoding="utf-8")
print(f"OK : script branding injecte dans {IDX}")
print("Sauvegarde : " + IDX.name + ".bak_brand")
print("\nRecharge avec Ctrl+Shift+R. Ajuste EM/SUB/LOGO dans le bloc <script id=\"brand-size-fix-js\">.")
