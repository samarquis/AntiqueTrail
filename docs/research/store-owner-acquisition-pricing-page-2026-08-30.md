# Store-owner acquisition and pricing page research

**Research date:** 2026-08-30
**Scope:** Current first-party acquisition, pricing, signup, and trust patterns for antique/vintage marketplaces and adjacent local-business listing services.
**Method:** Live first-party product, pricing, help, policy, and original-usability-research pages only. Competitor marketing claims are identified as such; they are not treated as independent proof.
**Planning status:** Research evidence snapshot. The Product Owner later issued `update plan` on 2026-08-30; the amendment recorded in `PLAN_CHANGELOG.md` supersedes this memo wherever they differ. In particular, current controlling decisions now define three QR classes, public Free claim/add intake only after Package 10B, approval before plan choice/payment, Free/Gallery/Full Gallery names and counts, no waitlist, and the complete paid-activation gate. Do not implement directly from this memo.

## Executive finding

Antique Trail should eventually have a dedicated **For Store Owners** acquisition page, not an About page with pricing added to it. Its job is to make one commercial promise understandable: help a verified antique store become easier to discover and easier to include in a shopper's real trip. The page should show the product in context, state the complete price and terms, explain verification and publication, let an owner compare a small number of plans, answer risk questions, and end in one stage-appropriate action.

The larger issue is not page design. The approved paid tiers currently sell only additional photo capacity, while two close substitutes provide substantial listing capability free: Google Business Profile provides hours, contact/location, photos/video, reviews, and outbound links at no charge, and AntiquesDirectory's live owner page says its listing, claiming, photos, events, and analytics are free. Antique Trail cannot yet truthfully promise incremental foot traffic or return on spend, and its plan explicitly excludes store analytics, paid placement, and sponsored ranking. A visually impressive pricing page cannot repair an unproven paid value proposition.

## Existing-plan check: this is not greenfield

I found no explicit deliverable for a public **For Store Owners / Pricing** acquisition page in `PLAN.md`, `IMPLEMENTATION_PLAN.md`, `PLAN_ACCEPTANCE.md`, or `PLANNING_INDEX.md`. I did find material already governing the page and signup behavior:

- `docs/specs/store-membership-spec.md` defines Free (cover + 5 gallery images), Featured (15), and Unlimited (no cap), but deliberately leaves dollar prices unset.
- `PRODUCT_DECISIONS.md` and that spec say onboarding is invitation-first and **never a public signup page**; selection occurs after the store draft, Stripe payment does not publish the listing, and Administrator approval remains required.
- Paid activation is staged off until the post-RG-01 monetization decision, Package 13 gates, and a signed activation receipt. Current promotion gates do not authorize billing.
- `PRD.md` excludes store-owner analytics, paid placement/advertising products, sponsored ranking, and access to shopper activity.
- `PRODUCT_DECISIONS.md` permits consent-based, unpaid promotion only after Package 10B; promotion cannot buy ranking, verification, ratings, or shopper data.
- The older `docs/research/stripe-integration-scope.md` describes $15/$30 products, but the later approved membership spec expressly supersedes that assumption by leaving prices unset. Do not surface $15/$30 as current pricing.

**Planning implication:** after product approval, update the plan to add the acquisition page and explicitly decide whether its initial CTA is `Request an invitation`, `Claim or add your store`, or a true public signup. A live `Select plan and sign up` CTA would currently contradict approved policy.

## Current comparable services

All prices below were checked on first-party pages on 2026-08-30. These are different products and should not be treated as a direct price survey; the useful evidence is how each service explains the buyer, value, conditions, and next step.

| Service | Current first-party offer | Acquisition-page pattern | Relevance to Antique Trail |
|---|---|---|---|
| [AntiquesDirectory — For Store Owners](https://antiquesdirectory.com/for-store-owners) | Its live page says adding a listing is free and always will be; claiming a listing, photos, hours, events, and analytics are also described as free. The former `/pricing` URL now resolves to this page. | Opens with `Grow your resale business`, groups benefits into getting found, running the shop, and owner community, then repeats the add-business action. | Closest category benchmark. It makes a paid photo-capacity-only offer difficult to justify unless Antique Trail proves unique trip-planning demand or supplies a distinct owner outcome. |
| [Google Business Profile](https://support.google.com/business/answer/7039811?hl=en-en) | At no charge, a verified storefront can manage hours, website, phone, location, photos/video, reviews, and links that direct customers to its website, social profiles, or bookings. | Leads with being found in Search and Maps, then explains concrete profile controls and verification. | The minimum competitive baseline is accurate discovery plus owner control for free. Verification itself is part of the trust promise. |
| [Yelp local-business pricing](https://business.yelp.com/local-business-pricing/) | Free Business Page; Yelp Ads from $150/month; Upgrade Package $180/month; combined from $270/month; cancel anytime. Paid features are described as placement, targeting, visuals/offers, removal of competitor ads, and performance tracking. | Names the intended buyer for each option, shows price and cancellation beside the offer, uses testimonials, and keeps a free entry point. | Paid tiers are tied to a distinct business outcome or control, not merely more content capacity. Yelp's performance figures are Yelp's own advertising claims, not independent evidence for Antique Trail. |
| [Tripadvisor Business Advantage FAQ](https://www.tripadvisor.com/business/business-advantage/frequently-asked-questions) | Price varies by property location, size, and profile; the stated minimum for a 12-month subscription is $99/year. It adds profile control, up to three special offers, contact links, and analytics. The FAQ explains setup, invoices, cancellation, and refund timing. | Claims a free listing first, explains the paid outcome (direct contact/bookings), then removes operational uncertainty in a detailed FAQ. | Even variable pricing gets a visible floor and representative outcome. Billing, cancellation, and what happens next belong on the sales page, not behind checkout. |
| [Chairish seller plans](https://www.chairish.com/pages/consign-with-us) | Consignor: free, 1–9 listings, 40% commission. Professional: free, 10+ listings, 30%. Premium: $49/month or $539/year, 25% on qualifying one-of-a-kind listings. Plus: $99/month or $1,089/year, 22% plus tools/credits. Elite: invitation-only, $149/month or $1,639/year, tiered commission and higher service. | Every plan says who it is for; a detailed comparison defines fees; benefits are expressed as economics, workload reduction, promotion, curation, reporting, support, and speed; contact details and FAQ sit next to the CTA. | Strong pattern for self-selection: describe store fit in ordinary language and connect each higher tier to a material business difference. Chairish is a transaction marketplace, so its commission levels are not price anchors for Antique Trail. |
| [Ruby Lane seller terms](https://www.rubylane.com/info/terms) and [seller page](https://www.rubylane.com/info/sell) | Current terms state no setup/listing fee, $45/month including unlimited items, plus tiered service fees of 9.9% through $2,500, 5% from $2,500–$7,500, and 2.5% above $7,500 per item. The seller page specifies eligibility, payment prerequisites, quality rules, setup help, seller support, and testimonials. | Qualification appears before signup; pricing rules are illustrated with a worked example; trust is supported with standards, security/support descriptions, and named seller accounts. | Antique businesses expect vetting and detailed terms. A worked plan example and a plain eligibility explanation are stronger than a decorative trust badge. |
| [Etsy selling fees](https://help.etsy.com/hc/en-us/articles/115014483627-What-are-the-Fees-and-Taxes-for-Selling-on-Etsy?segment=selling) and [Sell on Etsy](https://www.etsy.com/sell) | The fee page discloses a potentially variable setup fee, $0.20 listing fee, 6.5% transaction fee, country-variable payment processing, and optional/conditional advertising fees. The seller page separately explains setup steps, payment, protection, eligibility, and support resources. | A short acquisition narrative leads to a comprehensive fee disclosure and FAQ; the final CTA repeats after questions are answered. | Do not hide secondary costs or eligibility rules inside terms. Antique Trail should explicitly say there is no commission or per-listing fee if that remains true. |
| [Shopify pricing](https://www.shopify.com/pricing) | The official page offers plan cards, monthly/yearly cadence, a full feature comparison, additional-fee disclosure, security/hosting FAQ, and a repeated trial CTA. | Summary first, exhaustive comparison second, FAQ third, CTA repeated. | Useful information architecture, but Shopify is a commerce operating system rather than a local discovery listing; its prices are not comparable market prices. |

## What the comparable pages consistently do

These are observed patterns, not claims that any individual pattern causes conversion:

1. **Lead with the owner's outcome.** `Get found`, `drive direct bookings`, `start selling`, or `grow your business` appears before product mechanics.
2. **Name who each option fits.** Chairish describes inventory size and selling maturity; Yelp describes the business goal. The owner should recognize herself before reading every feature.
3. **Keep a free or low-risk entry path.** Google, AntiquesDirectory, Yelp, and Chairish all provide a free starting point. This matters more when the platform has not yet proven owner ROI.
4. **State real pricing and fee boundaries.** Monthly/annual cadence, commissions, conditions, taxes/additional fees, cancellation, and refund behavior are visible or directly linked.
5. **Explain process and eligibility.** Claiming, verification, setup, payment, review, and publication are not treated as incidental back-office details.
6. **Show the mechanism behind value.** Profiles, photos, contact actions, direct bookings, search placement, tools, or lower commissions make the promised outcome plausible.
7. **Answer objections beside the decision.** FAQs cover setup effort, payment, cancellation, support, security, and what happens after signup.
8. **Repeat one clear next action.** The CTA returns after the visitor has seen the offer and after the FAQ; competing actions are subordinate.

## Evidence-backed trust and conversion guidance

### Verified research and authority

- Nielsen Norman Group's B2B usability research reports that price is business prospects' top online information need and that participants leave sites that hide it. It recommends exact prices or representative scenarios/ranges when pricing varies. Source: [State the Price to Give B2B Sites a Competitive Advantage](https://www.nngroup.com/articles/show-price/).
- W3C cognitive-accessibility guidance says controls need visible labels using common, easy-to-understand words, placed next to the relevant control, and readable by assistive technology. Source: [Use Clear Visible Labels](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o4p06-clear-labels/).
- FTC guidance requires endorsements to be honest and not misleading, material connections to be disclosed, and result claims to be substantiated or accompanied by the generally expected result. The FTC's current Reviews and Testimonials Rule also prohibits fake or false testimonials and incentives conditioned on positive sentiment. Sources: [Endorsements, Influencers, and Reviews](https://www.ftc.gov/business-guidance/advertising-marketing/endorsements-influencers-reviews) and [Reviews and Testimonials Rule Q&A](https://www.ftc.gov/business-guidance/resources/consumer-reviews-testimonials-rule-questions-answers).
- Stripe Checkout supports hosted subscription payment, simple PCI validation, automatic receipts, visible store policies/support links, descriptive errors, and a secure customer portal for subscription/payment management. Source: [Stripe Checkout](https://stripe.com/payments/checkout). These are payment capabilities, not proof that Antique Trail is trusted or that a store will earn a return.

### Application to Antique Trail

- Show the exact monthly amount, what is and is not included, whether tax applies, when the first charge occurs, cancellation timing, the 48-hour refund rule, downgrade behavior, and photo-removal grace before the CTA.
- Say `Payment handled by Stripe` and explain the redirect. Do not claim `Stripe verified`, `bank-level`, or an Antique Trail PCI certification that has not been earned.
- Show a real, current product path: owner draft → verified listing → shopper Browse/details → added to a trip → navigation handoff. This demonstrates the value mechanism without claiming unmeasured traffic.
- Explain that the owner controls store facts, that controlled changes and photos are reviewed, that payment never purchases ranking or ratings, and that negative shopper reviews cannot be suppressed by a paying store.
- Publish a real operating identity, service area, support contact, privacy/terms links, billing contact path, and what happens if Antique Trail or Stripe is unavailable. Generic lock icons are not substitutes.
- Use testimonials only after actual, consented store experience. Identify the person/store, preserve the exact statement and consent, disclose any benefit or relationship, and do not imply a typical sales or traffic result without evidence. The current pilot is expressly non-endorsing, so it cannot be mined for launch testimonials without a new, voluntary consent.

## Recommended page, section by section

### 1. Hero: one promise, one audience, one action

**Working proposition:** `Help antique shoppers find your store — and make it part of the trip.`
Supporting sentence: state the geographic availability and the concrete listing contents (verified hours, location, store story, representative photos, and trip-planning visibility).
Primary CTA before public-signup approval: `Request an invitation` or `Join the store-owner waitlist`.
Primary CTA after approval: `Claim or add your store`.
Secondary link: `See plans and what happens next`.

Do not lead with `Featured` or `Unlimited`; those are internal tier names, not owner outcomes. Do not use `Get more customers`, `increase foot traffic`, or an ROI number until measured and substantiated.

### 2. Show what the shopper actually experiences

Use one annotated, truthful example across desktop and phone:

- store card in Browse;
- verified store details, hours, phone/site, and official photos;
- `Add to Trip`;
- planned stop/order and navigation handoff.

Label synthetic screenshots as demonstrations. Replace them with approved real-store examples only after the applicable consent/publication gate.

### 3. Explain the value mechanism

Use three short steps:

1. `Create or claim your verified store listing.`
2. `Keep the facts shoppers need current.`
3. `Shoppers can discover the store and add it to a feasible antique-shopping trip.`

This section should also state what Antique Trail is not: no marketplace commission, no sale processing, no paid review control, and no purchased ranking, if those facts remain approved.

### 4. Fit check before plan choice

State eligibility in plain language: physical antique/vintage store, public recurring hours, service geography, authority to represent the store, verified email/MFA, and any current invitation requirement. Provide paths for:

- `My store is already listed — claim it`;
- `My store is not listed — add it`;
- `I manage more than one location`;
- `I rent a booth / run an event / sell online only` (explain eligibility or collect interest; do not silently reject later).

### 5. Simple plan cards

Use three cards only if three meaningfully different owner jobs can be stated. Each card needs:

- `Best for ...` sentence based on a recognizable store situation;
- exact monthly price and tax qualifier;
- exact photo allowance, written consistently (`cover + N gallery photos` versus total photos);
- common core listing benefits shown once, not repeated as filler;
- the one or two real differences;
- billing start, cancellation, refund, and downgrade consequence;
- a plan-specific CTA whose accessible name includes the plan.

Do not label a tier `Most popular` until real selection data exists. A neutral `Good for stores that refresh inventory often` is acceptable if that is genuinely the intended fit.

### 6. Compact comparison and worked examples

Keep the cards scannable, then provide an accessible comparison for the few decision-driving rows. Include worked examples such as:

- `Free: one cover + five gallery images; no charge.`
- `Featured: one cover + fourteen gallery images` **only if 15 means total**; the current spec is ambiguous (`Featured | 15 photos`) relative to Free (`Cover + 5 gallery`). Resolve that before copy.
- what shoppers see immediately, what awaits review, what happens to excess photos on downgrade, and whether photos can be reordered.

Avoid a 30-row wall of identical checkmarks. Use proper table headers at desktop and a linear plan-by-plan presentation on small screens.

### 7. Trust block: specific controls, not badges

Explain:

- store authority and listing verification;
- who can edit which facts;
- photo review and the current two-business-day target (do not call it an SLA until approved as one);
- independent shopper reviews and the prohibition on paid suppression/ranking;
- Stripe-hosted payment and self-service billing;
- cancellation/refund/downgrade behavior;
- support channel and expected response policy, once approved;
- privacy boundaries, including no sale of shopper data and no store access to private trips/notes.

### 8. FAQ that removes real purchase risk

At minimum:

- Is the free listing permanent?
- Is Antique Trail a marketplace? Does it take a commission?
- How are stores verified?
- When does my listing become public?
- Does paying improve rank or ratings?
- What photos are accepted and who owns them?
- When am I charged? Is tax added?
- Can I change plans or cancel? What happens to extra photos?
- What does the 48-hour refund apply to?
- Can I manage multiple stores or add staff without sharing a password?
- What if my store is already listed, moves, closes, or changes ownership?
- Which regions are open now, and can I join a waitlist?
- How do I get help before buying?

### 9. Final action and expectations

Repeat the single primary CTA, followed by a short sequence preview. Before public signup, it should promise only contact/invitation review. After authorization, a selected plan can be preserved as a preference, but the flow must still follow eligibility, authority verification, draft, tier confirmation, Stripe, and Administrator approval. Do not imply that clicking or paying makes the listing instantly public.

## Helping store owners promote Antique Trail

This is a strategy recommendation, not an observed conversion fact. A store will promote the network when doing so helps its own shoppers and does not feel like unpaid work for an unknown platform.

Provide an optional, consent-based **Store launch kit** after the owner has seen and approved the published listing:

- printable `Plan your antique trail — include our store` counter card with canonical store QR;
- accessible social image and editable plain-language post linking to the store's canonical page;
- website badge/link that says `Plan a trip that includes [Store]` rather than implying endorsement;
- owner preview that verifies the QR destination and exact public content;
- simple instructions for replacing or withdrawing each asset;
- optional town/trail collateral only after enough verified stores support a useful trip.

Do not reward promotion with rank, ratings, verification, or shopper data. Do not condition an incentive on a positive review or testimonial. Track only approved aggregate campaign measures after the product's analytics/consent decision permits them; today the plan forbids inventing an analytics layer for this page.

## Hidden gaps and decisions required before design approval

### Blocking policy gaps

1. **Public signup conflicts with the approved invitation flow.** Decide whether the page is initially lead generation, invitation request, claim initiation, or a new public onboarding policy.
2. **Prices are not approved.** The binding spec leaves them unset; $15/$30 exists only in older research context.
3. **Monetization is not active.** Page construction can be planned, but paid CTAs cannot go live before the post-RG-01 decision and Package 13 activation receipt.

### Product-value gaps

4. **Paid differentiation is too thin to market honestly.** More photos are the only approved paid benefit. Google and the closest category directory offer meaningful listing/photo capability free.
5. **No owner ROI proof exists yet.** There is no approved store analytics surface and no evidence for traffic, calls, visits, or sales uplift. Do not substitute platform-wide shopper counts for an individual store outcome.
6. **The target customer is underspecified.** Single store, multi-location operator, antique mall, booth dealer, event-only seller, and online seller need explicit eligibility and different jobs.
7. **The photo units are ambiguous.** `Free: Cover + 5 gallery` versus `Featured: 15 photos` does not say whether Featured includes the cover or means 15 gallery photos.
8. **Unlimited needs a fair-use/support definition.** The spec says no cap but intake is still bounded; a sales page needs honest operational limits and moderation expectations.
9. **No contractual support or moderation SLA is approved.** The two-business-day photo target becomes contractual only through a new decision at paid activation.

### Journey gaps

10. **Claim versus add is not resolved on the page.** Owners need to know what happens when Antique Trail already has a public-facts listing.
11. **Plan selection timing needs reconciliation.** Marketing may invite a preference before signup, but the approved transaction flow selects after the draft and before publication.
12. **Payment-success expectations are risky.** The page must state that payment does not equal publication and explain review timing/failure/refund paths.
13. **Multiple representatives/locations need a safe model.** Do not force shared credentials; state owner/manager access rules and whether one subscription covers one physical store.
14. **Geographic availability needs a truthful state.** Show `Available in ...`, `Coming next`, or a waitlist; do not sell nationwide availability during controlled regional rollout.

### Trust and evidence gaps

15. **Testimonials are not yet available for marketing.** Pilot terms are non-endorsing; use product evidence and governance facts until separately consented testimonials exist.
16. **Claims need an evidence owner and freshness date.** Every store count, shopper count, coverage statement, response target, or outcome claim needs a source, scope, date, and removal/update rule.
17. **The operator story is missing.** An owner evaluating a new local service will need legal/operator identity, service area, support path, data policy, and why the service exists—not a generic origin story.
18. **Promotion consent is channel-specific.** A store accepting a counter card does not automatically consent to a testimonial, partner label, social post, email campaign, or logo use.

## Recommended decision sequence

1. Keep the current pricing/signup surface staged off.
2. Interview the permitted pilot owners after readiness using non-leading tasks: ask them to explain the offer, choose a plan, identify what they expect after payment, and say what outcome would justify paying. Do not ask `Would you pay $X?` as the only evidence.
3. Decide the paid value proposition and exact plan units. If additional owner outcomes require analytics, promotions, or other currently excluded capabilities, approve those separately rather than smuggling them into page copy.
4. Approve price, tax wording, trial/refund terms, availability, eligibility, support promise, moderation commitment, and public onboarding mode.
5. Add the **For Store Owners** page to the plan with prelaunch and activated states, then prototype and test it with actual store-owner tasks before connecting Stripe.
6. Treat launch as a measurement program: record page-to-intent, onboarding completion, plan selection, cancellation/refund reasons, owner support load, and owner-confirmed usefulness only after the required analytics/privacy decision. Never publish a success metric until its denominator and scope are defensible.

## Source-quality notes

- All external claims above link to first-party sources. Competitor success claims and testimonials remain the competitor's marketing, not independent evidence.
- AntiquesDirectory is a live-change caution: search indexes still exposed a prior $0/$5/$29 pricing snapshot, but on 2026-08-30 the live `/pricing` URL resolved to the owner page saying listings and owner controls are free. The live page is used here; the stale prices are not.
- No causal conversion lift is claimed for the observed page patterns. The actionable research evidence is limited to cited usability/accessibility guidance and regulatory requirements; the final Antique Trail page still requires task-based testing with its intended owners.
