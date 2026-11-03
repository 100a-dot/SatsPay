# Strategy — Strategic Documentation (Non-Dev)

**Project:** SatsPay (RemesasSV) · CUBO+ The Build Sprint 2026 · Team 4
**Track:** Non-Dev · **Authors:** @Fonsii319, @100a-dot

This folder contains the complete strategic work for the *Remittance Service* challenge: research, product specifications, and the operational model. All content is aligned with the actual implementation in this repository (Next.js + Wompi + Blink Stablesats + Chivo Wallet).

## Index

| # | Document | Challenge deliverable |
|---|---|---|
| 01 | [Market research](./01-market-research.md) | Market research |
| 02 | [Competitor mapping](./02-competitor-mapping.md) | Competitor analysis |
| 03 | [Personas (Sender & Recipient)](./03-personas.md) | Personas |
| 04 | [User journey](./04-user-journey.md) | User journey |
| 05 | [Fee & conversion model](./05-fee-conversion-model.md) | Fee & conversion model |
| 06 | [Transfer lifecycle](./06-transfer-lifecycle.md) | Transfer lifecycle |
| 07 | [Bitcoin opportunity analysis](./07-bitcoin-opportunity.md) | Bitcoin opportunity |
| 08 | [UX flow, receipts & confirmation](./08-ux-flow-receipts.md) | UX/payment flow, receipts, confirmation screens |
| 09 | [KPI framework](./09-kpi-framework.md) | KPIs |
| 10 | [Operational model](./10-operational-model.md) | Operational model |
| 11 | [Final product recommendation](./11-product-recommendation.md) | Product recommendation |
| 12 | [Work log](./12-work-log.md) | Work log (with Google Doc link) |

## Note on the functional prototype

The deployed application IS the high-fidelity prototype: in `MOCK` mode the full flow can be walked through (quote → payment → claim code + PIN → Chivo invoice → settlement) without moving real money, and in `PRODUCTION` mode it executes real Lightning Mainnet payouts. See the [technical README](../../README.md).
