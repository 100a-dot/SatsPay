# 04 · User Journey: the complete remittance flow

**Track:** Non-Dev · **Authors:** @Fonsii319, @100a-dot
**Connects with:** [personas](./03-personas.md) · [transfer lifecycle](./06-transfer-lifecycle.md)

---

## Overview

```
1. Quote          2. Payment        3. Receipt + share   4. Claim             5. Chivo invoice     6. Settlement
José types   ──►  Pays by card ──►  Gets code + PIN  ──►  María opens the ──►  Generates USD   ──►  Lightning payment
the amount,      via Wompi        and sends it         link, enters code     Lightning invoice    < 3 s + official
sees breakdown                    over WhatsApp        + PIN                 in Chivo Wallet      receipt
```

---

## Step 1 — Quote (José, `/enviar`)

| | |
|---|---|
| **What he does** | Types the USD amount and recipient details; chooses a 4-digit PIN |
| **What he sees** | Live breakdown: amount sent · fee · **exact net amount María receives** |
| **System** | `POST /api/remittances`: **server-side** calculation and validation; the UI never calculates |
| **What can go wrong** | Invalid amount or below minimum → clear message before paying, never after |

**Design rule:** José never pays blind; the breakdown is upfront and mandatory.

## Step 2 — Payment (José, Wompi checkout)

| | |
|---|---|
| **What he does** | Completes payment with a Visa/Mastercard in the Wompi checkout (Banco Agrícola) |
| **System** | Backend verifies the payment with Wompi (hardened HMAC verification) before enabling the remittance; status `PENDING_PAYMENT → READY_TO_CLAIM` |
| **What can go wrong** | Payment declined → the remittance is not enabled and José knows immediately |

## Step 3 — Receipt and sharing (José)

| | |
|---|---|
| **What he sees** | Official digital receipt: code `SV-XXXX-XXX`, PIN, net amount, and a **share-on-WhatsApp button** with a pre-formatted message |
| **What he does** | One tap and María receives link + code + PIN |
| **What can go wrong** | María loses the message → José can resend it from the receipt |

## Step 4 — Claim (María, `/reclamar`)

| | |
|---|---|
| **What she does** | Opens the link, enters code + PIN (no account needed) |
| **What she sees** | Her exact amount and the **4-step guide** for Chivo Wallet |
| **System** | Code + PIN verification; **automatic lock after 5 failed attempts** (anti brute-force); unlock from `/admin` |
| **What can go wrong** | Repeated wrong PIN → lock with a clear message, not a technical error |

## Step 5 — Lightning invoice (María, Chivo Wallet)

| | |
|---|---|
| **What she does** | In Chivo: Receive → Bitcoin → Lightning → **Receive in USD** → pastes the `lnbc...` invoice into SatsPay |
| **System** | The backend **decodes and validates the BOLT11 before sending a single satoshi**: Mainnet network (not an on-chain `bc1...` address), exact amount equal to the net, invoice not expired |
| **What can go wrong** | Wrong-amount or expired invoice → error explained in plain Spanish with instructions to regenerate it |

## Step 6 — Settlement and receipt (María and José)

| | |
|---|---|
| **What happens** | Blink pays the invoice from the **Stablesats USD** treasury (`lnInvoicePaymentSend`); Chivo converts sats → USD automatically; **< 3 seconds** |
| **What María sees** | Official USD deposit receipt |
| **What José sees** | "Completed" status in his history |
| **What can go wrong** | Network or funds error → `FAILED` status with `failureReason` recorded and visible in the admin audit |

---

## Drop-off points to measure (KPI input)

1. Quote → payment start (does the breakdown clarify or scare?).
2. Payment start → payment completed (checkout friction).
3. Receipt shared → claim started (does María understand the message?).
4. Claim → invoice pasted (the most educational step: the 4-step guide).
5. Invoice → settlement (BOLT11 validation errors).
