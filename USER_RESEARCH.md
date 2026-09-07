# User Research and Product Discovery

## Origin of the concept

The product emerged from a real multi-store antique-shopping workflow.

The original users wanted to:

- Identify antique stores likely to match their tastes
- Plan a route using store proximity
- Account for stores closing at different times
- Navigate through multiple stops
- Continue to the next stop without rebuilding the plan
- Remember which stores were worth revisiting
- Record what types of items made stores appealing
- Use past store experiences to improve future recommendations

Google Maps and Waze did not fully manage the complete itinerary. Google Maps could display multiple stops but the mobile navigation workflow was awkward. Waze was useful for turn-by-turn navigation but did not own a complete shopping-day itinerary.

This revealed a key workflow:

> Candidate stores → hours-aware itinerary → one-leg navigation → arrival and visit tracking → route recalculation → preference learning

### Reported baseline context and controlled SLM-01 protocol

Reported historical context: Scott estimated about 45 minutes for his planning work after his wife spent at least one hour researching stores, copying names/addresses/hours, and sending them to him. Scott then transferred that material to AI for route planning and moved between the document and maps during the day. This is firsthand anecdotal context, not a controlled benchmark.

The current controlled comparison protocol is owned by [PRD / Startup Learning MVP](PRD.md#startup-learning-mvp-slm-01). The anecdotal context above is evidence, not the measured baseline or acceptance result.

## Observed preference dimensions

The initial discovery household strongly valued:

- Antique furniture
- Functional objects with a previous life
- Repurposable items
- Toolboxes
- Wooden boxes and crates
- Primitive cupboards
- Architectural elements
- Blue-and-white transferware
- Flow Blue
- Copper and brass
- Stoneware
- Old books
- Curated booths
- Decorating inspiration
- Authentic patina
- Inventory turnover
- Treasure-hunt experience

They tended to value stores where objects could become part of a home rather than items being valuable solely because they were rare.

They were less interested in:

- Mostly new décor
- Craft-heavy stores
- Clothing-heavy inventory
- Mass-produced gift merchandise
- Poorly curated flea-market inventory
- Formal expensive antiques with little practical decorating potential

## Generalized insight

These preferences must not become defaults for every user.

Instead, they demonstrate that antique shoppers have highly variable taste dimensions. The public product should let each user define what matters and should learn from that user's ratings, visits, saves, purchases, hides, and feedback.

## Key product insight

General star ratings answer:

> Did the public generally like this business?

A personalized match score should answer:

> Is this store likely to match what this specific user shops for?

Both are valuable and must remain distinct.

## Store discovery insight

Public review platforms are broad. Two stores can have identical ratings while offering completely different inventory and experiences.

Store attributes and user preference matching are therefore core differentiators.

## Trip-planning insight

Antique shopping differs from generic route planning because:

- Browsing time can range from 20 minutes to several hours
- Store hours vary
- Temporary markets may operate only on specific dates
- Priority stores should be visited before optional stores
- A delayed visit can invalidate the remaining route
- Backtracking is costly
- A large antique mall may deserve more time than several small shops combined

## Simplicity insight

Users should not complete a ten-category survey after every visit.

Default workflow:

- Quick rating
- Would return?
- Worth a special trip?
- Best categories
- Short notes
- Optional detailed evaluation

## Trust insight

Printed flyers at participating stores create a high bar.

Store owners must trust:

- The listing process
- Review moderation
- Dispute handling
- Business verification
- Data accuracy
- Product presentation
- Support availability

Users must trust:

- Privacy
- Location use
- Account security
- Review authenticity
- Photo handling
- Data deletion
- Transparent personalization
