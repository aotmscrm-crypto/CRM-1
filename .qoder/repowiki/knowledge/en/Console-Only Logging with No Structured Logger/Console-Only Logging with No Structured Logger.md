---
kind: logging_system
name: Console-Only Logging with No Structured Logger
category: logging_system
scope:
    - '**'
source_files:
    - backend/package.json
    - backend/server.js
    - backend/routes/whatsapp.js
    - backend/routes/leads.js
    - backend/utils/cloudinaryService.js
    - backend/models/MessageLog.js
---

# Logging System

## What system/approach is used

The backend uses **no structured logging framework** for application output. All log statements are plain `console.log`, `console.error`, and `console.warn` calls scattered across route handlers, utilities, and the server bootstrap. Although `pino` (^8.21.0) is declared as a runtime dependency in `backend/package.json`, it is **never imported or instantiated** anywhere in the codebase — every log site uses the global Node.js console.

There is no logger initialization file, no log-level configuration, no log rotation, no sinks (file, stdout, remote), and no structured fields beyond ad-hoc string interpolation. The frontend has no equivalent logging concern (it is a Vite/React SPA).

## Key files and packages

- `backend/package.json` — declares `pino` as a dependency; this is the only place that references a logging library.
- `backend/server.js` — central startup file where most `console.log` / `console.error` calls live (WebSocket connection events, MongoDB connect/disconnect, scheduler start, error handler stack trace).
- `backend/routes/whatsapp.js` — highest volume of logs: webhook incoming messages, WebSocket broadcast events, Meta status updates, and error paths.
- `backend/routes/leads.js` — blast dispatch and failure logs.
- `backend/utils/cloudinaryService.js` — Cloudinary credential warnings and upload failure errors.
- `backend/models/MessageLog.js` — stores message delivery/read status to the database; this is the closest thing to persistent "logging" in the app, but it is an operational data model, not a log sink.

## Architecture and conventions

Observed patterns (descriptive):

- Every log line is a single interpolated string via template literals, e.g. `` `📩 [WEBHOOK INCOMING MESSAGE] From ${senderName} (${phone}): ${text}` ``.
- Prefix emojis and bracketed tags are used as a human-readable convention rather than structured fields:
  - `[WEBSOCKET]` for Socket.io events (`server.js`).
  - `[WEBHOOK INCOMING MESSAGE]`, `[WEBHOOK STATUS]` for Meta webhook traffic (`routes/whatsapp.js`).
  - `[Cloudinary]` for image upload operations (`utils/cloudinaryService.js`).
  - Emoji markers such as `✅`, `❌`, `⚡`, `📩`, `🔌`, `⏰`, `🚀`, `⚠️` are appended to distinguish success/fatal/warning/status lines.
- Log level usage is informal:
  - `console.log` for normal flow (connection, dispatch, status).
  - `console.error` for failures (Meta API errors, DB write failures, Cloudinary upload failures, unhandled exceptions).
  - `console.warn` only for missing Cloudinary credentials.
- There is no centralized error middleware that formats or routes errors to a logger; the Express error handler in `server.js` simply prints `err.stack` to stderr and returns `{ success: false, message: err.message }` to the client.
- Database persistence of message delivery state lives in the `MessageLog` Mongoose model, which records WhatsApp delivery/read statuses — this is business data, not a general-purpose audit log.

## Conventions and constraints

- **Convention observed**: Application log entries use emoji-prefixed, bracket-tagged strings produced by the global `console` methods. This is a style choice, not enforced by any linter or framework.
- **No enforcement exists**: There is no ESLint rule banning `console.*`, no logger abstraction layer, no environment-based log-level switch, and no configuration file for logging.
- **Dependency mismatch**: `pino` is listed in `dependencies` but never required; it is effectively unused dead weight in `package.json`. Any claim that the project "uses Pino" would be incorrect — the implementation relies entirely on `console`.
- **No structured fields**: Logs do not include timestamps, process IDs, request IDs, or JSON objects; they are free-form text lines suitable for local terminal inspection but not directly consumable by a structured log aggregator without external parsing.