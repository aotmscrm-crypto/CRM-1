---
kind: external_dependency
name: Render — hosted backend deployment target
slug: render
category: external_dependency
category_hints:
    - client_constraint
scope:
    - '**'
source_files:
    - frontend/src/services/api.js
---

### Identity
The backend is deployed on Render at `crm-1-62pl.onrender.com`. The frontend resolves its API base URL to this hostname when not running on localhost.

### Client constraint
Frontend calls bypass Vite dev proxy (which points at port 8000) and use absolute URLs to the Render-hosted backend; changing the backend port or hostname requires updating the frontend's API base resolution.