#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Agrandit et allonge les bulles EMC²B de l'intro (Energie, Matiere, Carbone,
Climat, Biodiversite). Injecte un petit script JS dans frontend/index.html qui
force, sur les classes .emc2b-*, des tailles plus grandes et un padding plus long.
Independant du CSS (qui existe en double) et du cache.

Reglable : valeurs LETTER / LABEL / PAD_X / ICON en haut du bloc <script>.
Idempotent + fail-safe. Sauvegarde index.html.bak_emc2b.

    python3 scripts/patch_emc2b_taille.py
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
if 'emc2b-size-fix-js' in src:
    print("Deja applique. Pour ajuster, edite LETTER/LABEL/PAD_X/ICON dans le bloc <script id=\"emc2b-size-fix-js\">.")
    sys.exit(0)

BLOCK = """<script id="emc2b-size-fix-js">
(function () {
  var LETTER = 30;  // taille de la lettre (E, M, C...)  (avant 22)
  var LABEL  = 15;  // taille du mot (energie...)        (avant 11.5)
  var PAD_X  = 36;  // allongement horizontal de la bulle (avant 22)
  var ICON   = 56;  // diametre du rond icone            (avant 48)
  function fix() {
    document.querySelectorAll('.emc2b-letter').forEach(function (e) {
      e.style.setProperty('font-size', LETTER + 'px', 'important');
    });
    document.querySelectorAll('.emc2b-label').forEach(function (e) {
      e.style.setProperty('font-size', LABEL + 'px', 'important');
    });
    document.querySelectorAll('.emc2b-item').forEach(function (e) {
      e.style.setProperty('padding', '14px ' + PAD_X + 'px 14px 14px', 'important');
      e.style.setProperty('gap', '18px', 'important');
    });
    document.querySelectorAll('.emc2b-icon').forEach(function (e) {
      e.style.setProperty('width', ICON + 'px', 'important');
      e.style.setProperty('height', ICON + 'px', 'important');
    });
    document.querySelectorAll('.emc2b-icon svg').forEach(function (e) {
      e.style.setProperty('width', Math.round(ICON * 0.58) + 'px', 'important');
      e.style.setProperty('height', Math.round(ICON * 0.58) + 'px', 'important');
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
IDX.with_suffix(".html.bak_emc2b").write_text(src, encoding="utf-8")
IDX.write_text(out, encoding="utf-8")
print(f"OK : script EMC²B injecte dans {IDX}")
print("Sauvegarde : " + IDX.name + ".bak_emc2b")
print("\nRecharge avec Ctrl+Shift+R. Ajuste LETTER/LABEL/PAD_X/ICON dans le bloc <script id=\"emc2b-size-fix-js\">.")
