# 07 · Bitcoin Opportunity Analysis

**Track:** Non-Dev · **Authors:** @Fonsii319, @100a-dot

---

## 1. Why Bitcoin fits remittances to El Salvador

El Salvador is the only market in the world where all three conditions already exist:

1. **Legal framework:** Bitcoin has been legal tender since 2021.
2. **Receiving infrastructure deployed:** Chivo Wallet is already in the population's hands; nobody needs to be convinced to install "another weird app".
3. **Massive remittance market:** ~US$9,988 million in 2025 (~24% of GDP), with 3.5–10% costs that technology can compress to a fraction.

## 2. What problem Bitcoin/Lightning solves (and what it doesn't)

| Traditional remittance problem | Does Bitcoin/Lightning solve it? |
|---|---|
| Slow settlement (days, correspondents) | **Yes:** < 3 seconds, 24/7, no intermediary banks |
| High intermediation costs | **Yes:** Lightning network cost < a fraction of a cent |
| Business hours and pickup lines | **Yes:** money lands straight in the recipient's wallet |
| BTC volatility in transit | **Not by itself** → solved with **Stablesats (synthetic 1:1 USD)** |
| Crypto complexity for the user | **Not by itself** → solved by hiding it: the user only sees dollars |
| Fee and spread opacity | **Not by itself** → solved with product design (upfront breakdown, spread = 0) |

**SatsPay's thesis:** Bitcoin is the *rail*, not the product. The product is "send dollars, dollars arrive, in seconds, almost free".

## 3. How SatsPay uses Bitcoin today (implemented)

- **Stablesats treasury (Blink):** funds in transit hold 1:1 parity with USD → zero volatility for the business and the user.
- **Direct Lightning settlement to Chivo Wallet:** the recipient generates a **USD-denominated** BOLT11 invoice; the backend validates it (network, amount, expiry) and pays it with `lnInvoicePaymentSend`. Chivo converts sats → USD instantly.
- **Zero-fee treasury top-up:** USD invoice generator (`lnUsdInvoiceCreate`) to replenish Stablesats from Chivo Wallet at $0.00.
- **MOCK/PRODUCTION switch:** the same flow runs in simulation ($0) or on real Mainnet — the architecture is already production-grade.

## 4. Opportunity roadmap (what's next)

| Phase | Opportunity | Impact |
|---|---|---|
| **Phase 1 (current)** | Pre-funded Stablesats treasury; Lightning payouts to Chivo | Full flow working, settlement in seconds |
| **Phase 2** | **Strike API** integration: USD arriving by card in the U.S. automatically refills Stablesats over Lightning (1 s), without waiting for ACH bank settlement | Self-balancing treasury; scale without idle capital |
| **Phase 3** | Additional corridors (Mexico, Guatemala) reusing the same Lightning rail | Marginal cost of a new corridor approaches zero |
| **Phase 4** | Direct deposits to bank accounts/local wallets via off-ramp partners | Recipients without Chivo covered |

## 5. Risks and mitigations

| Risk | Implemented or proposed mitigation |
|---|---|
| BTC volatility | Stablesats 1:1 USD treasury (implemented) |
| Wrong/expired invoices | BOLT11 validation before payment (implemented) |
| Claim fraud | Code + PIN, lock after 5 attempts, state lock (implemented) |
| Treasury liquidity | Live monitoring in `/admin` + $0 Lightning top-up (implemented); Strike API in Phase 2 |
| Regulatory | KYC/AML via regulated processors (Wompi/Banco Agrícola at the entry point); complete audit reports |

## 6. Conclusion

Bitcoin/Lightning improves remittance infrastructure exactly where it hurts most: **speed, cost, and availability**. SatsPay captures that opportunity without passing complexity or volatility to the user — which is why most crypto remittance attempts failed to reach mass adoption.
