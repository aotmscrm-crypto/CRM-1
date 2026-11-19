---
kind: build_system
name: Build System — NPM Scripts, Vite, and Vercel Deployment
category: build_system
scope:
    - '**'
source_files:
    - backend/package.json
    - frontend/package.json
    - frontend/vite.config.js
    - frontend/vercel.json
---

## What system/approach is used

The repository has no centralized build orchestration (no Makefile, Dockerfile, docker-compose.yml, CI pipeline, or shell scripts at the repo root). Build and deployment are handled per-subproject using standard Node.js tooling:

- **Backend** (`backend/`): plain Node.js + Express. Development uses `nodemon`; production runs `node server.js`. Dependencies are managed via npm (`package.json` + `package-lock.json`).
- **Frontend** (`frontend/`): React SPA built with **Vite**. The production build outputs a static bundle under `frontend/dist/`, which is then deployed to **Vercel** (configured by `frontend/vercel.json`).

There is no cross-compilation, containerization, artifact registry, or release automation in this repository.

## Key files and packages

- `backend/package.json` — backend entrypoint (`server.js`), dev script (`nodemon server.js`), runtime dependencies (Express, Socket.io, Mongoose, Cloudinary, etc.).
- `frontend/package.json` — frontend scripts (`dev`, `build`, `lint`, `preview`), Vite + React toolchain, Tailwind/DaisyUI/Framer Motion/etc.
- `frontend/vite.config.js` — Vite configuration for the SPA build.
- `frontend/vercel.json` — Vercel rewrites rule routing all paths to `/` for client-side routing.
- `frontend/.env` / `backend/.env` — environment variable files consumed at runtime.

## Architecture and conventions

- **Dual-package layout**: each subdirectory is an independent npm project with its own `package.json`, `package-lock.json`, and dependency tree. There is no monorepo manager (no `pnpm workspaces`, `yarn workspace`, `lerna`, `nx`, etc.).
- **Backend convention**: start via `npm start` → `node server.js`; develop via `npm run dev` → `nodemon server.js`. No test runner or lint script is defined in the backend package.
- **Frontend convention**: `npm run dev` starts the Vite dev server; `npm run build` produces the static assets in `dist/`; `npm run lint` runs ESLint; `npm run preview` serves the built output locally.
- **Deployment convention**: the frontend is intended to be deployed as a static site on Vercel (the presence of `vercel.json` with a catch-all rewrite to `/` is the only deployment signal in the repo). The backend has no deployment configuration in this repository.

## Conventions and constraints

- Each subproject manages its own dependencies independently via npm lockfiles (`backend/package-lock.json`, `frontend/package-lock.json`).
- Frontend source code lives under `frontend/src/` and is compiled by Vite into `frontend/dist/` on `npm run build`.
- Environment variables are loaded from `.env` files at both ends (via `dotenv` on the backend; Vite's env loading on the frontend).
- No build-time version pinning beyond what npm resolves from `package.json` ranges; there is no shared version manifest or CI step that enforces a version bump policy.
- No automated tests, linters (beyond the frontend ESLint config), or CI pipelines are present in the repository.