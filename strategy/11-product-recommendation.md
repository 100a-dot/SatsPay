# 11 · Final Product Recommendation

**Track:** Non-Dev · **Authors:** @Fonsii319, @100a-dot

---

## Recommendation: launch SatsPay in the U.S. → El Salvador corridor, starting with card charging and settlement to Chivo Wallet

### Why yes

1. **The problem is real and measurable:** ~US$9,988 million a year in remittances to El Salvador, with 3.5–10% costs and settlement from hours to days. Every percentage point saved is money straight into a family's budget.
2. **The solution already works end to end:** verified Wompi charging, a volatility-free Stablesats treasury, strict invoice validation, and Lightning settlement in < 3 seconds. It is not a mockup: it is a system operable in `PRODUCTION`.
3. **The advantage is structural, not cosmetic:** spread = 0 by architecture (USD end to end), ~1.6% fee on the typical ticket vs. the market's 3.5%+, and the recipient gets money in the wallet El Salvador already uses.
4. **Trust is designed in:** breakdown before paying, code + PIN, anti-fraud lock, official receipts, and complete auditing. *Don't trust, verify* — for the user and for the evaluator.

### How to launch (deployment recommendation)

| Phase | Action | Exit criteria |
|---|---|---|
| **Pilot (4 weeks)** | $0.00 promo fee mode, micro-amounts, a closed group of sender-recipient families | Completion rate >= 85%, < 10% rejected invoices |
| **Launch** | Commercial pricing 1.5% + $0.50, campaign in Salvadoran communities in the U.S. | 100+ remittances/month, abandonment <= 30% |
| **Scale** | Phase 2 Strike (self-balancing treasury) + new corridors | Sustained positive per-transaction margin |

### What NOT to do yet

- Don't add more currencies or corridors before mastering the first one's funnel.
- Don't expose crypto concepts in the customer UI: adoption depends on it staying invisible.
- Don't remove MOCK mode: it is the demo, onboarding, and regression-testing tool.

### The metrics that decide the product's future

1. **Completion** (does the system keep the technical promise?)
2. **Abandonment from quote → payment** (do price and clarity convince?)
3. **30-day retention** (does the experience beat the corner agency?)

If those three stay on target, SatsPay has a real business: cheaper than the market, faster than banks, and clearer than everyone.
