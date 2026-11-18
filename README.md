# DevWorkflow example

A template for a new GitLab project: a small FastAPI backend and a Next.js frontend,
packaged as one container image, with a GitLab CI/CD pipeline that tests the code,
builds the image, and pushes it to a Nexus Docker registry.

It covers three standard steps:

1. **Create the project in a GitLab group** and push this code to it
2. **Start from the example app** in `backend/` and `frontend/`
3. **Run the CI/CD pipeline**, which tests, builds a container image, and pushes it to Nexus

```
.
├── .gitlab-ci.yml                      # project pipeline: includes the template, sets IMAGE_NAME
├── ci/templates/
│   └── python-container.gitlab-ci.yml  # reusable pipeline (test → build → publish)
├── backend/                            # FastAPI app, tests, requirements
├── frontend/                           # Next.js app (src/app), built to static files served at /
├── Dockerfile                          # two stages: Node builds the frontend, Python runs the app
├── docker-compose.yml                  # local run
├── .gitattributes                      # forces LF line endings (important on Windows)
└── .dockerignore
```

## How the frontend and backend fit together

There is one container and one process: uvicorn running FastAPI.

The frontend is a Next.js app exported as static files (`output: "export"` in
`frontend/next.config.mjs`). During `docker build`, a Node stage runs `next build`, which
writes plain HTML/JS/CSS to `frontend/out/`. The final Python image copies that folder to
`/app/static`, and FastAPI serves it at `/` next to the API at `/api/*`. Node is only
used to build the files and isn't in the final image.

The browser runs the React code and calls `fetch("/api/...")` on the same origin, so
there's no CORS and no backend URL to configure.

What this rules out: Next.js features that need a Node server at request time, such as
route handlers (`app/api/...`), server actions, middleware, request-time rendering, and
the image optimizer. Put server logic in FastAPI. Dynamic routes such as `/orders/[id]`
need `generateStaticParams`, or use a static page that reads `?id=` and fetches in the
browser.

## Run it locally

With Docker:

```bash
docker compose up --build
# open http://localhost:8000  (API at /api/health and /api/hello)
```

Without Docker, run the backend and frontend dev servers in two terminals:

```bash
# Terminal 1: backend on :8000
cd backend
python -m venv .venv
.venv/Scripts/activate        # Windows (Git Bash); on Linux/macOS: source .venv/bin/activate
pip install -r requirements-dev.txt
ruff check .
pytest
uvicorn app.main:app --reload

# Terminal 2: frontend on :3000 (open this one)
cd frontend
npm install
npm run typecheck
npm run dev                   # open http://localhost:3000
```

Both reload on save. In development only, `next dev` forwards `/api/*` to uvicorn on
port 8000, so the browser sees one origin just as it does in production.

To try the production layout without Docker, run `npm run build` in `frontend/`. FastAPI
then serves `frontend/out` at http://localhost:8000.

## 1. Create the project in a GitLab group

In GitLab, open the group and choose **New project → Create blank project**. Untick
"Initialize repository with a README", so the project starts empty.

Then, in the project's settings:

- **Settings → Merge requests:** tick "Pipelines must succeed" and "All threads must be
  resolved". Optionally choose fast-forward merges and "Delete source branch" by default.
- **Settings → General → Visibility:** turn off **Container registry**, because images
  go to Nexus.

Push this code into it:

```bash
git remote add origin git@gitlab.example.com:my-team/services/orders-api.git
git push -u origin main
```

## 2. The pipeline

| Stage     | Job             | Runs on                 | What it does                                                  |
|-----------|-----------------|-------------------------|---------------------------------------------------------------|
| `test`    | `test:backend`  | every pipeline          | `ruff check` and `pytest`, with JUnit results shown in the MR |
| `test`    | `test:frontend` | if `frontend/package-lock.json` exists | `npm ci`, `npm run typecheck`, `npm run build` |
| `build`   | `build:image`   | every pipeline          | `docker build`, then saves the image as a job artifact        |
| `publish` | `publish:nexus` | default branch and tags | loads that same image, tags it, and pushes it to Nexus        |

Image tags pushed:

- **Commit to the default branch:** `<short-sha>`
- **Git tag** (e.g. `v1.2.0`): `v1.2.0`

Merge requests run test and build only. They never push to Nexus.

### CI/CD variables

Set these **once at group level** (Group > Settings > CI/CD > Variables) so every
project inherits them:

| Variable          | Example                                               | Notes |
|-------------------|-------------------------------------------------------|-------|
| `NEXUS_REGISTRY`  | `nexus.corp.local:8443`                               | Host and port of the Nexus **docker hosted** repo connector, not the Nexus UI URL |
| `NEXUS_USERNAME`  | `svc-gitlab-ci`                                       | Service account with push rights |
| `NEXUS_PASSWORD`  | `…`                                                   | **Masked** and **protected** |
| `BASE_REGISTRY`   | `nexus.corp.local:8444`                               | Nexus docker proxy or group repo used to pull base images (`library/python`, `library/node`, `library/docker`) |
| `PIP_INDEX_URL`   | `https://nexus.corp.local/repository/pypi-all/simple` | Nexus PyPI proxy |
| `NPM_REGISTRY`    | `https://nexus.corp.local/repository/npm-all/`        | Nexus npm proxy |

Set this per project in `.gitlab-ci.yml`:

| Variable      | Example             |
|---------------|---------------------|
| `IMAGE_NAME`  | `orders-api`, or `my-team/orders-api` to put it under a folder in Nexus |
| `BACKEND_DIR` | `backend` (default) |
| `FRONTEND_DIR` | `frontend` (default) |

Because `NEXUS_PASSWORD` is protected, the publish job only gets it on protected
branches and tags. Protect `main` (the default), and protect tags with a pattern
such as `v*`.

## Porting this to work: checklist

- [ ] Move `ci/templates/python-container.gitlab-ci.yml` into a central project (e.g. `my-group/ci-templates`) and switch `.gitlab-ci.yml` to `include: project:` (an example is in the file).
- [ ] Add the group-level CI/CD variables above.
- [ ] Ask the GitLab admins whether runners allow **privileged** Docker-in-Docker. If they don't, see the next section.
- [ ] If Docker-in-Docker is used with the Docker executor, the runner's `config.toml` needs `volumes = ["/certs/client", "/cache"]`.
- [ ] Check which Nexus repos exist: docker hosted (push), docker proxy or group (pull), PyPI proxy, and npm proxy. Note each one's connector port.
- [ ] `package-lock.json` records the registry each package was downloaded from (`resolved` URLs). npm uses the configured registry for those URLs only when they point at the default registry, so generate the lockfile against registry.npmjs.org (as here) or against the Nexus npm proxy, but don't mix the two.
- [ ] If Nexus uses an internal CA, the Node build stage needs to trust it as well. Set `NODE_EXTRA_CA_CERTS` in the frontend stage.
- [ ] If Nexus uses an internal CA, the Docker daemon in the dind service has to trust it. Ask the runner admins how the CA is distributed. A common approach is mounting it at `/etc/docker/certs.d/<registry>/ca.crt`.
- [ ] If Nexus is plain HTTP, uncomment the `--insecure-registry` line in the `.docker` job.
- [ ] If Nexus needs a login to **pull**, the runner can't pull the job images (`python`, `docker`) without it. Add a group-level `DOCKER_AUTH_CONFIG` variable, and don't make it protected, because MR pipelines need it too.
- [ ] The built image is passed from `build` to `publish` as a job artifact (about 50 MB gzipped for this example). Check the instance's maximum artifact size (default 100 MB).
- [ ] Set the Nexus cleanup policy for the hosted repo. Every default-branch commit pushes a `<short-sha>` tag.

### No privileged runners

Docker-in-Docker needs privileged runners. If those aren't allowed, replace the
`.docker`-based `build:image` and `publish:nexus` jobs with a rootless builder.
**Buildah** is a good choice (Kaniko's original Google repo was archived in 2025).
The shape is the same. This is an **untested sketch**:

```yaml
build:image:
  image: quay.io/buildah/stable
  variables:
    STORAGE_DRIVER: vfs
    BUILDAH_ISOLATION: chroot
  script:
    - buildah bud --build-arg BASE_REGISTRY=... -t "${IMAGE_NAME}:build" .
    - buildah push "${IMAGE_NAME}:build" docker-archive:image.tar
```

The publish job then logs in with `buildah login`, and runs `buildah pull docker-archive:image.tar`
and `buildah push`.

## Status

What has been verified locally:

- ruff and pytest pass
- the frontend type-checks and `next build` produces the static export, which FastAPI serves (including the exported 404 page)
- `next dev` forwards `/api/*` to uvicorn
- the lockfile includes the Linux (musl) native packages the Alpine build stage needs
- before the Next.js change: the Docker image built, started as a non-root user, passed its healthcheck, and served `/` and `/api/*`. **The two-stage Dockerfile has not been built yet.**
- the `docker save | gzip` → `docker load` handoff used between the build and publish jobs works

**Not yet run anywhere real:**

- the pipeline on a GitLab runner (Docker-in-Docker, cache, rules)
- the push to Nexus

Expect to fix details on the first run at work. Paste the YAML into GitLab's **CI Lint**
(Build > Pipeline editor) first.
