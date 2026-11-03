# 01 · Market Research: International Remittances

**Track:** Non-Dev · **Authors:** @Fonsii319, @100a-dot

---

## 1. Market size and relevance

- El Salvador received **US$8,479.7 million** in family remittances in **2024** (~**24% of GDP**) and nearly **US$9,988 million in 2025** (Central Reserve Bank / World Bank).
- **Over 90%** of remittances come from the **United States** → SatsPay's primary corridor: U.S. → El Salvador.
- The average sender sends **~US$414 per transfer**, is ~44 years old, and earns ~US$3,900 per month. The typical transfer is not discretionary spending: it is the receiving household's budget.
- Average total corridor cost: **~3.5% of the amount** (World Bank, *Remittance Prices Worldwide*), and traditional services on small amounts can reach **5–10%**.
- Unique context: Bitcoin is legal tender in El Salvador and **Chivo Wallet** is already deployed across the population — the Lightning receiving infrastructure **already exists**.

**Conclusion:** a massive market, high frequency (1–2 transfers/month per household), small amounts, and users sensitive to every dollar of fees. The problem is not demand: it is **cost, slowness, and opacity**.

## 2. How traditional services operate

1. The sender pays (cash at an agent, card, or bank).
2. The operator charges an explicit fee **+ a hidden exchange-rate margin**.
3. Settlement to the destination correspondent takes hours or days.
4. The recipient picks up cash (lines, business hours) or receives a slow deposit.

### Friction points (input for Personas and design)

| # | Friction | Impact |
|---|---|---|
| 1 | Fee and exchange rate blended | The user doesn't know the real cost |
| 2 | Breakdown shown only after confirming | No way to compare or decide informed |
| 3 | Hidden spread | Less arrives than expected; nobody explains why |
| 4 | Poor transfer status visibility | Sender anxiety; the recipient can't verify on their own |
| 5 | Slowness (days) and lines | Time cost on both ends |
| 6 | Financial/crypto jargon | Intimidates and breeds distrust |

## 3. What makes a good remittance product

1. **Breakdown before confirming:** amount, fee, and exact final amount on one screen.
2. **Exchange rate with no hidden margin.**
3. **Tracking with understandable statuses**, accessible to both parties.
4. **Simple language**, in the user's language.
5. **A clear receipt** the recipient can show when claiming.

These five points are the challenge's interface requirements and SatsPay's design criteria.

## 4. Implications for SatsPay

| Finding | Implemented product decision |
|---|---|
| Fee + spread opacity (#1, #3) | Fee shown separately; conversion at reference rate with no markup; funds in **Stablesats USD** (1:1 parity) |
| Late breakdown (#2) | Real-time calculator **before** paying (`/enviar`) |
| Invisible status (#4) | Claim code `SV-XXXX-XXX` checkable by both parties |
| Slowness and lines (#5) | Lightning settlement **< 3 seconds** straight to **Chivo Wallet** |
| Jargon (#6) | Zero crypto vocabulary in the customer UI; complexity lives in the backend |

---

*Sources: Central Reserve Bank of El Salvador (remittances 2024–2025); World Bank, Remittance Prices Worldwide (U.S.–El Salvador corridor); Salvadoran sender profile studies.*
