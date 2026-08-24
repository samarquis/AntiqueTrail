# Storage Cost Break-Even Analysis

**Date**: 2026-08-22
**Context**: Antique Trail membership tiers — free (5 photos), $15/month (15 photos), $30/month (unlimited)
**Photo spec**: Compressed WebP, ~300 KB average per image

## Per-Store Storage Requirements

| Tier | Photo Limit | Storage per Store |
|---|---|---|
| Free | 5 photos | 1.5 MB |
| $15/month | 15 photos | 4.5 MB |
| $30/month | ~200 photos (realistic cap) | 60 MB |

## Storage Provider Pricing (2026)

### Option A: Supabase Storage (current backend)

| Plan | Monthly Cost | Storage Included | Overage |
|---|---|---|---|
| Free | $0 | 1 GB | N/A (hard limit) |
| Pro | $25/month | 100 GB | $0.021/GB/month |
| Team | $599/month | 250 GB | $0.021/GB/month |

Egress: 250 GB included on Pro, $0.09/GB overage.

### Option B: Cloudflare R2 (per ADR 0005 paid-tier transition)

| Tier | Monthly Cost | Storage | Operations |
|---|---|---|---|
| Free | $0 | 10 GB | 1M Class A, 10M Class B |
| Standard | $0.015/GB-month | $0.015/GB | $4.50/million Class A, $0.36/million Class B |

Egress: **FREE** (always — R2's core value proposition).

## Break-Even Calculation

### Monthly Infrastructure Floor

| Component | Cost | Notes |
|---|---|---|
| Supabase Pro | $25 | Required for production (no pausing) |
| Vercel | $0 | Free tier sufficient for PWA |
| Resend | $0 | Free tier: 3,000 emails/month |
| Stripe | $0 base | 2.9% + $0.30 per transaction |
| **Total floor** | **$25/month** | |

### Storage Costs at Scale

Assuming Supabase Pro ($25/month, 100 GB included):

| Scenario | Free Stores | $15 Stores | $30 Stores | Total Storage | Storage Cost |
|---|---|---|---|---|---|
| Early (50 stores) | 40 | 7 | 3 | 105 MB | $0 (within 100 GB) |
| Growing (200 stores) | 140 | 40 | 20 | 960 MB | $0 (within 100 GB) |
| Scale (1,000 stores) | 700 | 200 | 100 | 6.3 GB | $0 (within 100 GB) |
| Heavy (5,000 stores) | 3,500 | 1,000 | 500 | 36 GB | $0 (within 100 GB) |
| Max (10,000 stores) | 7,000 | 2,000 | 1,000 | 72 GB | $0 (within 100 GB) |

**Key insight**: At 300 KB per photo, storage is NOT the cost driver. Even 10,000 stores with photos only use ~72 GB — well within Supabase Pro's 100 GB included storage.

### If Migrating to R2 (per ADR 0005)

R2 free tier: 10 GB. At 300 KB/photo:
- 10 GB ÷ 1.5 MB/store (free) = ~6,667 free stores before hitting free tier
- 10 GB ÷ 60 MB/store ($30) = ~167 heavy stores before hitting free tier

R2 Standard pricing ($0.015/GB-month):
- 100 GB = $1.50/month
- 500 GB = $7.50/month
- 1 TB = $15.00/month

**R2 is dramatically cheaper for storage** — but the real savings is egress (free vs. $0.09/GB on Supabase).

### Egress Costs (the hidden driver)

Photo serving = egress. Each store page load fetches 1–5 photos.

| Scenario | Monthly Egress | Supabase Cost | R2 Cost |
|---|---|---|---|
| 10K page loads/month | 15 GB | $0 (within 250 GB) | $0 |
| 100K page loads/month | 150 GB | $0 (within 250 GB) | $0 |
| 1M page loads/month | 1.5 TB | $112.50 overage | $0 |
| 10M page loads/month | 15 TB | $1,327.50 overage | $0 |

**This is why ADR 0005 mandates R2 for the paid-tier transition** — egress costs explode at scale, and R2 eliminates them entirely.

## Revenue vs. Cost Break-Even

### Monthly Revenue per Store

| Tier | Price | Stripe Fee (2.9% + $0.30) | Net Revenue |
|---|---|---|---|
| $15/month | $15.00 | $0.74 | $14.26 |
| $30/month | $30.00 | $1.17 | $28.83 |

### How Many Paid Stores Cover the $25/month Infrastructure Floor?

| Mix | Stores Needed | Monthly Revenue | Net After Stripe |
|---|---|---|---|
| All $15 | 2 stores | $30.00 | $28.52 |
| All $30 | 1 store | $30.00 | $28.83 |
| 50/50 split | 2 stores | $45.00 | $43.09 |

**Break-even is 1–2 paid stores.** The free tier cost is negligible.

### Sensitivity: What if Only X% of Stores Pay?

| Paying % | 200 Total Stores | Paid Stores | Monthly Revenue | Covers $25 Floor? |
|---|---|---|---|---|
| 10% | 200 | 20 | $285–$570 | Yes (11–23x) |
| 20% | 200 | 40 | $570–$1,140 | Yes (23–46x) |
| 50% | 200 | 100 | $1,426–$2,883 | Yes (57–115x) |

**The model is viable even at low conversion rates.** The free tier is a marketing cost, not a financial burden.

## Recommendations

1. **Storage is not the cost driver** — egress is. Use R2 for the paid-tier transition per ADR 0005.
2. **Free tier is financially safe** — even 10,000 free stores cost $0 in storage on Supabase Pro.
3. **Break-even is 1–2 paid stores** — the membership model covers infrastructure costs almost immediately.
4. **Monitor egress, not storage** — if staying on Supabase Pro, watch the 250 GB egress limit. Migrate to R2 before hitting it.
5. **$30 tier is high-margin** — $28.83 net revenue vs. ~$0.09/month storage cost per store = 320x margin.

## Sources

- Supabase Pricing: https://supabase.com/pricing (verified August 2026)
- Cloudflare R2 Pricing: https://developers.cloudflare.com/r2/pricing/ (verified August 2026)
- ADR 0005: `docs/adr/0005-host-free-first-on-cloudflare-pages-and-supabase.md`
