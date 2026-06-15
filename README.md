# Empreintes · Nos territoires décarbonés

Outil de diagnostic territorial multicritère développé pour le GT Base de Données environnementales (AREP, pôle Conseil & Programmation).

Démo en ligne : https://arep-bdde.onrender.com/app

## Ce que fait l'outil

Empreintes objective le lien entre organisation urbaine et dépendance automobile, à l'échelle EPCI (environ 1 250 intercommunalités) et commune (environ 34 900). Il agrège des indicateurs issus de sources publiques (INSEE, ADEME, IGN, OSM) sur plusieurs dimensions, et positionne chaque territoire par rapport à ses pairs typologiques INSEE.

Cinq territoires pilotes sont visés en priorité : CA La Rochelle, Grand Reims, Pays Basque, Nevers Agglo, Golfe Morbihan-Vannes.

## Architecture

```
.
├── backend/                  API FastAPI (Python)
│   ├── app.py                routes + service du frontend
│   ├── config.py             configuration centralisée (lit le .env)
│   ├── cache_store.py        cache disque des appels externes
│   ├── data/                 données (CSV, JSON, cache précalculé)
│   └── services/
│       ├── data_store.py     chargement unique du cache précalculé
│       ├── scoring.py        notation par quantiles typologiques
│       ├── notation_points.py notation V3 par points
│       ├── indicateurs_locaux.py
│       ├── carto.py          couches cartographiques
│       ├── bpe.py            équipements (base permanente des équipements)
│       ├── filosofi.py       données socio-économiques
│       ├── gouvernance.py    indicateurs à saisie manuelle
│       └── geo.py            contours et métadonnées (geo.api.gouv.fr)
├── frontend/                 interface (HTML / CSS / JS, sans framework)
│   ├── index.html            structure HTML uniquement
│   ├── css/
│   │   └── style.css         toutes les feuilles de style
│   ├── js/
│   │   ├── app.js            cœur applicatif (état, appels API, rendu)
│   │   ├── carto.js          carte Leaflet
│   │   ├── intro.js          animation d'accueil
│   │   └── dev-tweaks.js     panneau de réglages (développement)
│   └── assets/               images, logos
├── scripts/                  préparation des données (hors runtime)
│   ├── precompute_cache.py   génère backend/data/precomputed.pkl.gz
│   ├── convert_*.py          conversion des fichiers sources INSEE en CSV
│   ├── extract_*.py          extraction des couches carto
│   └── compute_*.py          calculs (dispersion, score socle)
├── requirements.txt
├── .env.example              modèle de configuration (à copier en .env)
└── .python-version           3.11.9
```

Le HTML, le CSS et le JavaScript sont séparés : `index.html` ne contient que du balisage, les styles sont dans `css/style.css`, et le JavaScript est découpé par responsabilité dans `js/`.

## Prérequis

- Python 3.11 (voir `.python-version`)
- Les fichiers de données dans `backend/data/` (CSV INSEE et `precomputed.pkl.gz`)

## Installation et lancement en local

```bash
# 1. environnement virtuel
python -m venv .venv
source .venv/bin/activate          # Windows : .venv\Scripts\activate

# 2. dépendances
pip install -r requirements.txt

# 3. configuration
cp .env.example .env               # ajuster si besoin

# 4. cache précalculé (obligatoire au premier lancement)
#    data_store.py charge ce fichier au démarrage ; sans lui l'API renvoie une erreur explicite.
python -m scripts.precompute_cache

# 5. lancer le serveur
python -m uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000
```

Interface : http://localhost:8000/app
API (exemple) : http://localhost:8000/indicateurs/200067213

## Déploiement

Le backend est hébergé sur Render et sert aussi le frontend. Le frontend peut également être servi en statique (Vercel), auquel cas il appelle le backend via `BACKEND_URL` (déterminé automatiquement côté client : `localhost` en développement, origine courante en production).

Principe à respecter pour un futur passage sur serveur AREP : seule la configuration change, jamais le code. Les paramètres sensibles passent par le `.env` (jamais commité). Le CORS est piloté par `ALLOWED_ORIGINS` (par défaut `*` en local, à restreindre en production).

Note sur les données : la version actuelle commite les CSV et le cache `precomputed.pkl.gz` dans le dépôt, ce qui permet à Render de fonctionner sans étape de build. Pour un dépôt plus léger, voir le bloc optionnel dans `.gitignore` (génération du cache au build).

## Sources de données

INSEE (recensement, Filosofi, base permanente des équipements, typologie CATAEU2010), ADEME, IGN, OpenStreetMap (via Overpass pour les couches cartographiques). Les fichiers sources sont transformés en CSV légers par les scripts du dossier `scripts/`, puis agrégés dans le cache précalculé.

## Méthodologie

Le positionnement de chaque territoire se fait par quantiles à l'intérieur de son groupe typologique INSEE, ce qui évite de comparer une métropole à une petite agglomération. L'agrégation à l'échelle EPCI se fait par somme pour les stocks (population, émissions, surface) et par moyenne pondérée par la population pour les ratios.

Le système de notation et le choix des indicateurs affichés sont en cours de révision avec le GT.
