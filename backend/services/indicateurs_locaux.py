"""
Service indicateurs locaux (lecture du data_store).

Avant : ouvrait et parcourait indicateurs_export.csv à chaque démarrage,
puis recalculait les indicateurs dérivés et agrégats EPCI à chaque requête.

Maintenant : tout est précalculé dans le pickle data_store. Ce service ne
fait plus que de la mise en forme (libellés, formatage, unités).

Le contrat de retour est inchangé pour ne rien casser côté frontend :
    {code_ind: {valeur, valeur_formatee, libelle, unite, source, dimension, statut}}
"""
from __future__ import annotations

from typing import Optional
import csv
from pathlib import Path

from . import data_store


# ============================================================================
# Définition des indicateurs exposés (libellés, unités, formats)
# Les valeurs sont déjà précalculées dans le data_store.
# ============================================================================
INDICATEURS_DEF = [
    # === Structure urbaine (recentrée : population, démographie, densité) ===
    # --- Tranches d'âge (pyramide Empreintes) ---
    {"code": "pop_0_14", "key": "P21_POP0014", "label": "Population 0-14 ans", "unite": "hab.",
     "dimension": "struct", "format": "int", "source": "INSEE Recensement 2021"},
    {"code": "pop_15_29", "key": "P21_POP1529", "label": "Population 15-29 ans", "unite": "hab.",
     "dimension": "struct", "format": "int", "source": "INSEE Recensement 2021"},
    {"code": "pop_30_44", "key": "P21_POP3044", "label": "Population 30-44 ans", "unite": "hab.",
     "dimension": "struct", "format": "int", "source": "INSEE Recensement 2021"},
    {"code": "pop_45_59", "key": "P21_POP4559", "label": "Population 45-59 ans", "unite": "hab.",
     "dimension": "struct", "format": "int", "source": "INSEE Recensement 2021"},
    {"code": "pop_60_74", "key": "P21_POP6074", "label": "Population 60-74 ans", "unite": "hab.",
     "dimension": "struct", "format": "int", "source": "INSEE Recensement 2021"},
    {"code": "pop_75_89", "key": "P21_POP7589", "label": "Population 75-89 ans", "unite": "hab.",
     "dimension": "struct", "format": "int", "source": "INSEE Recensement 2021"},
    {"code": "pop_90_plus", "key": "P21_POP90P", "label": "Population 90 ans et +", "unite": "hab.",
     "dimension": "struct", "format": "int", "source": "INSEE Recensement 2021"},
    # --- Équipements par catégorie + variété (Empreintes) ---
    {"code": "bpe_services", "key": "bpe_services", "label": "Équipements de services", "unite": "",
     "dimension": "struct", "format": "int", "source": "INSEE BPE 2023"},
    {"code": "bpe_sante", "key": "bpe_sante", "label": "Équipements de santé", "unite": "",
     "dimension": "struct", "format": "int", "source": "INSEE BPE 2023"},
    {"code": "bpe_commerces", "key": "bpe_commerces", "label": "Commerces", "unite": "",
     "dimension": "struct", "format": "int", "source": "INSEE BPE 2023"},
    {"code": "bpe_sport_culture", "key": "bpe_sport_culture", "label": "Sport, loisir, culture", "unite": "",
     "dimension": "struct", "format": "int", "source": "INSEE BPE 2023"},
    {"code": "bpe_enseignement", "key": "bpe_enseignement", "label": "Enseignement", "unite": "",
     "dimension": "struct", "format": "int", "source": "INSEE BPE 2023"},
    {"code": "variete_equip", "key": "variete_equip", "label": "Variété d'équipements", "unite": "/ panier",
     "dimension": "struct", "format": "int", "source": "INSEE BPE 2023"},
    {"code": "population_2021", "key": "P21_POP", "label": "Population 2021", "unite": "hab.",
     "dimension": "struct", "format": "int", "source": "INSEE Recensement 2021"},
    {"code": "tcam_pop", "key": "tcam_pop", "label": "Évolution annuelle 2015→2021",
     "unite": "%/an", "dimension": "struct", "format": "float2",
     "source": "INSEE Recensement 2015 et 2021"},
    {"code": "superficie_km2", "key": "SURFKM2", "label": "Superficie", "unite": "km²",
     "dimension": "struct", "format": "float2", "source": "IGN Admin Express"},
    {"code": "densite_brute", "key": "densite_brute", "label": "Densité brute", "unite": "hab/km²",
     "dimension": "struct", "format": "float1", "source": "Calcul INSEE + IGN"},
    {"code": "dens_popclc", "key": "dens_popclc", "label": "Dispersion habitat (densité sur surfaces bâties)",
     "unite": "hab/km²", "dimension": "struct", "format": "float1", "source": "Calcul CLC + INSEE"},
    {"code": "ratio_60p_30m", "key": "ratio_60p_30m",
     "label": "Rapport 60 ans et + / moins de 30 ans",
     "unite": "", "dimension": "struct", "format": "float2",
     "source": "INSEE Recensement 2021"},
    {"code": "part_30_44", "key": "part_30_44",
     "label": "Part des 30-44 ans dans la population",
     "unite": "", "dimension": "struct", "format": "percent",
     "source": "INSEE Recensement 2021"},
    # === Artificialisation (déplacés en Environnement) ===
    {"code": "artif_naf09_23", "key": "naf09art23", "label": "Consommation ENAF 2009→2023", "unite": "m²",
     "dimension": "env", "format": "int", "source": "Artificialisation développement durable"},
    {"code": "artif_habitat_09_23", "key": "art09hab23", "label": "Artificialisation habitat 2009→2023", "unite": "m²",
     "dimension": "env", "format": "int", "source": "Artificialisation développement durable"},
    {"code": "artif_infra_09_23", "key": "art09inc23", "label": "Artificialisation infrastructures 2009→2023", "unite": "m²",
     "dimension": "env", "format": "int", "source": "Artificialisation développement durable"},
    {"code": "part_art_habitat", "key": "PartArtHabitat", "label": "Part artificialisation habitat", "unite": "",
     "dimension": "env", "format": "percent", "source": "Artificialisation développement durable"},
    {"code": "artif_15_21", "key": "art15naf21", "label": "Artificialisation 2015→2021", "unite": "m²",
     "dimension": "env", "format": "int", "source": "Artificialisation développement durable"},
    {"code": "artif_par_hab", "key": "artif_par_hab", "label": "Artificialisation 2015→2021 par habitant",
     "unite": "m²/hab", "dimension": "env", "format": "float1", "source": "Calcul"},
    {"code": "totalclc11", "key": "TOTALCLC11", "label": "Surface CLC artif (nomenclature 11)", "unite": "m²",
     "dimension": "env", "format": "int", "source": "Corine Land Cover"},
    {"code": "totalclc11a13", "key": "TOTALCLC11a13", "label": "Surface CLC artif étendue (11 à 13)", "unite": "m²",
     "dimension": "env", "format": "int", "source": "Corine Land Cover"},
    # === Environnement / GES ===
    {"code": "ges_total", "key": "ges_total", "label": "GES total (tous secteurs)", "unite": "tCO₂eq",
     "dimension": "env", "format": "int", "source": "ADEME IGT"},
    {"code": "ges_hors_transport", "key": "GES_tot_HorsTransp", "label": "GES hors transport", "unite": "tCO₂eq",
     "dimension": "env", "format": "int", "source": "ADEME IGT"},
    {"code": "ges_agri", "key": "GES_agri", "label": "GES agriculture", "unite": "tCO₂eq",
     "dimension": "env", "format": "int", "source": "ADEME IGT"},
    {"code": "ges_route", "key": "ROUTE", "label": "GES transport routier", "unite": "tCO₂eq",
     "dimension": "env", "format": "int", "source": "ADEME IGT"},
    {"code": "ges_resid", "key": "RESID", "label": "GES résidentiel", "unite": "tCO₂eq",
     "dimension": "env", "format": "int", "source": "ADEME IGT"},
    {"code": "ges_tertiaire", "key": "TERTIAIRE", "label": "GES tertiaire", "unite": "tCO₂eq",
     "dimension": "env", "format": "int", "source": "ADEME IGT"},
    {"code": "ges_industrie", "key": "INDUSTRIE", "label": "GES industrie", "unite": "tCO₂eq",
     "dimension": "env", "format": "int", "source": "ADEME IGT"},
    {"code": "ges_energie", "key": "ENERGIE", "label": "GES production énergie", "unite": "tCO₂eq",
     "dimension": "env", "format": "int", "source": "ADEME IGT"},
    {"code": "ges_dechets", "key": "DECHETS", "label": "GES déchets", "unite": "tCO₂eq",
     "dimension": "env", "format": "int", "source": "ADEME IGT"},
    {"code": "co2_biomasse", "key": "CO2_BIOMASSE", "label": "CO₂ biomasse", "unite": "tCO₂eq",
     "dimension": "env", "format": "int", "source": "ADEME IGT"},
    {"code": "ges_transport_par_hab", "key": "ges_transport_par_hab",
     "label": "Émissions transport par habitant", "unite": "tCO₂eq/hab",
     "dimension": "env", "format": "float2", "source": "Calcul"},
    {"code": "ges_total_par_hab", "key": "ges_total_par_hab", "label": "GES total par habitant",
     "unite": "tCO₂eq/hab", "dimension": "env", "format": "float2", "source": "Calcul"},
    # === Énergie ===
    {"code": "conso_gaz", "key": "Gaz", "label": "Consommation gaz", "unite": "MWh",
     "dimension": "env", "format": "int", "source": "GRDF"},
    {"code": "conso_elec", "key": "Electricité", "label": "Consommation électricité", "unite": "MWh",
     "dimension": "env", "format": "int", "source": "RTE"},
    {"code": "total_flux_energie", "key": "TOTAL_FLUX", "label": "Flux énergie total", "unite": "MWh",
     "dimension": "env", "format": "int", "source": "RTE + GRDF"},
    {"code": "conso_energie_par_hab", "key": "conso_energie_par_hab",
     "label": "Consommation énergie par habitant", "unite": "MWh/hab",
     "dimension": "env", "format": "float2", "source": "Calcul"},
    # === Socio-éco ===
    {"code": "actifs_occupes_15_64", "key": "P21_ACTOCC1564", "label": "Actifs occupés 15-64 ans",
     "unite": "pers.", "dimension": "socio", "format": "int", "source": "INSEE Recensement 2021"},
    {"code": "part_actifs", "key": "part_actifs", "label": "Part d'actifs occupés dans la population",
     "unite": "", "dimension": "socio", "format": "percent", "source": "Calcul"},
    # === Indicateurs de synthèse AREP (déplacés en Environnement à la demande de Fabien) ===
    {"code": "indic_02a_dens_pop", "key": "02a_DENS_POP", "label": "Indicateur 02a - Densité population",
     "unite": "", "dimension": "env", "format": "float2", "source": "Calcul AREP"},
    {"code": "indic_03_art_popsup", "key": "03_ART_POPSUP",
     "label": "Indicateur 03 - Artificialisation / pop surface", "unite": "",
     "dimension": "env", "format": "float2", "source": "Calcul AREP"},
    {"code": "indic_04_ges_pop", "key": "04_GES_POP", "label": "Indicateur 04 - GES par habitant",
     "unite": "", "dimension": "env", "format": "float2", "source": "Calcul AREP"},
    {"code": "indic_05_energie_pop", "key": "05_ENERGIE_POP", "label": "Indicateur 05 - Énergie par habitant",
     "unite": "", "dimension": "env", "format": "float2", "source": "Calcul AREP"},
    # ─── Dispersion habitat / équipements (méthode La Rochelle 2025) ───
    {"code": "pct_habitat_zone_ecole_15", "key": "pct_habitat_zone_ecole_15",
     "label": "Habitat à <1,5 km d'une école",
     "unite": "%", "dimension": "struct", "format": "percent",
     "source": "Calcul AREP — BPE 2024 + Filosofi 2021 carroyé 200m",
     "description": "% de la population résidant à moins de 1,5 km d'une école élémentaire (marqueur de centralité historique). Plus c'est haut, plus l'agglo est compacte et marchable."},
    {"code": "pct_equipements_zone_ecole_15", "key": "pct_equipements_zone_ecole_15",
     "label": "Équipements à <1,5 km d'une école",
     "unite": "%", "dimension": "struct", "format": "percent",
     "source": "Calcul AREP — BPE 2024",
     "description": "% des équipements du quotidien (commerces, services, santé, sport-culture) à moins de 1,5 km d'une école élémentaire."},
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
     "description": "% des équipements du quotidien à moins de 3 km d'une gare de voyageurs."},
    # ─── Score socle équipements (méthode Fabien Rosa, GT BDDe AREP) ───
    {"code": "taux_couverture_socle", "key": "taux_couverture_socle",
     "label": "Couverture socle équipements",
     "unite": "%", "dimension": "struct", "format": "percent",
     "source": "Calcul AREP — BPE 2024, méthode Fabien Rosa (31 équip. essentiels)",
     "description": "Part du socle d'équipements essentiels (31 types : mairie, médecin, école, boulangerie...) présents dans la commune. 100% = présence de tous les équipements de base, indépendamment du nombre."},
    # === Mobilité (MOBPRO 2021, déplacements domicile-travail) ===
    {"code": "part_voiture", "key": "part_voiture",
     "label": "Usage voiture domicile-travail", "unite": "%",
     "dimension": "mob", "format": "float1", "source": "INSEE MOBPRO 2021"},
    {"code": "taux_double_motorisation", "key": "taux_double_motorisation",
     "label": "Taux de double motorisation des ménages", "unite": "%",
     "dimension": "mob", "format": "float1", "source": "INSEE MOBPRO 2021"},
    {"code": "part_travail_commune", "key": "part_travail_commune",
     "label": "Actifs travaillant dans leur commune de résidence", "unite": "%",
     "dimension": "mob", "format": "float1", "source": "INSEE MOBPRO 2021"},
    {"code": "part_voiture_sur_place", "key": "part_voiture_sur_place",
     "label": "Usage voiture parmi ceux qui travaillent sur place", "unite": "%",
     "dimension": "mob", "format": "float1", "source": "INSEE MOBPRO 2021"},
    {"code": "part_velo", "key": "part_velo",
     "label": "Part du vélo domicile-travail", "unite": "%",
     "dimension": "mob", "format": "float1", "source": "INSEE MOBPRO 2021"},
    {"code": "part_tc", "key": "part_tc",
     "label": "Part des transports en commun domicile-travail", "unite": "%",
     "dimension": "mob", "format": "float1", "source": "INSEE MOBPRO 2021"},
    {"code": "part_marche", "key": "part_marche",
     "label": "Part de la marche domicile-travail", "unite": "%",
     "dimension": "mob", "format": "float1", "source": "INSEE MOBPRO 2021"},
    # === Gouvernance (RNA associations A+R) ===
    {"code": "densite_assos_1000hab", "key": "densite_assos_1000hab",
     "label": "Densite d associations actives", "unite": "/1000 hab",
     "dimension": "gouv", "format": "float1", "source": "RNA Waldec (Min. Interieur)"},
    {"code": "nb_assos", "key": "nb_assos",
     "label": "Nombre d associations actives", "unite": "",
     "dimension": "gouv", "format": "int", "source": "RNA Waldec"},
    {"code": "densite_culture_1000hab", "key": "densite_culture_1000hab",
     "label": "Densite associations culture", "unite": "/1000 hab",
     "dimension": "gouv", "format": "float1", "source": "RNA Waldec"},
    {"code": "densite_social_1000hab", "key": "densite_social_1000hab",
     "label": "Densite associations social/solidarite", "unite": "/1000 hab",
     "dimension": "gouv", "format": "float1", "source": "RNA Waldec"},
    {"code": "densite_sport_1000hab", "key": "densite_sport_1000hab",
     "label": "Densite associations sport", "unite": "/1000 hab",
     "dimension": "gouv", "format": "float1", "source": "RNA Waldec"},
    {"code": "densite_environnement_1000hab", "key": "densite_environnement_1000hab",
     "label": "Densite associations environnement", "unite": "/1000 hab",
     "dimension": "gouv", "format": "float1", "source": "RNA Waldec"},
    {"code": "nb_install_par_1000hab", "key": "nb_install_par_1000hab",
     "label": "Installations solaires (densite)", "unite": "/1000 hab",
     "dimension": "gouv", "format": "float1", "source": "Registre ODRE (RTE/Enedis)"},
    {"code": "puis_solaire_kw_par_hab", "key": "puis_solaire_kw_par_hab",
     "label": "Puissance solaire installee", "unite": "kW/hab",
     "dimension": "gouv", "format": "float2", "source": "Registre ODRE"},
]


# ============================================================================
# Formatage
# ============================================================================
def _format_value(v: Optional[float], fmt: str) -> Optional[str]:
    if v is None:
        return None
    if fmt == "int":
        return f"{round(v):,}".replace(",", " ")
    if fmt == "float1":
        return f"{v:,.1f}".replace(",", " ").replace(".", ",")
    if fmt == "float2":
        return f"{v:,.2f}".replace(",", " ").replace(".", ",")
    if fmt == "percent":
        # Si v est un ratio (0-1), on multiplie par 100. Sinon supposé déjà en %.
        if abs(v) <= 1.0:
            v = v * 100
        return f"{v:.1f} %".replace(".", ",")
    return str(v)


# ============================================================================
# Point d'entrée
# ============================================================================
_GARES_CACHE = None


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


def get_indicateurs(territoire: dict) -> dict:
    """Renvoie les indicateurs locaux pour un territoire (commune ou EPCI)."""
    try:
        fiche = data_store.get_territoire(territoire)
    except RuntimeError as e:
        return {"_erreur": str(e)}

    if not fiche:
        type_lbl = territoire.get("type", "?").capitalize()
        return {"_erreur": f"{type_lbl} {territoire.get('code')} absent du cache précalculé."}

    result = {}
    for ind in INDICATEURS_DEF:
        val = fiche.get(ind["key"])
        result[ind["code"]] = {
            "valeur": val,
            "valeur_formatee": _format_value(val, ind["format"]),
            "libelle": ind["label"],
            "unite": ind["unite"],
            "source": ind["source"],
            "dimension": ind["dimension"],
            "statut": "ok" if val is not None else "indisponible",
        }

    _apply_gares(result, territoire)
    return result


def list_indicateurs_def() -> list:
    """Pour la route /indicateurs/def."""
    return [
        {"code": ind["code"], "label": ind["label"], "unite": ind["unite"],
         "source": ind["source"], "dimension": ind["dimension"],
         "format": ind["format"]}
        for ind in INDICATEURS_DEF
    ]
