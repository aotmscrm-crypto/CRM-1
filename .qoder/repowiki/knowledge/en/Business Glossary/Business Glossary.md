---
kind: business_term
name: Business Glossary
category: business_term
scope:
    - '**'
---

### ZestEat
- Definition：The product name of this WhatsApp CRM + campaign console; the chatbot is branded as 'ZestEat AutoBot' and appends ' • AOTMS' to template bodies.
- Aliases：AOTMS、AutoMachine

### WABA
- Definition：WhatsApp Business Account — the Meta business identity identified by `wabaId` that owns phone numbers, templates, and message templates. Each instance holds exactly one WABA in `MetaConfig`.
- Aliases：WhatsApp Business Account

### blast
- Definition：A scheduled or immediate broadcast of an approved Meta template to a selected audience (contacts or leads). The server fires responses immediately and loops asynchronously with jitter, writing per-send `MessageLog` rows and incrementing contact counters.
- Aliases：broadcast、whatsapp-blast

### optedOut
- Definition：Contact flag indicating a user has replied STOP to automated messages. Currently tracked only in an in-memory Map inside the bot and never persisted to `Contact.optedOut`, so broadcasts still reach opted-out users after restarts.
- Aliases：stop、opt-out

### segment
- Definition：Contact classification derived automatically from order/message history: `new`, `regular`, or `vip`, based on counts of `ordersPlaced`, `templatesSent`, and `optedOut`.
- Aliases：contact segment

### leadStatusUpdate
- Definition：Three-stage sales pipeline progression fields on the Lead model: `leadStatusUpdate`, `secondUpdate`, `finalUpdate`, tracking the stages of a lead through the funnel.
- Aliases：pipeline stages

### payslip generator
- Definition：Internal payroll tool that creates salary breakdown records (basic/HRA/PF/netPay etc.) stored in the `PaySip` collection; exposed via CRUD routes and a dedicated dashboard tab.
- Aliases：pay-sip、PaySip
