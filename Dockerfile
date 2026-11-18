# Single image: FastAPI serves both the API (/api/*) and the built frontend (/).
#
# Two stages:
#   frontend - Node builds the Next.js app into static files (frontend/out). Build-time only.
#   final    - Python image with FastAPI plus those static files. No Node at runtime.
#
# Build args let the same Dockerfile work on the open internet and behind Nexus:
#   BASE_REGISTRY  - where base images come from (e.g. a Nexus docker-proxy repo)
#   NPM_REGISTRY   - where npm packages come from (e.g. a Nexus npm-proxy repo)
#   PIP_INDEX_URL  - where Python packages come from (e.g. a Nexus pypi-proxy repo)
#   APP_VERSION    - baked into the image; CI passes the git tag or commit SHA

ARG BASE_REGISTRY=docker.io

# ---- frontend: build the static export ---------------------------------------------------
FROM ${BASE_REGISTRY}/library/node:24-alpine AS frontend

ARG NPM_REGISTRY=https://registry.npmjs.org
ENV NEXT_TELEMETRY_DISABLED=1 \
    npm_config_registry=${NPM_REGISTRY}

WORKDIR /frontend

# Dependencies first, so this layer is cached until package-lock.json changes.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY frontend ./
RUN npm run build

# ---- final: FastAPI + static files -------------------------------------------------------
FROM ${BASE_REGISTRY}/library/python:3.12-slim

ARG PIP_INDEX_URL=https://pypi.org/simple
ARG APP_VERSION=dev

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_VERSION=${APP_VERSION} \
    STATIC_DIR=/app/static

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir --index-url "${PIP_INDEX_URL}" -r requirements.txt

COPY backend/app ./app
COPY --from=frontend /frontend/out ./static

RUN useradd --create-home --uid 10001 appuser
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
