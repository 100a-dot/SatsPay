# 06 · Transfer Lifecycle

**Track:** Non-Dev · **Authors:** @Fonsii319, @100a-dot

---

## 1. Implemented state machine

The backend implements the lifecycle with the `RemittanceStatus` enum (Prisma) and a state machine hardened against race conditions (see commit `security: harden ... claim state machine, race-condition lock`).

```
PENDING_PAYMENT ──payment verified (Wompi)──► READY_TO_CLAIM ──valid PIN + invoice──► PROCESSING_PAYOUT ──Blink payout success──► COMPLETED
      │                                            │                                       │
      │ payment declined/expired                   │ claim expires                         │ Lightning payout error
      ▼                                            ▼                                       ▼
    FAILED                                       EXPIRED                                 FAILED (with failureReason)
```

| Status | Meaning | José sees | María sees |
|---|---|---|---|
| `PENDING_PAYMENT` | Remittance created, awaiting card payment confirmation | "Processing your payment" | — |
| `READY_TO_CLAIM` | Payment confirmed; code + PIN active | "Ready to be claimed" | "You have $X available to claim" |
| `PROCESSING_PAYOUT` | PIN and invoice validated; Lightning payout in progress | "Sending" | "Processing your money" |
| `COMPLETED` | Invoice paid; USD in Chivo Wallet | "Completed" | Official deposit receipt |
| `FAILED` | Something failed (declined payment or Lightning error) | Clear reason + money protected | Clear message, no jargon |
| `EXPIRED` | Nobody claimed in time or the invoice expired | "Expired" + resend option | "This claim expired" |

## 2. Transition rules

1. `PENDING_PAYMENT → READY_TO_CLAIM`: only after **server-side payment verification with Wompi** (hardened HMAC), never by a client signal.
2. `READY_TO_CLAIM → PROCESSING_PAYOUT`: only with **correct code + PIN** and a **valid BOLT11 invoice** (Mainnet, exact amount = `netPayoutUsdCents`, not expired). Entering `PROCESSING_PAYOUT` acts as a **lock**: two simultaneous claims cannot pay the same remittance twice.
3. `PROCESSING_PAYOUT → COMPLETED`: only on Blink's `SUCCESS` confirmation (`lnInvoicePaymentSend`).
4. Any error records `failureReason` and leaves the remittance in `FAILED`, visible in the `/admin` audit table.
5. **Anti-brute-force lock:** 5 failed PIN attempts lock the claim; it can only be unlocked from the admin panel.

## 3. Traceability (audit)

Every remittance keeps its full trail in the database: frozen amounts, payment mode (mock/production), invoice used, Blink wallet used, transaction reference, failure reason, and timestamps (createdAt, updatedAt, claimedAt). This enables two things the rubric requires:

- **History and individual inspection** of every transfer.
- **"Don't trust, verify":** any evaluator can audit the real state of a remittance in `/admin`.

## 4. Per-stage timing (design targets)

| Stage | Target time |
|---|---|
| Quote | Immediate (server-side calculation) |
| Card payment (Wompi) | < 1 minute |
| Claim (code + PIN) | < 1 minute, no registration |
| Invoice generation in Chivo | 1–2 minutes (guided in 4 steps) |
| Lightning settlement | **< 3 seconds** |
