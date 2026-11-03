# 03 · Personas: Sender & Recipient

**Track:** Non-Dev · **Authors:** @Fonsii319, @100a-dot
**Connects with:** [market research](./01-market-research.md) · [competitors](./02-competitor-mapping.md)

---

## Persona 1 — The Sender

### "José" — Worker abroad

| | |
|---|---|
| **Age** | 44 |
| **Location** | Houston, Texas, USA |
| **Occupation** | Construction, 10-hour shifts, 6 days a week |
| **Income** | ~US$3,900/month |
| **Education** | Some high school |
| **Technology** | Low-to-mid-range Android; WhatsApp and Facebook daily; never used investing or crypto apps |
| **Language** | Spanish; basic functional English |

### Situation

He left San Miguel 9 years ago. He sends his wife and mother **$350–$450, once or twice a month**. That money pays for food, school, and medicine: it is the family budget, not discretionary spending.

### Frustrations

- **He doesn't know exactly how much his family receives.** "I send $400 and they get $382 back home — why?"
- **He finds out the real cost after sending.**
- **Anxiety about the transfer status.**
- **Intimidating language:** "exchange rate", "wallet", "blockchain" make him distrustful.
- **Agency lines cost him half of his Sunday off.**

### What he needs from SatsPay

1. Before paying, a single screen: "You send $400 · Fee $6.50 · **Your family receives exactly $393.50**".
2. A simple claim code and a PIN he chooses, to share over WhatsApp.
3. Jargon-free language: "they receive", "fee", "in seconds".
4. Certainty that the amount on screen is the final amount.

> "I don't need to understand how the money travels. I need to know that out of my $400, my mom gets every dollar and I know when."

---

## Persona 2 — The Recipient

### "María" — Family member back home

| | |
|---|---|
| **Age** | 38 |
| **Location** | San Miguel, El Salvador |
| **Occupation** | Informal home shop |
| **Income** | ~US$300/month of her own + her husband's remittances (over half the household income) |
| **Education** | High school graduate |
| **Technology** | Smartphone with limited data; WhatsApp as main channel; has **Chivo Wallet** installed |
| **Relationship** | José's wife; manages the household budget |

### Situation

She receives the money and stretches it for the whole month. When a transfer is delayed, she buys on credit or borrows. She used to pick up cash at an agency; today she already knows Chivo Wallet because the neighborhood uses it.

### Frustrations

- **Uncertainty about how much she'll receive.**
- **Not knowing when to go pick it up:** she loses her morning "checking if it arrived".
- **Depending on José to notify her:** if he doesn't answer, she can't verify on her own.
- **Distrust of apps** that ask for too much data.
- **She doesn't understand the English** on receipts and apps.

### What she needs from SatsPay

1. Open a link, enter her **code + PIN**, and see the exact amount that belongs to her — no account needed.
2. Step-by-step instructions (4 steps) to generate her invoice in Chivo Wallet and receive USD.
3. Receive the money **in seconds**, no lines, no business hours.
4. An official digital receipt as proof.

> "Don't send me a 20-letter transaction number. Tell me: $393.50 arrived, it's already in your Chivo."

---

## The two ends of a single transfer

| Moment | José (sender) | María (recipient) |
|---|---|---|
| Before sending | Sees the full breakdown in the calculator | — |
| On payment | Receipt with code `SV-XXXX-XXX` + PIN + WhatsApp button | Receives the WhatsApp message with link, code, and PIN |
| Claim | Sees his transfer status | Enters code + PIN, follows the 4-step Chivo guide |
| Settlement | Sees "Completed" | Receives USD in Chivo Wallet in seconds + official receipt |
| If it fails | Sees the reason and his money protected | Clear message; after 5 wrong PINs the claim locks for security |

## Derived product decisions

1. **Calculator before paying** (José's #1 frustration) → live breakdown at `/enviar`.
2. **Account-free claim** with code + PIN (María's #1 frustration) → `/reclamar` flow.
3. **4-step guide in Spanish** to generate the Lightning invoice in Chivo Wallet.
4. **The breakdown is frozen when the remittance is created** (`amountSentUsdCents`, `feeUsdCents`, `netPayoutUsdCents` in the database) and never recalculated: what José saw is what María receives.
