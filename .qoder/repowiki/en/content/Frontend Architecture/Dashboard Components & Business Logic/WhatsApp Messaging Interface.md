# WhatsApp Messaging Interface

<cite>
**Referenced Files in This Document**   
- [server.js](file://backend/server.js)
- [whatsapp.js](file://backend/routes/whatsapp.js)
- [whatsappService.js](file://backend/utils/whatsappService.js)
- [template.js](file://backend/routes/template.js)
- [metaTemplateService.js](file://backend/utils/metaTemplateService.js)
- [conversationFlow.js](file://backend/utils/conversationFlow.js)
- [MessageLog.js](file://backend/models/MessageLog.js)
- [Template.js](file://backend/models/Template.js)
- [metaConfigHelper.js](file://backend/utils/metaConfigHelper.js)
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
This document explains the WhatsApp messaging interface implementation, covering:
- Real-time chat UI and WebSocket-based notifications
- Message composition tools and template studio
- Meta Business API integration for templates, media, and message sending
- Webhook processing for incoming messages and delivery/read statuses
- Conversation threading via message logs and contact context
- Bulk messaging capabilities through a blast workflow

The system uses Express for REST APIs, Socket.io for real-time events, MongoDB for persistence, and the Meta Cloud API for WhatsApp messaging. The frontend provides a live chat view, template management, and bulk broadcast features.

## Project Structure
The project is split into backend and frontend layers:
- Backend: Express routes, utility services, models, and WebSocket server setup
- Frontend: React dashboard with live chat, template studio, and blast composer

```mermaid
graph TB
subgraph "Frontend"
FE_Chat["Whatsapp_Message.jsx"]
FE_Blast["WhatsappBlast.jsx"]
end
subgraph "Backend"
Server["server.js"]
WA_Route["routes/whatsapp.js"]
Template_Route["routes/template.js"]
WA_Service["utils/whatsappService.js"]
Meta_Template["utils/metaTemplateService.js"]
ConvFlow["utils/conversationFlow.js"]
MsgLog["models/MessageLog.js"]
TmplModel["models/Template.js"]
MetaCfg["utils/metaConfigHelper.js"]
end
FE_Chat --> Server
FE_Blast --> Server
Server --> WA_Route
Server --> Template_Route
WA_Route --> WA_Service
WA_Route --> MsgLog
Template_Route --> Meta_Template
Template_Route --> ConvFlow
ConvFlow --> WA_Service
WA_Service --> MetaCfg
Meta_Template --> MetaCfg
WA_Route --> MetaCfg
```

**Diagram sources**
- [server.js:11-56](file://backend/server.js#L11-L56)
- [whatsapp.js:1-10](file://backend/routes/whatsapp.js#L1-L10)
- [template.js:1-30](file://backend/routes/template.js#L1-L30)
- [whatsappService.js:1-5](file://backend/utils/whatsappService.js#L1-L5)
- [metaTemplateService.js:1-5](file://backend/utils/metaTemplateService.js#L1-L5)
- [conversationFlow.js:1-7](file://backend/utils/conversationFlow.js#L1-L7)
- [MessageLog.js:1-22](file://backend/models/MessageLog.js#L1-L22)
- [Template.js:1-20](file://backend/models/Template.js#L1-L20)
- [metaConfigHelper.js:1-5](file://backend/utils/metaConfigHelper.js#L1-L5)

**Section sources**
- [server.js:11-56](file://backend/server.js#L11-L56)
- [whatsapp.js:1-10](file://backend/routes/whatsapp.js#L1-L10)
- [template.js:1-30](file://backend/routes/template.js#L1-L30)

## Core Components
- Real-time chat UI: Live chat list, message rendering, unread badges, and WebSocket event handling
- Template Studio: Create/edit templates, preview variables, upload header media, submit to Meta
- Meta Integration: Credentials management, template CRUD, media upload, message sending
- Webhooks: Incoming message ingestion, status updates, auto-reply automation
- Broadcast Engine: Bulk send approved templates to contacts or leads

Key responsibilities:
- `server.js`: HTTP + WebSocket server, route mounting, cron scheduler
- `routes/whatsapp.js`: Status, config, webhooks, message retrieval
- `utils/whatsappService.js`: Meta Cloud API client for text, media, buttons, lists, polls, templates
- `routes/template.js`: Template lifecycle, validation, media resolution, Meta submission, broadcasts
- `utils/metaTemplateService.js`: Meta Graph API calls for templates and media
- `utils/conversationFlow.js`: Template personalization and sending pipeline
- `models/MessageLog.js`, `models/Template.js`: Persistence schemas
- `utils/metaConfigHelper.js`: Credential caching and verification
- `frontend/src/Dashboard/Whatsapp_Message.jsx`: Live chat, template studio, WebSocket listeners
- `frontend/src/Dashboard/WhatsappBlast.jsx`: Bulk sender UI and dispatch flow

**Section sources**
- [server.js:11-80](file://backend/server.js#L11-L80)
- [whatsapp.js:8-109](file://backend/routes/whatsapp.js#L8-L109)
- [whatsappService.js:45-215](file://backend/utils/whatsappService.js#L45-L215)
- [template.js:146-199](file://backend/routes/template.js#L146-L199)
- [metaTemplateService.js:114-179](file://backend/utils/metaTemplateService.js#L114-L179)
- [conversationFlow.js:21-118](file://backend/utils/conversationFlow.js#L21-L118)
- [MessageLog.js:3-19](file://backend/models/MessageLog.js#L3-L19)
- [Template.js:3-68](file://backend/models/Template.js#L3-L68)
- [metaConfigHelper.js:6-35](file://backend/utils/metaConfigHelper.js#L6-L35)
- [Whatsapp_Message.jsx:212-537](file://frontend/src/Dashboard/Whatsapp_Message.jsx#L212-L537)
- [WhatsappBlast.jsx:18-151](file://frontend/src/Dashboard/WhatsappBlast.jsx#L18-L151)

## Architecture Overview
The system integrates three main flows:
- Outbound messaging: UI triggers -> backend sends via Meta Cloud API -> status webhook updates DB -> WebSocket notifies UI
- Inbound messaging: Meta webhook -> backend persists and emits WebSocket events -> optional automation replies
- Template lifecycle: UI creates/edits -> backend validates and submits to Meta -> syncs status and stores components

```mermaid
sequenceDiagram
participant UI as "Frontend Chat/Blast"
participant API as "Express Routes"
participant WA as "whatsappService.js"
participant META as "Meta Cloud API"
participant DB as "MongoDB (MessageLog/Template)"
participant WS as "Socket.io"
UI->>API : Send message / trigger template
API->>WA : Compose payload
WA->>META : POST messages/templates/media
META-->>WA : Response (id/status)
WA-->>API : Result
API->>DB : Persist log/template
API->>WS : Emit 'new_message'/'status_update'
WS-->>UI : Real-time update
```

**Diagram sources**
- [whatsapp.js:135-311](file://backend/routes/whatsapp.js#L135-L311)
- [whatsappService.js:45-215](file://backend/utils/whatsappService.js#L45-L215)
- [template.js:318-391](file://backend/routes/template.js#L318-L391)
- [server.js:14-35](file://backend/server.js#L14-L35)

## Detailed Component Analysis

### Real-Time Chat Interface
The live chat component manages:
- Contact selection and chat history loading
- WebSocket connection for real-time inbound messages, auto-replies, and status updates
- Unread badge computation based on last read timestamps stored locally
- Polling fallback for chat logs and unread counts

Key behaviors:
- Connects to Socket.io and listens to `new_message`, `auto_reply`, and `status_update`
- Updates local chat log map keyed by normalized phone number
- Marks messages as incoming/outgoing and renders template metadata when present
- Polls every 3 seconds for new logs and unread counts when in live chat mode

```mermaid
flowchart TD
Start(["Chat Component Mount"]) --> ConnectWS["Connect Socket.io"]
ConnectWS --> ListenEvents["Listen: new_message, auto_reply, status_update"]
ListenEvents --> UpdateState["Update chat logs & unread counts"]
UpdateState --> Render["Render chat UI"]
Render --> PollLogs["Poll /api/whatsapp/messages every 3s"]
PollLogs --> UpdateState
```

**Diagram sources**
- [Whatsapp_Message.jsx:470-537](file://frontend/src/Dashboard/Whatsapp_Message.jsx#L470-L537)
- [Whatsapp_Message.jsx:754-772](file://frontend/src/Dashboard/Whatsapp_Message.jsx#L754-L772)

**Section sources**
- [Whatsapp_Message.jsx:212-537](file://frontend/src/Dashboard/Whatsapp_Message.jsx#L212-L537)
- [Whatsapp_Message.jsx:659-772](file://frontend/src/Dashboard/Whatsapp_Message.jsx#L659-L772)

### Message Composition Tools and Template Studio
The template studio supports:
- Category presets (Marketing, Utility, Authentication)
- Header types (None, Text, Image)
- Body text with variable placeholders (`{{1}}`, named variables)
- Buttons (Quick Reply, URL, Phone Number)
- Sample values for preview
- Local draft editing vs. recreate-on-Meta for immutable templates

Processing highlights:
- Extracts body variables and aligns sample values automatically
- Validates against backend rules and limits
- Resolves header media via resumable upload handles for Meta
- Submits to Meta and maps response to local template fields

```mermaid
classDiagram
class TemplateStudio {
+state formData
+applyCategoryPreset(category)
+handleBodyTextChange(value)
+handleSampleValueChange(index, value)
+submitTemplate()
+previewVariables()
}
class TemplateModel {
+name
+category
+language
+components
+metaStatus
+sample_values
+buttons
}
class MetaTemplateService {
+createTemplateOnMeta(name, language, category, components)
+sanitizeComponentsForMeta(components)
+uploadMediaToMeta(filePath, mimeType, size)
}
TemplateStudio --> TemplateModel : "creates/updates"
TemplateStudio --> MetaTemplateService : "submits"
```

**Diagram sources**
- [Whatsapp_Message.jsx:93-210](file://frontend/src/Dashboard/Whatsapp_Message.jsx#L93-L210)
- [Template.js:3-68](file://backend/models/Template.js#L3-L68)
- [metaTemplateService.js:23-112](file://backend/utils/metaTemplateService.js#L23-L112)

**Section sources**
- [Whatsapp_Message.jsx:93-210](file://frontend/src/Dashboard/Whatsapp_Message.jsx#L93-L210)
- [template.js:146-199](file://backend/routes/template.js#L146-L199)
- [metaTemplateService.js:114-179](file://backend/utils/metaTemplateService.js#L114-L179)

### Media Handling
Media handling covers two paths:
- Sending media with outbound messages: Upload to `/phoneId/media` and reference by ID or link
- Template header media: Use resumable upload handle for template creation; also generate media ID for sending later

Implementation details:
- For images sent directly, if a URL is provided it is used; otherwise, local files are uploaded to Meta to obtain a media ID
- For templates, header media must be uploaded via resumable upload to get a handle; the service also uploads a media ID for sending and a public URL for dashboard previews

```mermaid
flowchart TD
A["Header Media Source"] --> B{"URL or File?"}
B --> |URL| C["Download to temp file"]
B --> |File| D["Use local file"]
C --> E["Resumable upload -> handle"]
D --> E
E --> F["Upload media for sending -> mediaId"]
F --> G["Cloudinary/public URL for preview"]
```

**Diagram sources**
- [template.js:55-140](file://backend/routes/template.js#L55-L140)
- [metaTemplateService.js:192-245](file://backend/utils/metaTemplateService.js#L192-L245)
- [whatsappService.js:80-123](file://backend/utils/whatsappService.js#L80-L123)

**Section sources**
- [template.js:55-140](file://backend/routes/template.js#L55-L140)
- [metaTemplateService.js:192-245](file://backend/utils/metaTemplateService.js#L192-L245)
- [whatsappService.js:80-123](file://backend/utils/whatsappService.js#L80-L123)

### WebSocket Connection Management and Real-Time Notifications
WebSocket server setup:
- Initializes Socket.io with CORS enabled
- Stores `io` instance in Express app for route handlers to emit events
- Supports room joining (not actively used by current routes but available)

Real-time events emitted:
- `new_message`: When an inbound customer message is received
- `auto_reply`: When automation bot replies
- `status_update`: When delivery/read statuses arrive from Meta

Frontend behavior:
- Connects to Socket.io and listens for these events
- Updates chat logs and unread counts accordingly
- Handles reconnection and disconnect states

```mermaid
sequenceDiagram
participant Meta as "Meta Webhook"
participant API as "whatsapp.js"
participant IO as "Socket.io Server"
participant UI as "Frontend Chat"
Meta->>API : POST /webhook (incoming message)
API->>IO : io.emit('new_message', savedLog)
IO-->>UI : Event 'new_message'
UI->>UI : Update chat log & unread count
Meta->>API : POST /webhook (status update)
API->>IO : io.emit('status_update', payload)
IO-->>UI : Event 'status_update'
UI->>UI : Update message status
```

**Diagram sources**
- [server.js:14-35](file://backend/server.js#L14-L35)
- [whatsapp.js:206-211](file://backend/routes/whatsapp.js#L206-L211)
- [whatsapp.js:293-297](file://backend/routes/whatsapp.js#L293-L297)
- [Whatsapp_Message.jsx:470-537](file://frontend/src/Dashboard/Whatsapp_Message.jsx#L470-L537)

**Section sources**
- [server.js:14-35](file://backend/server.js#L14-L35)
- [whatsapp.js:206-211](file://backend/routes/whatsapp.js#L206-L211)
- [whatsapp.js:293-297](file://backend/routes/whatsapp.js#L293-L297)
- [Whatsapp_Message.jsx:470-537](file://frontend/src/Dashboard/Whatsapp_Message.jsx#L470-L537)

### Message Sending/Receiving Protocols
Outbound protocols:
- Text messages: Simple payload with recipient and body
- Interactive messages: Buttons and list menus
- Templates: Name, language, and optional components for headers/body/buttons
- Media: Either direct link or uploaded media ID

Inbound protocol:
- Webhook payloads include entry changes with messages and statuses
- Messages parsed into text or interactive/button payloads
- Contacts upserted automatically for inbound senders

```mermaid
flowchart TD
S["Send Request"] --> T{"Type?"}
T --> |text| P1["Build text payload"]
T --> |image| P2["Upload media or use link"]
T --> |interactive| P3["Build buttons/list payload"]
T --> |template| P4["Build template payload with components"]
P1 --> X["POST to Meta Cloud API"]
P2 --> X
P3 --> X
P4 --> X
X --> R["Response wamid/status"]
```

**Diagram sources**
- [whatsappService.js:61-78](file://backend/utils/whatsappService.js#L61-L78)
- [whatsappService.js:80-123](file://backend/utils/whatsappService.js#L80-L123)
- [whatsappService.js:125-192](file://backend/utils/whatsappService.js#L125-L192)
- [whatsappService.js:194-215](file://backend/utils/whatsappService.js#L194-L215)

**Section sources**
- [whatsappService.js:61-215](file://backend/utils/whatsappService.js#L61-L215)
- [whatsapp.js:135-311](file://backend/routes/whatsapp.js#L135-L311)

### Conversation Threading and Context Management
Threading model:
- Messages are persisted per WAMID with direction, status, and timestamp
- Contacts are upserted on inbound messages to maintain conversation context
- Chat logs are fetched per phone with normalization across multiple formats
- Unread counts computed using last read timestamps stored in localStorage

Context management:
- Normalized phone keys (last 10 digits) used for mapping chat logs and unread counts
- Last seen timestamps updated when selecting a contact to clear unread badges
- Latest activity timestamps used for sorting contacts by recent engagement

```mermaid
flowchart TD
In["Incoming Message"] --> Normalize["Normalize phone number"]
Normalize --> UpsertContact["Upsert Contact"]
UpsertContact --> SaveLog["Save MessageLog"]
SaveLog --> EmitEvent["Emit 'new_message'"]
EmitEvent --> UpdateUI["Update UI chat log & unread"]
```

**Diagram sources**
- [whatsapp.js:167-211](file://backend/routes/whatsapp.js#L167-L211)
- [Whatsapp_Message.jsx:659-772](file://frontend/src/Dashboard/Whatsapp_Message.jsx#L659-L772)

**Section sources**
- [whatsapp.js:167-211](file://backend/routes/whatsapp.js#L167-L211)
- [Whatsapp_Message.jsx:659-772](file://frontend/src/Dashboard/Whatsapp_Message.jsx#L659-L772)

### Template Selection, Personalization Variables, and Bulk Messaging
Template selection:
- Frontend fetches templates from multiple endpoints and maps them to a unified structure
- Presets provide starter content per category
- Preview shows header, body, footer, and buttons with variable substitution

Personalization variables:
- Body variables extracted and aligned with sample values
- Automation flow injects contact name into template body when needed

Bulk messaging:
- Blast UI selects recipients (contacts or leads), chooses an approved template, and dispatches
- Backend verifies template approval before sending and runs broadcast loop with delays
- Each send persists a MessageLog and increments contact stats

```mermaid
sequenceDiagram
participant UI as "Blast UI"
participant API as "template.js"
participant CF as "conversationFlow.js"
participant WA as "whatsappService.js"
participant META as "Meta Cloud API"
participant DB as "MongoDB"
UI->>API : POST /send-meta (templateId, phones)
API->>API : Verify template APPROVED
API->>CF : startMetaTemplate(phone, template)
CF->>WA : sendMetaTemplate(phone, name, language, components)
WA->>META : POST template message
META-->>WA : Response
WA-->>CF : Response
CF-->>API : Response
API->>DB : Persist MessageLog
API-->>UI : Success result
```

**Diagram sources**
- [template.js:318-391](file://backend/routes/template.js#L318-L391)
- [conversationFlow.js:21-118](file://backend/utils/conversationFlow.js#L21-L118)
- [whatsappService.js:194-215](file://backend/utils/whatsappService.js#L194-L215)
- [WhatsappBlast.jsx:298-327](file://frontend/src/Dashboard/WhatsappBlast.jsx#L298-L327)

**Section sources**
- [Whatsapp_Message.jsx:544-617](file://frontend/src/Dashboard/Whatsapp_Message.jsx#L544-L617)
- [WhatsappBlast.jsx:67-151](file://frontend/src/Dashboard/WhatsappBlast.jsx#L67-L151)
- [template.js:318-391](file://backend/routes/template.js#L318-L391)
- [conversationFlow.js:21-118](file://backend/utils/conversationFlow.js#L21-L118)

### Integration with Meta Business API, Webhook Processing, and Message Status Tracking
Integration points:
- Credentials managed via `metaConfigHelper.js`, cached and verified against Meta Graph API
- Templates created/updated/deleted via `metaTemplateService.js`
- Messages sent via `whatsappService.js`
- Webhooks processed in `routes/whatsapp.js` for incoming messages and status updates

Webhook processing:
- Verification endpoint validates hub.verify_token
- Incoming messages parsed and persisted; contacts upserted; WebSocket event emitted
- Status updates parsed and persisted; WebSocket event emitted

Status tracking:
- MessageLog stores direction, status, error codes, pricing, and identifiers
- Frontend displays status indicators and error messages

```mermaid
flowchart TD
W["Meta Webhook"] --> V["Verify hub.verify_token"]
V --> M{"Incoming Message?"}
M --> |Yes| P1["Parse message & contact"]
P1 --> S1["Persist MessageLog"]
S1 --> E1["Emit 'new_message'"]
M --> |No| S2{"Status Update?"}
S2 --> |Yes| P2["Parse status & errors"]
P2 --> S3["Persist MessageLog"]
S3 --> E2["Emit 'status_update'"]
```

**Diagram sources**
- [whatsapp.js:114-132](file://backend/routes/whatsapp.js#L114-L132)
- [whatsapp.js:135-311](file://backend/routes/whatsapp.js#L135-L311)
- [MessageLog.js:3-19](file://backend/models/MessageLog.js#L3-L19)

**Section sources**
- [metaConfigHelper.js:6-35](file://backend/utils/metaConfigHelper.js#L6-L35)
- [metaTemplateService.js:114-179](file://backend/utils/metaTemplateService.js#L114-L179)
- [whatsapp.js:114-311](file://backend/routes/whatsapp.js#L114-L311)
- [MessageLog.js:3-19](file://backend/models/MessageLog.js#L3-L19)

### Real-Time Notifications, Offline Message Queuing, and Conversation Context Management
Real-time notifications:
- WebSocket events push inbound messages, auto-replies, and status updates to the UI
- UI updates state immediately without polling when connected

Offline message queuing:
- No explicit queue implementation found; messages are persisted to MongoDB and polled by the UI
- Polling interval ensures eventual consistency even if WebSocket is unavailable

Conversation context management:
- Contacts are maintained and updated on inbound messages
- Chat logs are grouped by normalized phone numbers
- Unread counts and latest activity timestamps drive UI sorting and badges

**Section sources**
- [server.js:14-35](file://backend/server.js#L14-L35)
- [whatsapp.js:167-211](file://backend/routes/whatsapp.js#L167-L211)
- [Whatsapp_Message.jsx:754-772](file://frontend/src/Dashboard/Whatsapp_Message.jsx#L754-L772)

## Dependency Analysis
Component relationships:
- `server.js` mounts routes and exposes Socket.io instance
- `routes/whatsapp.js` depends on `whatsappService.js`, `metaConfigHelper.js`, and `MessageLog`
- `routes/template.js` depends on `metaTemplateService.js`, `conversationFlow.js`, and `Template`
- `conversationFlow.js` depends on `whatsappService.js` and `metaTemplateService.js`
- Frontend components depend on backend REST endpoints and WebSocket events

```mermaid
graph LR
Server["server.js"] --> WA_Route["routes/whatsapp.js"]
Server --> Template_Route["routes/template.js"]
WA_Route --> WA_Service["utils/whatsappService.js"]
WA_Route --> MetaCfg["utils/metaConfigHelper.js"]
WA_Route --> MsgLog["models/MessageLog.js"]
Template_Route --> Meta_Tmpl["utils/metaTemplateService.js"]
Template_Route --> ConvFlow["utils/conversationFlow.js"]
ConvFlow --> WA_Service
ConvFlow --> Meta_Tmpl
```

**Diagram sources**
- [server.js:43-56](file://backend/server.js#L43-L56)
- [whatsapp.js:1-10](file://backend/routes/whatsapp.js#L1-L10)
- [template.js:1-30](file://backend/routes/template.js#L1-L30)
- [conversationFlow.js:1-7](file://backend/utils/conversationFlow.js#L1-L7)

**Section sources**
- [server.js:43-56](file://backend/server.js#L43-L56)
- [whatsapp.js:1-10](file://backend/routes/whatsapp.js#L1-L10)
- [template.js:1-30](file://backend/routes/template.js#L1-L30)
- [conversationFlow.js:1-7](file://backend/utils/conversationFlow.js#L1-L7)

## Performance Considerations
- Webhook processing performs database writes and WebSocket emissions synchronously; consider background jobs for high throughput
- Broadcast loops include small delays to respect Meta rate limits; tune delay and concurrency based on account limits
- Template media uploads involve multiple network calls; cache media IDs where possible
- Frontend polling interval (3 seconds) balances freshness and load; adjust based on expected message volume
- WebSocket reconnection handled by socket.io-client; ensure proper cleanup on component unmount

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- Missing Meta credentials: Ensure WABA ID, phone ID, and access token are configured; verify connection via status endpoint
- Template not approved: Backend checks template status before sending; resubmit or wait for approval
- Webhook verification failures: Confirm hub.verify_token matches configured value
- Media upload errors: Check file size, MIME type, and resumable upload handle usage for templates
- WebSocket disconnected: UI shows connection state; check CORS settings and server availability

Operational tips:
- Use `/api/whatsapp/status` to check connectivity
- Use `/api/whatsapp/config` to inspect masked credentials and version
- Monitor MessageLog for error codes and messages
- Clear Meta config cache after environment changes

**Section sources**
- [whatsapp.js:8-36](file://backend/routes/whatsapp.js#L8-L36)
- [metaConfigHelper.js:73-99](file://backend/utils/metaConfigHelper.js#L73-L99)
- [template.js:397-441](file://backend/routes/template.js#L397-L441)

## Conclusion
The WhatsApp messaging interface provides a comprehensive solution for real-time chat, template-driven messaging, and bulk broadcasts integrated with Meta Business API. It leverages WebSockets for live updates, robust webhook processing for inbound and status events, and a structured template lifecycle with media handling. The architecture balances immediate feedback with reliable persistence, enabling scalable operations for conversational workflows.

[No sources needed since this section summarizes without analyzing specific files]