"""Configuration centralisée."""
from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent

load_dotenv(ROOT_DIR / ".env")

# --- APIs publiques (pas d'auth) ---
GEO_API_BASE = "https://geo.api.gouv.fr"

# --- Paths ---
CACHE_DIR = BASE_DIR / "cache"
CACHE_DIR.mkdir(exist_ok=True)
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)
GOUVERNANCE_DB = DATA_DIR / "gouvernance.db"

# --- Cache ---
CACHE_TTL_SECONDS = int(os.getenv("CACHE_TTL_SECONDS", "86400"))

# --- CORS ---
# En local : "*" (tout autorisé). En prod AREP, définir ALLOWED_ORIGINS dans le .env,
# ex. ALLOWED_ORIGINS="https://empreintes.arep.fr,https://intranet.arep.fr"
ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()
]

# --- App ---
APP_TITLE = "Empreintes · Nos territoires décarbonés"
APP_VERSION = "0.3.0"
