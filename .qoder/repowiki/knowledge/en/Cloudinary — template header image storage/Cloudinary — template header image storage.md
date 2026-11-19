---
kind: external_dependency
name: Cloudinary — template header image storage
slug: cloudinary
category: external_dependency
category_hints:
    - sdk_real_api
scope:
    - '**'
source_files:
    - backend/utils/cloudinaryService.js
    - backend/utils/metaTemplateService.js
---

### Identity

### Role
Template header images are uploaded to Cloudinary first, then the public URL is passed to Meta's template creation flow as an alternative to the resumable upload path.

### Integration shape
- Uploads go through the Cloudinary Node SDK; URLs returned are embedded into Meta template components.
- If Cloudinary upload fails, the template service falls back to a hardcoded Unsplash URL.

Verify exact Cloudinary config keys and upload parameters against the official docs.