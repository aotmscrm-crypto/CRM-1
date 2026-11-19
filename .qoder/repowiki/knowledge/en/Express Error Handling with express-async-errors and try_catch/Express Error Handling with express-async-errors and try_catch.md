---
kind: error_handling
name: Express Error Handling with express-async-errors and try/catch
category: error_handling
scope:
    - '**'
source_files:
    - backend/server.js
    - backend/routes/auth.js
    - backend/routes/whatsapp.js
    - backend/utils/metaConfigHelper.js
    - backend/utils/cloudinaryService.js
    - backend/utils/metaTemplateService.js
    - backend/utils/whatsappService.js
    - frontend/src/services/api.js
---

## Approach

The ZestEat backend is an Express application that uses the `express-async-errors` package to automatically route thrown errors from async route handlers into Express's error-handling middleware. There is no custom error class hierarchy, no error-code constants, and no centralized error factory — errors are represented as plain JavaScript `Error` objects (or sometimes strings wrapped in `throw new Error(...)`).

## Backend architecture

### Global error handler

`backend/server.js` registers a single Express error middleware at the end of the stack:

```js
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: err.message });
});
```

It logs the full stack trace and returns a uniform `{ success: false, message }` JSON body with HTTP 500. All other routes rely on this catch-all; there are no per-route error responses for unexpected failures.

### Async error propagation

`require('express-async-errors')` is loaded at the top of `server.js`, so any `throw` inside an async route handler bubbles directly to the global handler without needing explicit `.catch()` wrappers.

### Route-level patterns

Route handlers use two complementary styles:

1. **Early validation returns** — input validation rejects with explicit status codes and `{ success: false, message }` bodies (e.g., `auth.js` returns 400/401/404 for missing fields, duplicate users, invalid tokens).
2. **try/catch blocks around external calls** — when calling third-party APIs or DB operations, handlers wrap the call in `try { ... } catch (err) { ... }` and either log + return a user-friendly response or re-throw a descriptive `Error`.

Examples:
- `routes/auth.js`: JWT verification catches `jwt.verify` errors and returns 401 with `"Invalid or expired token."`
- `routes/whatsapp.js`: Multiple endpoints wrap Meta API calls in try/catch and return 500 with the caught error message.
- `routes/orders.js`: Cancellation/deletion stock restoration failures are swallowed via `.catch(console.error)` so they do not abort the primary operation.

### Utility-layer conventions

Utility modules follow one of two patterns:

- **Return null on failure**: `cloudinaryService.js`'s `uploadToCloudinary` / `uploadUrlToCloudinary` log the error and return `null` rather than throwing, letting callers decide whether to treat it as fatal.
- **Throw descriptive Errors**: `metaConfigHelper.js` throws `new Error('Meta validation failed: …')` after verifying credentials via the Meta Graph API; `metaTemplateService.js` throws `new Error('Missing Meta WABA ID or Access Token in settings')` and similar guard errors; `whatsappService.js` throws `new Error('Meta API credentials missing or invalid')` before making requests.

`metaConfigHelper.getMetaCredentials` demonstrates a resilient fallback pattern: it tries to read config from MongoDB, logs the failure, then falls back to `process.env` values — never surfacing the error to the caller.

### Background tasks

The cron scheduler in `server.js` wraps `runScheduledTemplates()` in its own try/catch and logs `Scheduler error:` — background jobs fail silently to the caller but still surface to the operator via stderr.

MongoDB connection errors are caught by `.catch(err => console.error('❌ MongoDB error:', err))` at startup.

## Frontend error handling

`frontend/src/services/api.js` handles network errors locally:

- `checkBackendHealth` catches fetch failures and returns `{ status: 'offline', error: err.message }` instead of throwing.
- `queryGraphQL` catches fetch failures and returns `{ errors: [{ message: err.message }] }`.
- `sendLiveMessage` catches errors, logs a warning, and falls back to a local reply.

There is no global Axios/fetch interceptor, no error toast component usage shown here, and no standardized error shape returned from the backend beyond the `{ success, message }` envelope already established server-side.

## Conventions observed

- Unexpected server-side errors bubble through `express-async-errors` to the single global error handler in `server.js`, which always responds with HTTP 500 and `{ success: false, message }`.
- Input/validation errors are handled inline in route handlers with explicit `res.status(...).json({ success: false, message })` responses (400, 401, 404).
- External service failures are typically wrapped in try/catch; some utilities swallow and return `null` (`cloudinaryService.js`), while others throw `new Error(...)` with a human-readable message (`metaConfigHelper.js`, `metaTemplateService.js`, `whatsappService.js`).
- No custom error classes, no error code enum, and no structured error payload beyond the generic `message` string.
- Background/scheduler errors are logged and suppressed from the caller.
- Frontend services catch fetch errors and convert them into safe return values rather than propagating exceptions.