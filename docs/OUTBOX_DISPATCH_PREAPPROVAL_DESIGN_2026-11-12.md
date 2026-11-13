# Future Outbox Dispatcher — Pre-Approval Architecture Only (Phase 10.5D)

**Status: DESIGN / NOT IMPLEMENTED / NOT APPROVED.** This is not a live feature specification to execute automatically; it is a review and test plan for a future authorized release. No dispatcher, leases, provider adapter, retry scheduler, external URL or payment system is enabled in the repository.

## Current irreversible safety boundary

Phase 10.5C's immutable `apex.pilot_service_outbox` uses `(tenant_id,order_id,revision)` as an event identity and same-transaction DB triggers with service work order and append-only history. Its `delivery_state='PENDING_REVIEW'`, `delivery_enabled=false`, `delivery_attempts=0` are SQL CHECK-constrained; the runtime writer has SELECT-only access for authenticated owners. Phase 10.5D's `npm run assess:pg:outbox-plan` is read-only and always returns `BLOCKED`, exit code 3 on healthy stage. It compares every pending payload to its versioned event and checks write restrictions. Never modify 008 to dispatch messages without an independent security and business approval process.

## Proposed future topology — no code wired

```text
Signed source business transaction
    -> normalized service_work_order + immutable service_event
    -> sealed internal pending outbox (present; database-atomic)
    -> [RELEASE GATE / human + provider sandbox approval: NOT OPEN]
    -> future dispatch-intent ledger (NOT BUILT)
    -> future tenant-scoped lease/fenced worker (NOT BUILT)
    -> future approved provider adapter (NOT BUILT)
    -> future signed acknowledgement / attempt audit / dead-letter (NOT BUILT)
```

## Review gates required before designing runnable delivery

1. **Authorized customer/tenant and business purpose:** per-tenant scope, explicit opt-in/approval, customer contact & data-retention/legal basis, recipient allowlist; no customer PII on an unauthenticated/public endpoint. Do not derive customer assignment from legacy free-text customer names.
2. **External provider sandbox and contract:** verified endpoint/credentials, contract-signature validation, safe test environment and scope; never assume '200 OK' means real-world fulfilment or payment.
3. **Event schema and idempotency:** stable versioned schema and event key `(tenant_id,order_id,revision)`; provider-facing stable dedupe key and idempotent consumer receipt processing. Assume *at-least-once* message attempts and duplicate delivery; never promise exactly-once across network boundaries.
4. **Tenant-scoped service identity and secrets:** non-login DB writer role with narrowly scoped grants, KMS-managed per-environment secret rotation, deny `BYPASSRLS`, no generic SQL input, no credentials/PII in queue payloads or logs.
5. **Lease, fencing and concurrency:** future separate dispatch-intent/attempt tables should support `FOR UPDATE SKIP LOCKED`, tenant-bounded batch size and a monotonically increasing lease token; a stale worker must never commit a success receipt after lease expiry. Keep source outbox immutable and traceable.
6. **Retry/dead-letter and operator intervention:** capped jittered retry, provider rate limits, bounded timeout, classification of permanent vs transient errors, dead-letter after max attempts, manual requeue requiring ticket/approval, kill switch default off.
7. **Nonrepudiation and audit:** append-only attempt and receipt records with signed payload/response digest and UTC timestamps; redacted telemetry, forensic correlation, protected write grants, separate immutable external journal only after compliance review.
8. **Operational recovery and reversal:** replay-safe recovery after process crashes, delayed ACK, network timeout and provider duplicates; sandbox load/concurrency tests, backup restore parity, release stop switch and a rehearsed rollback before live dispatch.

## Nonproduction acceptance plan for a future build

Before enabling even sandbox delivery, require independent two-worker race tests, tenant-crossing refusal, duplicate provider ACK simulation, intentionally late receipt, no PII leaks, KMS rotation recovery, outbox replay from signed backup, dead-letter quarantine and provider outage rollback. Keep consumer delivery off until all recorded as passing with reviewer and release approval.

## Current confirmed evidence

- [Phase 10.5D code CI Push #43180700209](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43180700209) and [PR #43180707071](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43180707071) both successful.
- Internal `pilot_service_outbox` five-event integration in real PostgreSQL CI passed; read-only dispatch-design test **8/8 PASS**, transaction-atomic multi-instance SQL checks **33/33 PASS**; no provider is configured or contacted.
- Production cutover assessor remains `BLOCKED` by design. **Do not merge or deploy.**
