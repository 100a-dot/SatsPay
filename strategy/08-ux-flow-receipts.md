# 08 · UX/Payment Flow, Receipts & Confirmation Screens

**Track:** Non-Dev · **Authors:** @Fonsii319, @100a-dot
**Connects with:** [user journey](./04-user-journey.md) · [personas](./03-personas.md)

---

## 1. Applied design principles

1. **Zero crypto jargon in the customer UI.** The words "Bitcoin", "Lightning", "sats" or "invoice" never appear in the sender's flow; they appear only where unavoidable (the Chivo invoice step, explained in 4 steps).
2. **One action per screen.** Each screen asks for one thing: amount, payment, code, invoice.
3. **The final amount is always visible before acting.**
4. **Mobile-first:** José and María operate from low-to-mid-range smartphones with limited data.

## 2. Screen map (implemented)

| # | Screen | Route | Key content |
|---|---|---|---|
| 1 | Landing | `/` | Value proposition in plain language + access to send |
| 2 | Send / calculator | `/enviar` | Amount, recipient details, 4-digit PIN, **live breakdown** (you send / fee / exact receive) |
| 3 | Payment checkout | `/checkout/[code]` | Card payment via Wompi + **live polling** of payment status |
| 4 | Sender receipt | `/checkout/[code]` (confirmed) | Code `SV-XXXX-XXX`, PIN, net amount, **share WhatsApp button**, printable receipt |
| 5 | Claim | `/reclamar/[code]` | Code + PIN entry, exact amount, **illustrated 4-step guide** for Chivo Wallet, invoice paste field |
| 6 | Recipient receipt | `/reclamar/[code]` (completed) | Official USD deposit receipt |
| 7 | Admin | `/admin` | Live Blink treasury, MOCK/PRODUCTION switch, fee control, remittance audit, PIN unlocks, Wompi configuration and Stablesats top-up |

## 3. Receipt design

### Sender receipt (José)

- **Large, legible claim code:** `SV-XXXX-XXX`
- **4-digit PIN** (chosen by him)
- Breakdown identical to the calculator: sent / fee / **exact net**
- **"Share on WhatsApp" button:** pre-formatted message with link + code + PIN (María receives it ready to use)
- Printable version

### Recipient receipt (María)

- **Official USD deposit receipt** with the exact credited amount
- Transaction reference for support
- Settlement date and time

**Purpose of the receipt:** it is verifiable evidence for both parties. If something doesn't add up, the receipt frozen in the database is the source of truth.

## 4. Confirmation and error messages (tone)

| Situation | Message (tone) |
|---|---|
| Payment confirmed | "Done! Your transfer is available. Share the code and PIN with your family." |
| Claim successful | "Money on its way. It will be in your Chivo Wallet in seconds." |
| Settlement complete | "Deposit completed: $393.50 USD." |
| Wrong PIN | "Wrong PIN. You have X attempts left." |
| Claim locked | "For your security we locked this transfer. The sender can manage it with support." |
| Invalid invoice | "That invoice doesn't match the amount. Here's how to generate it again." |

## 5. Transaction history

- The sender checks his transfers by code on the platform.
- The `/admin` panel keeps the **complete audit table**: every remittance with its status, frozen amounts, Wompi IDs, Blink references, and failure reasons.
- The rubric asks for "history + individual inspection": covered by `GET /api/remittances` and `GET /api/remittances/:code`.

## 6. Final UX flow (at a glance)

```
/enviar ──► /checkout/[code] ──► receipt + WhatsApp ──► /reclamar/[code] ──► Chivo guide (4 steps) ──► deposit receipt
 calculator    card payment        code + PIN             code + PIN            lnbc... invoice          < 3 seconds
```
