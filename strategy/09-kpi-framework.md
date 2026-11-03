# 09 · KPI Framework

**Track:** Non-Dev · **Authors:** @Fonsii319, @100a-dot

---

## 1. Primary KPIs (the ones the rubric asks for)

| KPI | Definition | Formula | Initial target | Where it's measured |
|---|---|---|---|---|
| **Completion rate** | % of created remittances that end in `COMPLETED` | `COMPLETED / total created` | >= 85% | `/admin` audit table |
| **Abandonment rate** | % of users who start the flow and don't pay | `1 − (paid remittances / created remittances)` | <= 30% | Funnel: created vs. `READY_TO_CLAIM` |
| **Average ticket** | Mean amount sent | sum of amounts sent ÷ n | ~$400 (market benchmark) | Audit |
| **Retention** | % of senders with 2+ transfers in 30 days | `recurring senders / active senders` | >= 40% | By `senderEmail` |

## 2. Operational KPIs (service health)

| KPI | Target | Why it matters |
|---|---|---|
| Settlement time (invoice validated → paid) | < 3 s (p95) | It is the product's core promise |
| % of invoices rejected by validation | < 10% | Measures the clarity of the Chivo 4-step guide |
| % of claims locked by PIN | < 2% | Measures security friction vs. protection |
| Average effective cost charged | <= 1.8% | Benchmark against the corridor's 3.5% |
| Time payment → claim started | < 24 h | How fast the WhatsApp message propagates |

## 3. Business KPIs (sustainability)

| KPI | Target | Note |
|---|---|---|
| Revenue per remittance (average fee) | ~$6.50 on a typical ticket | See [fee model](./05-fee-conversion-model.md) |
| Margin over gateway costs | Positive per transaction | Wompi fee + operating costs < fee charged |
| Remittances/day per corridor | Weekly growth | Adoption signal |

## 4. How it's instrumented (with what's already built)

- The **`/admin` audit table** already records status, amounts, timestamps (createdAt, claimedAt), and `failureReason` per remittance → completion, abandonment, ticket, and timing all come from there.
- Phase 2 recommendation: export to a spreadsheet or connect Metabase/Superset for weekly dashboards without touching code.

## 5. Rule of use

Every KPI must have: a current figure, a target, and an associated decision. A KPI that doesn't change a decision gets removed from the dashboard.
