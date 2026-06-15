"""
Extraction des équipements BPE24 par EPCI + intégration backend + frontend.

Lot 1 :
  - SANTÉ      : Médecins (D279) + Pharmacies (D307)
  - COMMERCES  : Boulangeries (B207) + Supermarchés (B105)

Sortie : backend/data/equipements_epci.json
Endpoint : /carto/{code}?layers=sante  ou  ?layers=commerces
Frontend : 2 nouveaux boutons sous "🚌 Arrêts TC"

Lance : python scripts/extract_equipements_epci.py
"""
import csv
import gzip
import json
import pickle
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BPE = ROOT / "data_brut" / "BPE24.csv"
PICKLE = ROOT / "backend" / "data" / "precomputed.pkl.gz"
OUTPUT = ROOT / "backend" / "data" / "equipements_epci.json"
APP = ROOT / "backend" / "app.py"
INDEX = ROOT / "frontend" / "index.html"

# Codes BPE24 par catégorie d'équipement
CATEGORIES = {
    "sante": {
        "label": "🏥 Santé",
        "codes": {
            "D279": "Médecin généraliste",
            "D307": "Pharmacie",
        },
        "color": "#c1623a",  # terracotta accent
    },
    "commerces": {
        "label": "🛒 Commerces",
        "codes": {
            "B207": "Boulangerie-Pâtisserie",
            "B105": "Supermarché",
        },
        "color": "#a35d2a",  # ocre
    },
}


def step_extract():
    print("\n═══ STEP 1 : Extraction BPE24 ═══\n")
    print(f"[1/3] Chargement pickle...")
    with gzip.open(PICKLE, "rb") as f:
        data = pickle.load(f)
    commune_to_epci = {
        code: c.get("epci") for code, c in data["communes"].items() if c.get("epci")
    }
    arr_map = {}
    for d in range(1, 21): arr_map[f"751{d:02d}"] = "75056"
    for d in range(81, 90): arr_map[f"693{d}"] = "69123"
    for d in range(1, 17): arr_map[f"132{d:02d}"] = "13055"
    print(f"      {len(commune_to_epci):,} communes mappées".replace(",", " "))

    # Tous les codes qu'on cherche
    all_codes = {}
    for cat, info in CATEGORIES.items():
        for code, lbl in info["codes"].items():
            all_codes[code] = (cat, lbl)
    print(f"      Codes BPE recherchés : {list(all_codes.keys())}")

    print(f"\n[2/3] Lecture BPE24.csv ({BPE.stat().st_size/1024/1024:.0f} Mo)...")
    t0 = time.time()
    # Structure : {epci: {cat: [{lon, lat, libcom, nom, type}, ...]}}
    result = {}
    n_lignes = 0
    n_pris = 0
    n_geoloc_ko = 0

    with open(BPE, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f, delimiter=";", quotechar='"')
        for row in reader:
            n_lignes += 1
            if n_lignes % 500000 == 0:
                print(f"      {n_lignes:,} lignes ({time.time()-t0:.0f}s)...".replace(",", " "))
            typequ = (row.get("TYPEQU") or "").strip()
            if typequ not in all_codes:
                continue
            cat, lbl = all_codes[typequ]
            try:
                lon = float((row.get("LONGITUDE") or "").replace(",", "."))
                lat = float((row.get("LATITUDE") or "").replace(",", "."))
            except (ValueError, TypeError):
                n_geoloc_ko += 1
                continue
            depcom = (row.get("DEPCOM") or "").strip()
            depcom = arr_map.get(depcom, depcom)
            epci = commune_to_epci.get(depcom)
            if not epci:
                continue
            n_pris += 1
            result.setdefault(epci, {}).setdefault(cat, []).append({
                "lon": round(lon, 5),
                "lat": round(lat, 5),
                "libcom": (row.get("LIBCOM") or "").strip(),
                "nom": (row.get("NOMRS") or "").strip()[:60],
                "type": lbl,
            })

    print(f"      Lecture en {time.time()-t0:.1f}s")
    print(f"      {n_pris:,} équipements retenus, {n_geoloc_ko:,} sans coords"
          .replace(",", " "))

    print(f"\n[3/3] Écriture JSON...")
    payload = {
        "epcis": result,
        "commune_to_epci": commune_to_epci,
    }
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"      ✓ {OUTPUT.name} ({OUTPUT.stat().st_size/1024:.1f} Ko)")

    # Stats par catégorie
    for cat, info in CATEGORIES.items():
        total = sum(len(v.get(cat, [])) for v in result.values())
        n_epci = sum(1 for v in result.values() if v.get(cat))
        print(f"      {info['label']:<20} : {total:>6,} points, {n_epci} EPCI couverts"
              .replace(",", " "))


def step_backend():
    print("\n═══ STEP 2 : Patch backend ═══\n")
    c = APP.read_text()
    if "equipements_epci.json" in c:
        print("[backend] = déjà patché")
        return
    # Insère un nouveau bloc après le handler 'ecoles' (qui se termine par 'ecoles_epci.json absent')
    marker = '"error": "ecoles_epci.json absent"}'
    addition = marker + '''

    # ─── Couches équipements BPE24 (Santé / Commerces) ───
    for _cat in ("sante", "commerces"):
        if _cat in (layers or ""):
            import json as _json
            from pathlib import Path as _Path
            _eq_file = _Path(__file__).parent / "data" / "equipements_epci.json"
            if _eq_file.exists():
                try:
                    _data = _json.loads(_eq_file.read_text())
                    _c2e = _data.get("commune_to_epci", {})
                    _lookup_code = _c2e.get(code, code)
                    _eq = _data.get("epcis", {}).get(_lookup_code, {}).get(_cat, [])
                    _features = [
                        {
                            "type": "Feature",
                            "geometry": {"type": "Point", "coordinates": [e["lon"], e["lat"]]},
                            "properties": {"libcom": e.get("libcom", ""), "nom": e.get("nom", ""), "type": e.get("type", "")},
                        }
                        for e in _eq
                    ]
                    return {_cat: {"type": "FeatureCollection", "features": _features}}
                except Exception as _e:
                    return {_cat: {"type": "FeatureCollection", "features": []}, "error": str(_e)}
            return {_cat: {"type": "FeatureCollection", "features": []}, "error": "equipements_epci.json absent"}'''
    if marker in c:
        c = c.replace(marker, addition)
        APP.write_text(c)
        print("[backend] + handlers /carto?layers=sante & layers=commerces")
    else:
        print("[backend] [err] marker introuvable")


def step_frontend():
    print("\n═══ STEP 3 : Patch frontend ═══\n")
    c = INDEX.read_text()
    if "toggleSante" in c:
        print("[frontend] = déjà patché")
        return

    # Fonctions JS génériques
    new_func = '''async function toggleEquipementLayer(cat, color, icon) {
  const M = window.empreintesMap;
  if (!M || !state.territoire?.code) return;
  const layerName = `${cat}Layer`;
  const btnId = `toggle${cat.charAt(0).toUpperCase() + cat.slice(1)}`;
  const btn = document.getElementById(btnId);
  // Toggle off
  if (M[layerName]) {
    M.instance.removeLayer(M[layerName]);
    M[layerName] = null;
    M.activeLayers[cat] = false;
    if (btn) btn.classList.remove('is-active');
    setStatus('ok', `${icon} masqués`);
    return;
  }
  // Toggle on
  try {
    setStatus('loading', `Chargement ${icon}…`);
    const data = await apiGet(`/carto/${encodeURIComponent(state.territoire.code)}?layers=${cat}`);
    const gj = data?.[cat];
    if (!gj || !gj.features?.length) {
      setStatus('error', `Aucun équipement ${icon} sur ce territoire`);
      return;
    }
    const group = L.layerGroup();
    gj.features.forEach(f => {
      const [lon, lat] = f.geometry.coordinates;
      L.circleMarker([lat, lon], {
        radius: 4.5,
        color: color,
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.7,
      }).bindTooltip(`<strong>${f.properties?.type || ''}</strong><br>${f.properties?.nom || ''}<br>${f.properties?.libcom || ''}`,
                     { direction: 'top', offset: [0, -4] })
        .addTo(group);
    });
    group.addTo(M.instance);
    M[layerName] = group;
    M.activeLayers[cat] = true;
    if (btn) btn.classList.add('is-active');
    setStatus('ok', `${gj.features.length} ${icon}`);
  } catch (e) {
    console.error(`Erreur ${cat}`, e);
    setStatus('error', e.message || 'Erreur');
  }
}
async function toggleSante()     { return toggleEquipementLayer('sante',     '#c1623a', '🏥 santé'); }
async function toggleCommerces() { return toggleEquipementLayer('commerces', '#a35d2a', '🛒 commerces'); }

'''
    marker = 'async function toggleArretsTC() {'
    if marker in c:
        c = c.replace(marker, new_func + marker)
        print("[frontend] + fonctions toggleSante & toggleCommerces")

    # Boutons HTML
    old_btn = '<button id="toggleTC" onclick="toggleArretsTC()">🚌 Arrêts TC</button>'
    new_btn = (
        '<button id="toggleTC" onclick="toggleArretsTC()">🚌 Arrêts TC</button>'
        '<button id="toggleSante" onclick="toggleSante()">🏥 Santé</button>'
        '<button id="toggleCommerces" onclick="toggleCommerces()">🛒 Commerces</button>'
    )
    if old_btn in c:
        c = c.replace(old_btn, new_btn)
        print("[frontend] + 2 boutons HTML")

    # CSS pour les 2 boutons (positionnés sous les autres)
    css = '''
#toggleSante {
  position: absolute; top: 144px; right: 12px; z-index: 1000;
  padding: 7px 12px; background: rgba(251,249,242,.95);
  border: 1px solid var(--rule); border-radius: 6px;
  font-family: var(--font-ui); font-size: 11.5px; color: var(--ink-2);
  cursor: pointer; box-shadow: 0 2px 6px rgba(20,22,26,.08);
  transition: all 0.15s ease;
}
#toggleSante:hover { background: rgba(251,249,242,1); color: var(--ink); }
#toggleSante.is-active { background: #c1623a; color: #fff; border-color: #c1623a; }

#toggleCommerces {
  position: absolute; top: 188px; right: 12px; z-index: 1000;
  padding: 7px 12px; background: rgba(251,249,242,.95);
  border: 1px solid var(--rule); border-radius: 6px;
  font-family: var(--font-ui); font-size: 11.5px; color: var(--ink-2);
  cursor: pointer; box-shadow: 0 2px 6px rgba(20,22,26,.08);
  transition: all 0.15s ease;
}
#toggleCommerces:hover { background: rgba(251,249,242,1); color: var(--ink); }
#toggleCommerces.is-active { background: #a35d2a; color: #fff; border-color: #a35d2a; }
'''
    if '#toggleSante {' not in c:
        style_close = c.rfind('</style>')
        c = c[:style_close] + css + c[style_close:]
        print("[frontend] + CSS boutons")

    # Init activeLayers
    if "sante:" not in c:
        c = c.replace(
            "activeLayers: { tc: false, velo: false, ecoles: false }",
            "activeLayers: { tc: false, velo: false, ecoles: false, sante: false, commerces: false }"
        )
        print("[frontend] + activeLayers étendus")

    INDEX.write_text(c)


if __name__ == "__main__":
    step_extract()
    step_backend()
    step_frontend()
    print("\n✓ TOUT FAIT")
    print("\nSuite : restart serveur + push")
    print("  pkill -9 -f uvicorn && sleep 3")
    print("  uvicorn backend.app:app --reload --port 8000 > /tmp/uvicorn.log 2>&1 &")
    print("  git add -A && git commit -m 'feat: couches sante + commerces sur carte' && git push")
