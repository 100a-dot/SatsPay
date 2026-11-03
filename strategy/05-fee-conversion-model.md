# 05 · Fee & Conversion Model

**Track:** Non-Dev · **Authors:** @Fonsii319, @100a-dot

---

## 1. Context: how the market charges

In the U.S. → El Salvador corridor the average cost is **~3.5%** of the amount (World Bank), and traditional services on small amounts reach **5–10%**. That cost blends two pieces: the explicit fee and a **hidden exchange-rate margin (spread)** — the technical cause of José's #1 frustration.

## 2. Decision: fixed, percentage, or both?

**Both in the calculation; a single figure in the communication.**

### Implemented structure

```
fee         = $0.50 fixed + 1.5% of the amount
net_amount  = amount − fee          (no spread: 1:1 conversion in USD)
```

| Parameter | Value | Rationale |
|---|---|---|
| Fixed | **$0.50** | Covers the minimum operating cost per transaction (card processing has a floor) |
| Percentage | **1.5%** | Scales with the amount; competitive against the corridor (3.5% average) |
| Spread | **0** | Funds travel as USD end to end (charged in USD → Stablesats USD 1:1 treasury → Chivo receives in USD). There is no margin-bearing conversion to hide |

Cost on José's typical transfer ($400): $0.50 + $6.00 = **$6.50 (~1.6%)** — less than half the market average.

There is also a **$0.00 promo/test fee mode (1:1)**, controlled from `/admin`, for live testing with micro-amounts (from $0.10) and adoption campaigns.

### Why there's no spread (and that's verifiable)

The architecture eliminates margin-bearing conversion by design: the sender pays USD, the treasury is held in **Stablesats (synthetic 1:1 USD)** at Blink, and the recipient generates a Lightning invoice **denominated in USD** in Chivo Wallet. Bitcoin/Lightning is only the transport *rail*; the value is never exposed to an exchange rate with markup. The backend validates that the recipient's invoice matches the **exact net amount**.

## 3. How it's communicated without confusing

Golden rule (from the Personas): **José doesn't do math and María doesn't guess.**

1. **One single fee figure** in the calculator: "Fee: $6.50". Never "0.50 + 1.5%".
2. **Exact net amount, prominent:** "María receives exactly: $393.50".
3. **The breakdown comes before payment** and is frozen when the remittance is created (`amountSentUsdCents`, `feeUsdCents`, `netPayoutUsdCents` stored in the DB; never recalculated client-side).
4. **User language**, not industry language:

| Instead of | We say |
|---|---|
| Fee / service charge | Fee |
| Exchange rate / FX | (not applicable: you send dollars, dollars arrive) |
| Net amount / payout | María receives |
| BOLT11 invoice, sats, LN | Chivo invoice, dollars, in seconds |

5. **No surprises afterwards:** the receipt repeats the same figures, identically, and serves as proof.

## 4. Worked examples

### Example A — Typical transfer ($400)

| Concept | Value |
|---|---|
| Amount sent | $400.00 |
| Fee ($0.50 + 1.5%) | $6.50 (1.6%) |
| **María receives** | **$393.50** |

### Example B — Small transfer ($20)

| Concept | Value |
|---|---|
| Fee ($0.50 + $0.30) | $0.80 (4.0%) |
| Communication | The screen shows the total and the net; the effective % is visible but not the protagonist |

### Example C — Large transfer ($1,000)

| Concept | Value |
|---|---|
| Fee ($0.50 + $15.00) | $15.50 (1.55%) |
| Message | The larger the amount, the lower the effective percentage cost |

## 5. Direct mapping to the implementation

| Field in `Remittance` | Source |
|---|---|
| `amountSentUsdCents` | What José enters (server-validated) |
| `feeUsdCents` | $0.50 + 1.5% of the amount, computed in the backend |
| `netPayoutUsdCents` | `amountSent − fee`; must match the recipient's BOLT11 invoice |
| `paymentMode` | `mock` ($0 simulation) / `production` (real payouts) |

Endpoints: `POST /api/remittances` (creates with breakdown), `GET /api/remittances/:code` (lookup by both parties), `POST /api/remittances/:code/claim` (validates PIN + invoice and executes the payout).

**Non-negotiable rule (rubric):** every calculation is validated on the server; the frontend only displays.

## 6. Connected KPIs

1. Abandonment on the calculator (does the breakdown clarify or scare?).
2. Average effective cost vs. the corridor benchmark (3.5%).
3. % of remittances claimed without support (proxy for model clarity).

---

*Sources: World Bank, Remittance Prices Worldwide; public pricing from Remitly and Wise; Blink (Stablesats) and Chivo Wallet documentation.*
