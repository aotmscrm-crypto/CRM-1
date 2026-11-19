---
kind: external_dependency
name: Vercel — static frontend hosting
slug: vercel
category: external_dependency
category_hints:
    - client_constraint
scope:
    - '**'
source_files:
    - frontend/vercel.json
---

### Identity
The React/Vite frontend is built and served from Vercel. `vercel.json` rewrites all routes to `/` for SPA routing.

### Client constraint
The frontend runs as a static site; there is no server-side rendering and no API routes on Vercel — all API calls go to the separate Render-hosted backend.