---
kind: dependency_management
name: NPM-based Dependency Management with Lockfiles per Workspace
category: dependency_management
scope:
    - '**'
source_files:
    - backend/package.json
    - backend/package-lock.json
    - frontend/package.json
    - frontend/package-lock.json
---

## Approach

This repository uses **npm** as its package manager across two independent Node.js workspaces — `backend/` (Express server) and `frontend/` (React + Vite SPA). There is no monorepo tool (no `package.json` at the repo root, no `pnpm-workspace.yaml`, no Lerna/Nx config); each workspace manages its own dependencies independently.

## Key Files

- `backend/package.json` — declares backend runtime dependencies (`express`, `mongoose`, `socket.io`, `axios`, `cloudinary`, `jsonwebtoken`, `pino`, `xlsx`, etc.) and dev dependencies (`nodemon`).
- `backend/package-lock.json` — npm v3 lockfile pinning exact transitive versions for reproducible installs.
- `frontend/package.json` — declares frontend dependencies (`react`, `react-dom`, `vite`, `tailwindcss`, `framer-motion`, `zustand`, `@radix-ui/themes`, etc.) and dev dependencies (`eslint`, `@vitejs/plugin-react`, `daisyui`).
- `frontend/package-lock.json` — lockfile for the frontend workspace.

No `.npmrc`, `yarn.lock`, `pnpm-lock.yaml`, `go.mod`, or `vendor/` directories exist at the repo root or in either workspace.

## Architecture & Conventions

- **Per-workspace manifests**: Each subproject has its own `package.json` and `package-lock.json`; there is no shared top-level dependency declaration.
- **Caret ranges (`^x.y.z`)**: All version specifiers use caret ranges, allowing minor/patch upgrades within the declared major version. This is consistent across both `dependencies` and `devDependencies` in both workspaces.
- **Lockfiles committed**: Both `package-lock.json` files are present in the repo, ensuring deterministic builds from the same manifest.
- **Dev vs production split**: Dependencies are cleanly separated into `dependencies` (runtime) and `devDependencies` (tooling such as `nodemon`, `eslint`, `vite`, `@types/*`).
- **Private registry / vendoring**: No private npm registry is configured (no `.npmrc`, no `registry=` entries, no `NPM_CONFIG_REGISTRY` env var usage found). No packages are vendored under `node_modules/` in source control; `node_modules/` appears only as generated artifacts.
- **Workspace isolation**: The frontend and backend share no npm packages between them — e.g., `xlsx` is declared independently in both workspaces rather than hoisted from a shared scope.

## Observed Conventions

- Runtime libraries are pinned to semver-compatible ranges via `^` prefixes in `package.json`.
- Exact resolved versions and integrity hashes are captured in `package-lock.json` (lockfileVersion 3).
- Development-only tooling (`nodemon`, `eslint`, `vite`) is kept out of `dependencies`.
- The frontend marks itself as `"private": true` and uses ESM mode (`"type": "module"`).
- No custom npm registry, proxy, or authentication configuration was found — packages resolve against the default public npm registry.