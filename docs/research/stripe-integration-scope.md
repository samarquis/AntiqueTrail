# Stripe Integration Scope

**Date**: 2026-08-22
**Context**: Antique Trail membership system — $15/month and $30/month store tiers via Stripe
**Backend**: Supabase (Postgres, Edge Functions, Auth)
**Frontend**: React PWA (Vite)

## Recommended Approach: Stripe Checkout (Hosted)

For v1, use **Stripe Checkout Sessions** with `mode: 'subscription'`. This is the standard SaaS billing path — Stripe handles the payment form, tax calculation, and subscription lifecycle. You redirect the store owner to Stripe's hosted page, they pay, and you get a webhook confirming the subscription.

**Why not Payment Links?** Payment Links are fine for simple one-time or recurring charges, but they don't support metadata (store ID, tier), custom fields, or dynamic pricing. Checkout Sessions give you full control over what gets passed to Stripe.

**Why not embedded/Elements?** Overkill for v1. Embedded Checkout is a good middle ground if hosted redirect hurts conversion, but start with hosted and measure. Elements is for when you need pixel-perfect control — not needed here.

## Stripe Object Model

Map Antique Trail entities to Stripe objects:

| Antique Trail | Stripe Object | Notes |
|---|---|---|
| Store | Customer | One Stripe Customer per store. Created at onboarding. |
| Membership Tier | Product | "Free Tier", "Standard ($15)", "Premium ($30)" |
| Monthly Price | Price | Recurring price attached to Product |
| Subscription | Subscription | Links Customer to Price. Status: active, past_due, canceled |
| Invoice | Invoice | Generated monthly. Paid via saved payment method. |
| Payment Method | PaymentMethod | Card on file. Updated via Customer Portal. |

### Stripe Products and Prices

Create in Stripe Dashboard or via API:

```
Product: "Antique Trail — Standard"
  Price: $15/month (recurring)
  Price ID: price_standard_monthly

Product: "Antique Trail — Premium"
  Price: $30/month (recurring)
  Price ID: price_premium_monthly
```

Free tier has no Stripe Product — it's the default state when no subscription exists.

## Checkout Flow

### 1. Store Owner Selects Tier

In the Antique Trail dashboard, the store owner clicks "Upgrade to Standard" or "Upgrade to Premium."

### 2. Create Checkout Session (Edge Function)

```javascript
// Supabase Edge Function
const session = await stripe.checkout.sessions.create({
  customer: stripeCustomerId, // from your stores table
  mode: 'subscription',
  line_items: [{
    price: priceId, // price_standard_monthly or price_premium_monthly
    quantity: 1,
  }],
  automatic_tax: { enabled: true }, // Stripe Tax handles sales tax
  success_url: `${DOMAIN}/dashboard/billing?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${DOMAIN}/dashboard/billing`,
  metadata: {
    store_id: storeId,
    tier: tier, // "standard" or "premium"
  },
});

return { url: session.url };
```

### 3. Redirect to Stripe

The Edge Function returns the Checkout Session URL. The frontend redirects the store owner to Stripe's hosted page.

### 4. Stripe Handles Payment

Store owner enters card details on Stripe's page. Stripe processes payment, creates subscription, sends invoice.

### 5. Webhook Confirms Subscription

Stripe fires `checkout.session.completed` and `invoice.paid` webhooks. Your Edge Function updates the store's tier in Supabase.

## Customer Portal (Self-Service)

Enable Stripe Customer Portal for store owners to:
- Update payment method
- View invoice history
- Cancel subscription
- Switch tiers (upgrade/downgrade)

### Create Portal Session

```javascript
// Supabase Edge Function
const portalSession = await stripe.billingPortal.sessions.create({
  customer: stripeCustomerId,
  return_url: `${DOMAIN}/dashboard/billing`,
});

return { url: portalSession.url };
```

### Portal Configuration (Stripe Dashboard)

Enable these features:
- **Subscriptions**: Update payment method, cancel
- **Invoices**: View and download
- **Customer information**: Update billing details

## Required Webhooks

Set up webhook endpoint in Stripe Dashboard pointing to your Supabase Edge Function:

| Webhook Event | Handler Logic |
|---|---|
| `checkout.session.completed` | Create/update subscription record in Supabase. Set store tier. |
| `invoice.paid` | Mark subscription active. Reset photo count if needed. |
| `invoice.payment_failed` | Mark subscription past_due. Start 14-day grace period. |
| `customer.subscription.updated` | Sync tier changes (upgrade/downgrade). |
| `customer.subscription.deleted` | Downgrade store to free tier. Preserve photos for 30 days. |

### Webhook Signature Verification

```javascript
// In Edge Function
const signature = req.headers['stripe-signature'];
const event = stripe.webhooks.constructEvent(
  req.body,
  signature,
  endpointSecret
);
```

## Failed Payment & Grace Period

Stripe's built-in dunning handles the 14-day grace period:

1. **Day 0**: Card fails. Stripe fires `invoice.payment_failed`.
2. **Day 1–3**: Stripe retries charge (automatic).
3. **Day 3**: Email reminder to store owner.
4. **Day 7**: Second retry + email.
5. **Day 14**: Final retry. If still failed, subscription moves to `past_due` → `canceled`.
6. **Webhook**: `customer.subscription.deleted` fires. Your handler downgrades the store to free tier.

Configure in Stripe Dashboard → Settings → Billing → Dunning:
- Retry schedule: 3 attempts over 14 days
- Customer notifications: Enabled
- Subscription status after final failure: Canceled

## Refund Handling (48-Hour Window)

> Proposed policy — not yet an approved Product Decision. Requires Product Owner sign-off before implementation.

Stripe doesn't have a built-in "48-hour refund window." Implement manually:

1. Store owner requests refund within 48 hours of first payment.
2. Admin verifies the request in your admin dashboard.
3. Admin clicks "Issue Refund" → calls Stripe Refund API.
4. Stripe refunds the full amount, cancels the subscription.

```javascript
// Supabase Edge Function
const refund = await stripe.refunds.create({
  payment_intent: paymentIntentId,
  reason: 'requested_by_customer',
});
```

After 48 hours, refunds are not processed. Store owner can cancel but keeps access until billing period ends.

## Test Mode vs. Live Mode

| Environment | Stripe Key | Supabase |
|---|---|---|
| Local dev | `sk_test_...` | Local Supabase |
| Internal Alpha | `sk_test_...` | Staging project |
| Regional Public MVP | `sk_live_...` | Production project |

Use Stripe test mode during Internal Alpha. Test with card number `4242 4242 4242 4242`. Switch to live mode only when the paid-tier transition is approved per ADR 0005.

Store test Stripe keys in Supabase Vault or environment variables. Never commit to git.

## Invoice Emails

**Recommended**: Use Stripe's default invoice emails for v1. They're professional, include the Stripe logo, and handle:
- Payment confirmation
- Failed payment notification
- Subscription renewal reminder
- Cancellation confirmation

If branding is needed later, switch to Stripe's white-label invoice emails or integrate Resend for custom templates.

## Integration Checklist

- [ ] Create Stripe account
- [ ] Create Products and Prices in Stripe Dashboard
- [ ] Enable Stripe Tax
- [ ] Enable Customer Portal
- [ ] Configure webhook endpoint
- [ ] Set up dunning (14-day grace, 3 retries)
- [ ] Create Edge Function for Checkout Session creation
- [ ] Create Edge Function for Customer Portal session
- [ ] Create Edge Function for webhook handling
- [ ] Add `stripe_customer_id` column to stores table
- [ ] Add `stripe_subscription_id` column to stores table
- [ ] Add `subscription_status` column (active, past_due, canceled)
- [ ] Add `tier` column (free, standard, premium)
- [ ] Test with Stripe test keys in Internal Alpha
- [ ] Document switch to live keys for Regional Public MVP

## Sources

- Stripe Checkout: https://stripe.com/payments/checkout
- Stripe Subscriptions: https://docs.stripe.com/billing/subscriptions
- Stripe Customer Portal: https://docs.stripe.com/customer-management/portal
- Stripe Tax: https://stripe.com/tax
- Stripe Webhooks: https://docs.stripe.com/webhooks
- Context7 Stripe Docs: /websites/stripe (6,424 code snippets)
