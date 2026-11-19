---
kind: external_dependency
name: Meta WhatsApp Business Platform (Cloud API) — outbound messages, templates, media, webhooks
slug: meta-whatsapp-cloud-api
category: external_dependency
category_hints:
    - sdk_real_api
    - auth_protocol
    - framework_behavior
scope:
    - '**'
source_files:
    - backend/utils/metaConfigHelper.js
    - backend/utils/whatsappService.js
    - backend/utils/metaTemplateService.js
    - backend/routes/template.js
    - backend/routes/whatsapp.js
---

### Identity
The production messaging provider is Meta's **WhatsApp Cloud API** (Graph API v19.0), accessed via a WhatsApp Business Account (`wabaId`) and phone number (`phoneId`). Credentials resolve from `MetaConfig` DB doc → module cache → `.env`.

### Role
- Outbound: text, image, buttons, list menus, polls, and approved message templates sent through `/messages` and `/media` endpoints.
- Templates: create/import/sync/approve status via `/message_templates`; header images uploaded through the resumable `/app/uploads` flow to obtain a `header_handle` before calling the template endpoint.
- Inbound: webhook at `POST /api/whatsapp/webhook` echoes Meta's `hub.challenge` against `verifyToken`, then dispatches `messages` and `statuses` change entries.

### Integration shape
- Auth uses the WABA access token supplied in the request; no OAuth flow lives in this repo — tokens are stored in plaintext in `MetaConfig.accessToken`.
- Template creation requires two-step media upload: first get a `header_handle` via resumable upload, then include it when creating the template.
- Webhook payload must be read from `entry[0].changes[0]` only; batched deliveries beyond the first element are dropped by current code.
- Verify inbound requests with `X-Hub-Signature-256` against `verifyToken` — currently not implemented.

Verify exact Graph API method names and field shapes against the official Meta docs.