# Template Management

<cite>
**Referenced Files in This Document**   
- [Template.js](file://backend/models/Template.js)
- [template.js](file://backend/routes/template.js)
- [metaTemplateService.js](file://backend/utils/metaTemplateService.js)
- [conversationFlow.js](file://backend/utils/conversationFlow.js)
- [Whatsapp_Message.jsx](file://frontend/src/Dashboard/Whatsapp_Message.jsx)
- [WhatsappBlast.jsx](file://frontend/src/Dashboard/WhatsappBlast.jsx)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)

## Introduction
This document explains the template management system for WhatsApp messaging, covering:
- Template creation, editing, and synchronization with Meta’s template system
- Approval workflows and status tracking
- Parameterized messages and dynamic content insertion
- Preview and testing capabilities
- Bulk operations and campaign execution
- Versioning considerations and rollback strategies
- Performance optimization recommendations

The system supports text templates, media attachments (images, videos, documents), and interactive buttons. Templates are stored locally and synchronized with Meta, where approval is required before sending.

## Project Structure
The template feature spans backend models, routes, utilities, and frontend dashboards:
- Backend model defines template schema and fields
- Routes expose endpoints for CRUD, sync, send, schedule, and stats
- Utilities handle Meta API interactions and message composition
- Frontend provides editor, preview, bulk blast, and live chat integration

```mermaid
graph TB
subgraph "Frontend"
FE_Msg["Whatsapp_Message.jsx"]
FE_Blast["WhatsappBlast.jsx"]
end
subgraph "Backend"
RT_Tpl["routes/template.js"]
MOD_Tpl["models/Template.js"]
UT_Meta["utils/metaTemplateService.js"]
UT_Cflow["utils/conversationFlow.js"]
end
FE_Msg --> RT_Tpl
FE_Blast --> RT_Tpl
RT_Tpl --> MOD_Tpl
RT_Tpl --> UT_Meta
RT_Tpl --> UT_Cflow
```

**Diagram sources**
- [template.js:1-11](file://backend/routes/template.js#L1-L11)
- [Template.js:1-42](file://backend/models/Template.js#L1-L42)
- [metaTemplateService.js:1-20](file://backend/utils/metaTemplateService.js#L1-L20)
- [conversationFlow.js:1-8](file://backend/utils/conversationFlow.js#L1-L8)
- [Whatsapp_Message.jsx:376-448](file://frontend/src/Dashboard/Whatsapp_Message.jsx#L376-L448)
- [WhatsappBlast.jsx:67-113](file://frontend/src/Dashboard/WhatsappBlast.jsx#L67-L113)

**Section sources**
- [Template.js:1-42](file://backend/models/Template.js#L1-L42)
- [template.js:1-11](file://backend/routes/template.js#L1-L11)
- [metaTemplateService.js:1-20](file://backend/utils/metaTemplateService.js#L1-L20)
- [conversationFlow.js:1-8](file://backend/utils/conversationFlow.js#L1-L8)
- [Whatsapp_Message.jsx:376-448](file://frontend/src/Dashboard/Whatsapp_Message.jsx#L376-L448)
- [WhatsappBlast.jsx:67-113](file://frontend/src/Dashboard/WhatsappBlast.jsx#L67-L113)

## Core Components
- Template Model: Stores both legacy fields and Meta-specific fields, including components, metaTemplateId, metaStatus, and WABA association.
- Template Routes: Provide endpoints to create/update/import/sync templates, check status, send templates, schedule broadcasts, and fetch stats.
- Meta Template Service: Handles Meta API calls for creating templates, fetching all templates, checking status, and uploading media.
- Conversation Flow: Composes parameters for header media and body variables, then sends via Meta Cloud API.
- Frontend Editor and Blast UI: Provides template creation/editing, preview, parameter substitution, sync, and bulk dispatch.

Key responsibilities:
- Create or update templates locally and on Meta
- Synchronize templates from Meta into local storage
- Validate and sanitize components (variables, buttons, headers)
- Send approved templates to contacts with dynamic content
- Schedule and run broadcasts

**Section sources**
- [Template.js:1-42](file://backend/models/Template.js#L1-L42)
- [template.js:283-365](file://backend/routes/template.js#L283-L365)
- [metaTemplateService.js:114-154](file://backend/utils/metaTemplateService.js#L114-L154)
- [conversationFlow.js:21-118](file://backend/utils/conversationFlow.js#L21-L118)
- [Whatsapp_Message.jsx:763-845](file://frontend/src/Dashboard/Whatsapp_Message.jsx#L763-L845)
- [WhatsappBlast.jsx:276-327](file://frontend/src/Dashboard/WhatsappBlast.jsx#L276-L327)

## Architecture Overview
The template lifecycle involves:
- Creation: Frontend builds components; backend validates and submits to Meta; stores local copy with metaTemplateId and metaStatus.
- Sync: Fetch all templates from Meta; deduplicate; auto-host images to Cloudinary; persist locally.
- Approval Workflow: Check status against Meta; enforce APPROVED state before sending.
- Sending: Compose parameters (header media, body variables); send via Meta Cloud API; log results.
- Preview/Test: Render preview with sample values; test single send; bulk blast to selected recipients.

```mermaid
sequenceDiagram
participant FE as "Frontend"
participant RT as "Template Routes"
participant MS as "Meta Template Service"
participant CF as "Conversation Flow"
participant DB as "Template Model"
FE->>RT : POST /api/template/meta (create)
RT->>MS : createTemplateOnMeta(name, language, category, components)
MS-->>RT : {id, status}
RT->>DB : Save template with metaTemplateId, metaStatus
RT-->>FE : Created template
FE->>RT : POST /api/template/sync-meta
RT->>MS : fetchAllTemplatesFromMeta()
MS-->>RT : [templates]
RT->>DB : Upsert & dedupe templates
RT-->>FE : Synced templates
FE->>RT : POST /api/template/send-meta (templateId, phones)
RT->>MS : getTemplateStatusFromMeta(metaTemplateId)
MS-->>RT : {status}
RT->>CF : startMetaTemplate(phone, template)
CF-->>RT : Message ID
RT-->>FE : Broadcast started
```

**Diagram sources**
- [template.js:283-365](file://backend/routes/template.js#L283-L365)
- [template.js:413-529](file://backend/routes/template.js#L413-L529)
- [template.js:108-152](file://backend/routes/template.js#L108-L152)
- [metaTemplateService.js:114-154](file://backend/utils/metaTemplateService.js#L114-L154)
- [conversationFlow.js:21-118](file://backend/utils/conversationFlow.js#L21-L118)

## Detailed Component Analysis

### Template Model and Data Structure
The Template model includes:
- Meta-specific fields: name, category, language, components, metaTemplateId, metaStatus, wabaId
- Legacy fields: title, message, footer, imageUrl, mediaId
- Stats and scheduling: contacts, totalSent, totalFailed, interested, notInterested, ordersGenerated, status, sentAt, isScheduled, scheduleTime, repeatDaily, scheduleDays, lastRunAt, nextRunAt, isActive

Complexity:
- O(1) access to fields; array-based components allow flexible structure.
- Deduplication during sync uses $or queries by metaTemplateId or name.

```mermaid
classDiagram
class Template {
+string name
+string category
+string language
+Array components
+string metaTemplateId
+string metaStatus
+string wabaId
+string title
+string message
+string footer
+string imageUrl
+string mediaId
+Array contacts
+number totalSent
+number totalFailed
+number interested
+number notInterested
+number ordersGenerated
+string status
+Date sentAt
+boolean isScheduled
+string scheduleTime
+boolean repeatDaily
+string[] scheduleDays
+Date lastRunAt
+Date nextRunAt
+boolean isActive
}
```

**Diagram sources**
- [Template.js:3-40](file://backend/models/Template.js#L3-L40)

**Section sources**
- [Template.js:1-42](file://backend/models/Template.js#L1-L42)

### Template Creation and Editing
- Create endpoint: POST /api/template/meta
  - Accepts name, language, category, components, optional media file
  - Uploads media to Meta; updates HEADER component example.handle
  - Saves local template with metaTemplateId and metaStatus
- Update endpoint: PUT /api/template/:id
  - Supports updating name, category, language, components, image URL
  - Handles JSON string parsing for components

Validation and sanitization:
- Body variables normalized to {{1}}, {{2}}...
- Buttons sanitized to max 3 entries; phone numbers and URLs normalized

```mermaid
flowchart TD
Start(["Create Template"]) --> Validate["Validate inputs<br/>name, language, category, components"]
Validate --> MediaCheck{"Has media?"}
MediaCheck --> |Yes| UploadMeta["Upload media to Meta<br/>get handle"]
MediaCheck --> |No| SkipMedia["Skip media upload"]
UploadMeta --> BuildHeader["Update HEADER component<br/>example.header_handle"]
SkipMedia --> SanitizeComponents["Sanitize components<br/>normalize variables/buttons"]
BuildHeader --> SanitizeComponents
SanitizeComponents --> SubmitMeta["POST to Meta Templates API"]
SubmitMeta --> SaveLocal["Save template with metaTemplateId,<br/>metaStatus, imageUrl, mediaId"]
SaveLocal --> End(["Created"])
```

**Diagram sources**
- [template.js:283-365](file://backend/routes/template.js#L283-L365)
- [metaTemplateService.js:114-136](file://backend/utils/metaTemplateService.js#L114-L136)

**Section sources**
- [template.js:283-365](file://backend/routes/template.js#L283-L365)
- [template.js:226-269](file://backend/routes/template.js#L226-L269)
- [metaTemplateService.js:23-112](file://backend/utils/metaTemplateService.js#L23-L112)

### Synchronization with Meta
- Sync endpoint: POST /api/template/sync-meta or /api/template/sync
  - Fetches all templates from Meta
  - Deduplicates by metaTemplateId or name
  - Updates existing records or creates new ones
  - Auto-hosts header images to Cloudinary if needed
  - Cleans up outdated templates not present in Meta

```mermaid
sequenceDiagram
participant FE as "Frontend"
participant RT as "Template Routes"
participant MS as "Meta Template Service"
participant DB as "Template Model"
FE->>RT : POST /api/template/sync-meta
RT->>MS : fetchAllTemplatesFromMeta()
MS-->>RT : [templates]
loop For each template
RT->>DB : Find by metaTemplateId or name
alt Existing
RT->>DB : Update fields (name, components, language, category, wabaId, message, footer)
RT->>DB : Auto-host image to Cloudinary if needed
else New
RT->>DB : Create template with metadata
end
end
RT->>DB : Delete outdated templates (not in active list)
RT-->>FE : Synced templates and count
```

**Diagram sources**
- [template.js:413-529](file://backend/routes/template.js#L413-L529)
- [metaTemplateService.js:138-154](file://backend/utils/metaTemplateService.js#L138-L154)

**Section sources**
- [template.js:413-529](file://backend/routes/template.js#L413-L529)

### Approval Workflows and Status Tracking
- Status check: GET /api/template/meta/:id/status
  - Retrieves current status from Meta
  - Updates local metaStatus accordingly
- Before sending:
  - Endpoint verifies APPROVED status on Meta
  - Rejects sending if not approved

```mermaid
flowchart TD
A["GET /api/template/meta/:id/status"] --> B["Fetch status from Meta"]
B --> C{"Status available?"}
C --> |Yes| D["Update local metaStatus"]
C --> |No| E["Return error"]
D --> F["Return updated status"]
```

**Diagram sources**
- [template.js:531-558](file://backend/routes/template.js#L531-L558)

**Section sources**
- [template.js:531-558](file://backend/routes/template.js#L531-L558)

### Template Testing and Preview
- Preview rendering:
  - Frontend replaces {{1}}, {{2}} with sample values
  - Displays header (image/text), body, footer, and buttons
- Single test send:
  - Frontend triggers a test message using selected template and a test phone number
- Live chat integration:
  - Select approved template and send to a contact directly

```mermaid
sequenceDiagram
participant FE as "Frontend"
participant RT as "Template Routes"
participant CF as "Conversation Flow"
FE->>FE : renderPreviewBody(body_text, samples)
FE->>RT : POST /api/template/send-meta (templateId, [phone])
RT->>CF : startMetaTemplate(phone, template)
CF-->>RT : Message ID
RT-->>FE : Success response
```

**Diagram sources**
- [Whatsapp_Message.jsx:37-63](file://frontend/src/Dashboard/Whatsapp_Message.jsx#L37-L63)
- [Whatsapp_Message.jsx:667-733](file://frontend/src/Dashboard/Whatsapp_Message.jsx#L667-L733)
- [template.js:108-152](file://backend/routes/template.js#L108-L152)
- [conversationFlow.js:21-118](file://backend/utils/conversationFlow.js#L21-L118)

**Section sources**
- [Whatsapp_Message.jsx:37-63](file://frontend/src/Dashboard/Whatsapp_Message.jsx#L37-L63)
- [Whatsapp_Message.jsx:667-733](file://frontend/src/Dashboard/Whatsapp_Message.jsx#L667-L733)

### Bulk Operations and Campaign Execution
- Bulk blast:
  - Select template and recipients (contacts or leads)
  - Dispatch batch via /api/leads/whatsapp-blast
- Scheduled broadcasts:
  - Schedule templates with time, repeat options
  - Run scheduled templates periodically

```mermaid
flowchart TD
Start(["Bulk Blast"]) --> SelectTmpl["Select Approved Template"]
SelectTmpl --> SelectRecipients["Select Recipients (Contacts/Leads)"]
SelectRecipients --> Confirm["Confirm Dispatch"]
Confirm --> Execute["POST /api/leads/whatsapp-blast"]
Execute --> Result["Show success/failure counts"]
```

**Diagram sources**
- [WhatsappBlast.jsx:276-327](file://frontend/src/Dashboard/WhatsappBlast.jsx#L276-L327)

**Section sources**
- [WhatsappBlast.jsx:276-327](file://frontend/src/Dashboard/WhatsappBlast.jsx#L276-L327)

### Relationship Between Templates and Campaign Execution
- Template selection logic:
  - Frontend maps backend template data to UI fields (header_type, header_text/image_url, body_text, footer_text, buttons)
  - Only APPROVED templates are selectable for sending
- Dynamic content insertion:
  - Body variables replaced with recipient-specific values (e.g., name)
  - Header media resolved via mediaId or public link

```mermaid
sequenceDiagram
participant FE as "Frontend"
participant RT as "Template Routes"
participant CF as "Conversation Flow"
FE->>RT : GET /api/template
RT-->>FE : Templates list
FE->>FE : Map template fields for UI
FE->>RT : POST /api/template/send-meta
RT->>CF : startMetaTemplate(phone, template)
CF->>CF : Resolve header media (mediaId/link)
CF->>CF : Replace body variables with recipient data
CF-->>RT : Send result
RT-->>FE : Broadcast started
```

**Diagram sources**
- [Whatsapp_Message.jsx:254-299](file://frontend/src/Dashboard/Whatsapp_Message.jsx#L254-L299)
- [WhatsappBlast.jsx:81-113](file://frontend/src/Dashboard/WhatsappBlast.jsx#L81-L113)
- [conversationFlow.js:21-118](file://backend/utils/conversationFlow.js#L21-L118)

**Section sources**
- [Whatsapp_Message.jsx:254-299](file://frontend/src/Dashboard/Whatsapp_Message.jsx#L254-L299)
- [WhatsappBlast.jsx:81-113](file://frontend/src/Dashboard/WhatsappBlast.jsx#L81-L113)
- [conversationFlow.js:21-118](file://backend/utils/conversationFlow.js#L21-L118)

## Dependency Analysis
- Template Routes depend on:
  - Template Model for persistence
  - Meta Template Service for API interactions
  - Conversation Flow for composing and sending messages
  - Cloudinary service for media hosting
- Frontend depends on:
  - Template Routes for CRUD and sync
  - Contact/Lead APIs for recipient lists

```mermaid
graph TB
RT["routes/template.js"] --> MOD["models/Template.js"]
RT --> MS["utils/metaTemplateService.js"]
RT --> CF["utils/conversationFlow.js"]
FE["Whatsapp_Message.jsx"] --> RT
FE_Blast["WhatsappBlast.jsx"] --> RT
```

**Diagram sources**
- [template.js:1-11](file://backend/routes/template.js#L1-L11)
- [Template.js:1-42](file://backend/models/Template.js#L1-L42)
- [metaTemplateService.js:1-20](file://backend/utils/metaTemplateService.js#L1-L20)
- [conversationFlow.js:1-8](file://backend/utils/conversationFlow.js#L1-L8)
- [Whatsapp_Message.jsx:376-448](file://frontend/src/Dashboard/Whatsapp_Message.jsx#L376-L448)
- [WhatsappBlast.jsx:67-113](file://frontend/src/Dashboard/WhatsappBlast.jsx#L67-L113)

**Section sources**
- [template.js:1-11](file://backend/routes/template.js#L1-L11)
- [Template.js:1-42](file://backend/models/Template.js#L1-L42)
- [metaTemplateService.js:1-20](file://backend/utils/metaTemplateService.js#L1-L20)
- [conversationFlow.js:1-8](file://backend/utils/conversationFlow.js#L1-L8)
- [Whatsapp_Message.jsx:376-448](file://frontend/src/Dashboard/Whatsapp_Message.jsx#L376-L448)
- [WhatsappBlast.jsx:67-113](file://frontend/src/Dashboard/WhatsappBlast.jsx#L67-L113)

## Performance Considerations
- Media handling:
  - Prefer Cloudinary-hosted images to reduce latency
  - Avoid repeated uploads; cache mediaId when possible
- Rate limiting:
  - Use delays between sends to respect Meta API limits
- Database queries:
  - Filter templates by wabaId to reduce dataset size
  - Index frequently queried fields (metaTemplateId, name)
- Preview rendering:
  - Minimize re-renders by memoizing computed previews

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- Missing Meta credentials:
  - Ensure WABA ID and token are configured
- Invalid template name or components:
  - Normalize name to lowercase and underscores
  - Ensure BODY variables are properly formatted
- Media upload failures:
  - Verify file type and size constraints
  - Check Cloudinary configuration
- Sending errors:
  - Confirm template status is APPROVED on Meta
  - Validate phone number format

**Section sources**
- [metaTemplateService.js:6-21](file://backend/utils/metaTemplateService.js#L6-L21)
- [template.js:283-365](file://backend/routes/template.js#L283-L365)
- [template.js:108-152](file://backend/routes/template.js#L108-L152)

## Conclusion
The template management system provides a robust framework for creating, editing, and deploying WhatsApp templates with Meta integration. It supports parameterized messages, media attachments, approval workflows, and bulk operations. While versioning and rollback are not explicitly implemented, the system can be extended to track historical versions and support rollbacks by leveraging the existing template model and sync mechanisms.

[No sources needed since this section summarizes without analyzing specific files]