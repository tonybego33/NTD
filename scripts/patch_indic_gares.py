"""patch_indic_gares.py — ajoute UNIQUEMENT les lignes gare a indicateurs_locaux.py. Idempotent, fail-safe."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IND = ROOT / "backend" / "services" / "indicateurs_locaux.py"
if not IND.exists():
    raise SystemExit(f"[err] introuvable : {IND}")
s = IND.read_text(encoding="utf-8")
report = []

if "pct_habitat_gare_3" in s:
    print("Deja patche, rien a faire.")
    raise SystemExit(0)

imp_anchor = "from typing import Optional"
if imp_anchor in s:
    s = s.replace(imp_anchor, imp_anchor + "\nimport csv\nfrom pathlib import Path", 1)
    report.append("imports : ajoutes")
else:
    report.append("imports : ANCRE INTROUVABLE")

def_anchor = '''     "description": "% des équipements du quotidien (commerces, services, santé, sport-culture) à moins de 1,5 km d'une école élémentaire."},'''
def_gare = def_anchor + '''
    # ─── Proximité aux gares (jumeau du 1,5 km école, rayon 3 km) ───
    {"code": "pct_habitat_gare_3", "key": "pct_habitat_gare_3",
     "label": "Habitat à <3 km d'une gare",
     "unite": "%", "dimension": "struct", "format": "percent",
     "source": "Calcul AREP — BPE 2024 + Filosofi 2021 carroyé 200m",
     "description": "% de la population résidant à moins de 3 km d'une gare de voyageurs (desserte ferroviaire)."},
    {"code": "pct_equipements_gare_3", "key": "pct_equipements_gare_3",
     "label": "Équipements à <3 km d'une gare",
     "unite": "%", "dimension": "struct", "format": "percent",
     "source": "Calcul AREP — BPE 2024",
     "description": "% des équipements du quotidien à moins de 3 km d'une gare de voyageurs."},'''
if def_anchor in s:
    s = s.replace(def_anchor, def_gare, 1)
    report.append("definitions gare : ajoutees")
else:
    report.append("definitions gare : ANCRE INTROUVABLE")

fn_anchor = "def get_indicateurs(territoire: dict) -> dict:"
fns = '''_GARES_CACHE = None


def _load_gares() -> dict:
    global _GARES_CACHE
    if _GARES_CACHE is not None:
        return _GARES_CACHE
    base = Path(__file__).resolve().parent.parent / "data"
    out = {"commune": {}, "epci": {}}

    def _f(x):
        try:
            return float(x)
        except (TypeError, ValueError):
            return None

    def _read(path, keycol, dest):
        if not path.exists():
            return
        with open(path, "r", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                code = (row.get(keycol) or "").strip()
                if not code:
                    continue
                dest[code] = {
                    "pct_habitat_gare_3": _f(row.get("pct_habitat_gare_3")),
                    "pct_equipements_gare_3": _f(row.get("pct_equipements_gare_3")),
                }

    _read(base / "gares_dispersion_communes.csv", "codgeo", out["commune"])
    _read(base / "gares_dispersion_epci.csv", "code_epci", out["epci"])
    _GARES_CACHE = out
    return out


def _apply_gares(result: dict, territoire: dict) -> None:
    gares = _load_gares()
    maille = "epci" if territoire.get("type") == "epci" else "commune"
    code = str(territoire.get("code") or "")
    gv = gares.get(maille, {}).get(code)
    if not gv:
        return
    for k in ("pct_habitat_gare_3", "pct_equipements_gare_3"):
        if k in result and gv.get(k) is not None:
            result[k]["valeur"] = gv[k]
            result[k]["valeur_formatee"] = _format_value(gv[k], "percent")
            result[k]["statut"] = "ok"


'''
if fn_anchor in s:
    s = s.replace(fn_anchor, fns + fn_anchor, 1)
    report.append("fonctions CSV : ajoutees")
else:
    report.append("fonctions CSV : ANCRE INTROUVABLE")

call_anchor = '''            "statut": "ok" if val is not None else "indisponible",
        }
    return result'''
call_new = '''            "statut": "ok" if val is not None else "indisponible",
        }

    _apply_gares(result, territoire)
    return result'''
if call_anchor in s:
    s = s.replace(call_anchor, call_new, 1)
    report.append("appel _apply_gares : ajoute")
else:
    report.append("appel _apply_gares : ANCRE INTROUVABLE")

if [r for r in report if "INTROUVABLE" in r]:
    print("=== STOP : ancre manquante, AUCUNE modif ecrite ===")
    for r in report:
        print("  " + r)
    raise SystemExit(1)

IND.write_text(s, encoding="utf-8")
print("indicateurs_locaux.py patche (gares ajoutees).")
for r in report:
    print("  " + r)
