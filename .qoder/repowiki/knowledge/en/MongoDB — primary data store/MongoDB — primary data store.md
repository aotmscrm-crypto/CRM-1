---
kind: external_dependency
name: MongoDB — primary data store
slug: mongodb
category: external_dependency
category_hints:
    - client_constraint
scope:
    - '**'
source_files:
    - backend/server.js
    - backend/models/MetaConfig.js
---

### Identity
All persistent state (User, Contact, Lead, Template, MessageLog, MetaConfig, Order, Menu, PaySip, Todo, ProcessedMessage, MessageCache) is stored in MongoDB, connected via Mongoose 7. Default connection string points to `mongodb://localhost:27017/mutton_chicken_shop`.

### Client constraint
Despite UI copy claiming "Neon PostgreSQL", the actual runtime database is MongoDB; the `MONGODB_URI` env var drives the connection. There is no multi-tenancy — `MetaConfig` is a singleton document, so only one WABA can be configured at a time.