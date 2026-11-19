---
kind: configuration_system
name: Environment-Based Configuration via dotenv and process.env
category: configuration_system
scope:
    - '**'
source_files:
    - backend/.env
    - frontend/.env
    - backend/server.js
    - backend/utils/metaConfigHelper.js
    - backend/utils/cloudinaryService.js
    - backend/routes/auth.js
    - backend/routes/whatsapp.js
    - backend/routes/template.js
    - backend/models/User.js
    - backend/utils/conversationFlow.js
    - frontend/vite.config.js
---

# Configuration System

## Approach
The ZestEat platform uses a simple **`.env` + `dotenv`** configuration system with no schema validation, config abstraction layer, or feature-flag framework. All runtime settings are loaded directly from `process.env` at startup.

## Key Files
- `backend/.env` — backend secrets and service credentials (MongoDB, Meta WhatsApp, Cloudinary, JWT)
- `frontend/.env` — Vite client-side variable (`VITE_API_BASE_URL`)
- `backend/server.js` — entry point that calls `require('dotenv').config()` and reads env vars for DB connection, port, and cron scheduling
- `backend/utils/metaConfigHelper.js` — centralizes Meta WhatsApp Business API credentials resolution
- `backend/utils/cloudinaryService.js` — Cloudinary SDK initialization from env
- `backend/package.json` — declares `dotenv` as a dependency
- `frontend/vite.config.js` — Vite dev proxy target (`http://127.0.0.1:8000`) is hardcoded here

## Architecture & Conventions

### Backend
- `dotenv` is required at the very top of `server.js` before any other module runs, so all `process.env` access throughout the app sees the `.env` values.
- There is **no config object, validator, or typed schema**. Each file reads `process.env.X` directly where needed:
  - `server.js`: `MONGODB_URI`, `PORT`
  - `routes/auth.js`, `models/User.js`: `JWT_SECRET`
  - `routes/whatsapp.js`, `routes/template.js`, `utils/metaConfigHelper.js`: `META_WA_ACCESS_TOKEN`, `META_WA_PHONE_NUMBER_ID`, `META_WA_VERIFY_TOKEN`, `META_GRAPH_VERSION`, `META_WA_BUSINESS_ACCOUNT_ID`
  - `utils/cloudinaryService.js`: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
  - `utils/conversationFlow.js`: `RENDER_EXTERNAL_URL`
- A two-tier fallback pattern is used consistently: **runtime env → in-memory DB config → hard-coded default**. For example, `metaConfigHelper.js` resolves `verifyToken` as `dbConfig.verifyToken || process.env.META_WA_VERIFY_TOKEN || 'zest_eat_meta_verify_8f9q2a'`, and `version` as `dbConfig.graphVersion || process.env.META_GRAPH_VERSION || 'v19.0'`. The same pattern appears in `routes/whatsapp.js` and `routes/auth.js`.
- MongoDB connects with an explicit fallback: `process.env.MONGODB_URI || 'mongodb://localhost:27017/mutton_chicken_shop'`.
- Port defaults to `5000` when `PORT` is unset.

### Frontend
- Uses Vite's built-in `import.meta.env` mechanism; only one variable is defined: `VITE_API_BASE_URL=YOUR_API` in `frontend/.env`.
- The actual API base URL used by the frontend is not read from this variable in the scanned code — instead, `frontend/src/services/api.js` and `vite.config.js` use a hardcoded dev proxy target of `http://127.0.0.1:8000`.

## Conventions & Constraints

- **No environment validation**: Missing env vars are consumed silently and fall back to hard-coded defaults (e.g., `'aotms_secret_salt_2026'` for JWT, `'zest_eat_meta_verify_8f9q2a'` for Meta verify token, `'v19.0'` for graph version). This is enforced by the code itself — there is no `throw new Error(...)` on missing variables except in `cloudinaryService.js`, which checks `!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY` before calling Cloudinary methods.
- **Secrets live in plain-text `.env` files** committed to the repository (the backend `.env` contains real-looking tokens and keys). There is no `.env.example`, no secret manager integration, and no encryption.
- **No layered configuration files** (no YAML/TOML/JSON config files, no per-environment configs like `.env.production`).
- **No feature flags or toggle system** — behavior is controlled purely by env var presence/values.
- **Meta WhatsApp credentials can be overridden per user** via the `MetaConfig` model in the database; the helper resolves them in order: DB config first, then `process.env`, then hard-coded default. This is the only dynamic override path beyond env vars.
- **Frontend build-time vs runtime separation**: Vite's `VITE_*` variables are baked into the bundle at build time; the dev server proxies `/api` requests to `http://127.0.0.1:8000` regardless of `VITE_API_BASE_URL`.

## What Is Not Present
- No config schema library (Joi, Zod, Yup).
- No config abstraction module (no `config.js` factory).
- No per-environment `.env.*` files.
- No secret rotation or vault integration.
- No configuration migration or versioning.