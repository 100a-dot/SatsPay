# 02 · Competitor Mapping

**Track:** Non-Dev · **Authors:** @Fonsii319, @100a-dot

---

## 1. Comparison criteria

Four axes that research identified as critical: **fees**, **rate transparency**, **speed**, and **trust/communication**.

## 2. Comparison table (U.S. → El Salvador corridor)

| Operator | Fee structure | Cost on a typical transfer | Rate transparency | Typical speed | Trust / communication |
|---|---|---|---|---|---|
| **Western Union** | Fixed tiers + spread | ~$8–15 + margin | Low: proprietary rate, undeclared | Minutes (cash) to days (bank) | Strong brand, complex language |
| **Remitly** | % + fixed (e.g., 1.22% + $4.99) | ~$9.87 on $400 (~2.5%) | Medium: shows fee and rate, with own margin | Minutes (Express) to 3 days | Good app, clear tracking |
| **Wise** | Small fixed + % | ~1–1.5% | High: mid-market rate | Hours to 1–2 days | Transparency benchmark; little cash pickup |
| **Strike** | Low conversion cost | Variable, low | Medium-high | Minutes | Requires understanding new concepts |
| **Local agencies** | Fixed + hidden spread | Often the most expensive | Low | Business hours | Trust through proximity; zero digital tracking |
| **SatsPay** | **1.5% + $0.50** (or $0.00 promo mode) | **$6.50 on $400 (~1.6%)** | **Full: no spread; Stablesats 1:1 USD** | **Seconds (< 3 s) to Chivo Wallet** | Upfront breakdown, code + PIN, digital receipt, zero jargon |

## 3. The repeating pattern

- Incumbents compete on **brand and physical network**, not transparency: the spread is their silent revenue.
- Digital challengers improve clarity but keep a margin or hide the breakdown behind several steps.
- Almost none design for the **recipient**: tracking is built for the sender.
- None leverage the fact that **Chivo Wallet is already in the hands of El Salvador's population**.

## 4. SatsPay positioning

| Axis | SatsPay |
|---|---|
| Fees | 1.5% + $0.50; $0.00 promo mode for adoption and testing |
| Transparency | Fee and exact net amount before paying; conversion at reference rate; treasury in Stablesats (synthetic 1:1 USD) |
| Speed | Lightning settlement in < 3 seconds after validating the recipient's invoice |
| Trust | Claim code `SV-XXXX-XXX` + 4-digit PIN, anti-brute-force lock (5 attempts), WhatsApp-shareable digital receipt, pre-validation of the BOLT11 invoice |

**Core differentiator:** where the market blends fee and spread to overcharge, SatsPay separates them, shows them upfront, and settles in seconds over infrastructure El Salvador already has. *Don't trust, verify* applied to the product.

## 5. Competitive risks to watch

1. Incumbents could match transparency if the market starts demanding it.
2. Banks could integrate Lightning and replicate the cost — the defense is user experience and iteration speed.
3. Trust through physical proximity isn't replicated with price alone: it's replicated with clarity, receipts, and visible security (PIN, lock, receipts).

---

*Sources: World Bank, Remittance Prices Worldwide; public pricing from Remitly, Wise, and Western Union; Strike documentation.*
