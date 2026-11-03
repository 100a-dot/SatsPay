# 10 · Operational Model

**Track:** Non-Dev · **Authors:** @Fonsii319, @100a-dot

---

## 1. How SatsPay operates day to day

```
USD inflow              Treasury                   Recipient payout
┌────────────────┐     ┌──────────────────┐      ┌────────────────────┐
│ Wompi (Visa/MC │────►│ Blink Stablesats │─────►│ Lightning → Chivo  │
│ card, SV)      │     │ USD 1:1          │      │ Wallet (USD)       │
└────────────────┘     └──────────────────┘      └────────────────────┘
        │                      │                         │
   Sender charge,          Live monitoring in        Settlement < 3 s,
   verified server-side    admin, $0 Lightning       BOLT11 pre-validation
                           top-up
```

## 2. Required resources

| Resource | Role | Estimated cost |
|---|---|---|
| Wompi account (Banco Agrícola) | Card charging in the U.S./SV | Per-transaction gateway fee |
| Blink account + API Key | Stablesats USD treasury + Lightning payouts | Lightning network costs (fraction of a cent) |
| Hosting (Vercel + Postgres) | Web app + database | Free/low tier at the start |
| Treasury capital | Stablesats pre-funding for instant settlements | Based on projected volume; Phase 2 self-balances with Strike |
| Support (1 person) | PIN unlocks, `FAILED` remittances, user questions | Part-time at the start |

## 3. Key operational processes

1. **Treasury monitoring (daily):** check Stablesats USD and BTC balances in `/admin`; top up with the USD invoice generator ($0 fee) before running low.
2. **Audit review (daily):** `FAILED` remittances with their `failureReason`; contact the sender if money was left protected.
3. **Lock management:** unlock claims after verifying the sender's identity (one click in the admin panel).
4. **Environment switch:** `MOCK` for demos and testing; `PRODUCTION` only with a monitored treasury.
5. **Fee control:** $0.00 promo mode for campaigns; commercial pricing 1.5% + $0.50 as default.

## 4. Sustainability (revenue model)

- **Revenue:** 1.5% + $0.50 fee per remittance (~$6.50 on the typical $400 ticket).
- **Variable costs:** card gateway fee + a fraction of a cent of Lightning.
- **Margin:** positive per transaction as long as the gateway fee stays below the charged price; scales with volume, not by charging users more.
- **Growth levers:** $0 promo mode for acquisition, new corridors at ~zero marginal cost (Phase 3), Strike top-ups to avoid immobilizing capital (Phase 2).

## 5. Maintenance and continuity

| Area | Plan |
|---|---|
| External dependencies (Wompi, Blink) | Built-in diagnostics: `npm run blink:check` and Wompi OAuth2 verification from `/admin` |
| Lightning payout failures | Manual retry from the audit; `failureReason` always recorded |
| Security | Admin session with `httpOnly` cookie + HMAC; state lock against double spending; PIN anti-brute-force lock |
| Deployment | Vercel with auto-created tables at build; environment variables documented in `.env.example` |
| Backups | Managed database (Postgres) + audit export |

## 6. Operational risks

| Risk | Mitigation |
|---|---|
| Insufficient treasury | Low-balance alerts in the admin panel; instant Lightning top-up |
| Provider outage | Layered architecture: the remittance queue stays in the DB and retries when service returns |
| Fraud | Server-side payment verification, PIN + lock, complete audit |
| Regulatory | Funds enter through a regulated processor (Wompi/Banco Agrícola); complete records for reporting |
