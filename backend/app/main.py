"""Example FastAPI service.

Serves a small JSON API under /api and, when present, the built frontend at /.
"""

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

APP_NAME = os.getenv("APP_NAME", "devworkflow-example")
APP_VERSION = os.getenv("APP_VERSION", "dev")

# The frontend is a Next.js static export. Locally `npm run build` in frontend/ writes it
# to frontend/out. In the container it is copied to /app/static and STATIC_DIR is set by
# the Dockerfile.
STATIC_DIR = Path(
    os.getenv("STATIC_DIR", Path(__file__).resolve().parents[2] / "frontend" / "out")
)

app = FastAPI(title=APP_NAME, version=APP_VERSION)


@app.get("/api/health")
def health() -> dict:
    """Liveness check used by the container HEALTHCHECK and any load balancer."""
    return {"status": "ok", "name": APP_NAME, "version": APP_VERSION}


@app.get("/api/hello")
def hello(name: str = "world") -> dict:
    return {"message": f"Hello, {name}!"}


# Mounted last so the /api routes above take priority over the static files.
# html=True serves index.html for directories and the exported 404.html for misses.
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
