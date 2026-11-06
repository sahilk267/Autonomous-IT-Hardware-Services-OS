# Phase 3 — Procurement, Tax Estimates and Telegram Reliability

**Date:** 7 November 2026
**Source baseline:** `fix/phase1-security-integrity-20261106@7db9a48f85c6599402064d44449798f5e81247b0`
**PR:** [#1 — draft](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/pull/1)

## Implemented source changes

### Procurement — truthful purchase order lifecycle
- `RFQItem.status` now supports `PO_PREPARED`. A server-authoritative `preparedPO` snapshot stores exact supplier quotation, quantity, unit cost, amount, creator, timestamp, reference and `deliveryStatus: NOT_SENT`.
- The existing `POST /api/rfqs/:id/dispatch-po` URL is retained for compatibility but now **prepares an internal PO**. No supplier messaging, GRN, tax invoice reconciliation or financial settlement occurs.
- Missing supplier quotation, invalid RFQ quantity, invalid unit cost and repeat PO preparations are rejected. UI does not show optimistic supplier dispatch success.

### Quotations / GST — avoid fabricated tax compliance
- Server calculates quote totals with line-item HSN/SAC plus explicitly declared GST percentages. Discounts are allocated proportionally before estimated line tax.
- Where any rate/classification is absent, `taxStatus=PENDING_CLASSIFICATION`, `gstAmount=0`, and `totalAmount` shows a **pre-tax provisional figure**. It is explicitly not a tax-inclusive final invoice.
- With complete supplied classifications, `taxStatus=ESTIMATED_UNVERIFIED` and individual tax amounts are calculated. No government verification or filing adapter is claimed.
- Quote approval is blocked while classification is pending. Product-catalog costs override client-supplied purchase costs when a registered product ID is provided.
- The finance tab uses a manually entered rate for preview only, not an assumed universal 18%. A configured organization GSTIN is not proof of NIC/IRP integration.

### Telegram — separate external delivery from local AI console
- Added owner-only `POST /api/telegram/send` using the official Telegram Bot API `sendMessage` endpoint with the server's authorized chat ID.
- A message is marked `ACCEPTED_BY_TELEGRAM_API` only after Telegram responds with `ok: true` and a valid `message_id`. This confirms API acceptance, **not human reading**.
- Missing/malformed credentials or uncertain provider responses fail closed; a provider-accepted send with failed local persistence is separately identified to avoid blind re-sends.
- The UI now offers a distinct `Send to Telegram` action; normal AI commands remain local-only.
- Webhooks require authorized chat/user, secret header, valid `update_id` and a durable, bounded replay ledger. The test suite does not access real Telegram.

## Acceptance and tests

Run `npm run lint`, `npm run build`, `npm test`, `npm run smoke` and `npm run smoke:roles` in GitHub Actions. HTTP tests use throwaway database files.

**CI evidence:** [GitHub Actions #42289634761](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42289634761) completed with typecheck and build PASS, 15/15 isolated regression, 47/47 production HTTP smoke, and 21/21 multi-role/replay tests. All tests used isolated stores; no live provider calls were made.

**No production sign-off yet:** real supplier PO transmission, legally verified HSN/SAC/GST rates, NIC filing, actual Telegram credentials/webhook setup, real payment services, browser UX testing and Hostinger deployment remain pending.

See [Implementation Tracker](IMPLEMENTATION_TRACKER.md) and [Deployment Data Safety](DEPLOYMENT_DATA_SAFETY.md). Do **not overwrite** a populated production `data/app-store.json` with the repository starter.
