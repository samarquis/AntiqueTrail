# Antique Trail

A PWA for antique shoppers to discover shops, plan day trips, and leave reviews.

## Getting started

```bash
npm ci
npm run dev
```

Open `http://localhost:5173`. Without a `.env.local` file, the app uses a deterministic 12-store fictional catalog.

### With Supabase (optional)

```bash
cp .env.example .env.local
# Set your Supabase keys in .env.local
npx supabase@2.115.0 start
npx supabase@2.115.0 db reset
```

### Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run typecheck` | Type checking |
| `npm run lint` | Lint |
| `npm run test` | Unit tests |
| `npm run test:e2e` | Browser tests |

## Documentation

| File | What it covers |
|---|---|
| [PRD.md](PRD.md) | Product requirements and features |
| [DESIGN.md](DESIGN.md) | Interaction rules, routes, roles |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | Colors, typography, components |
| [SECURITY_AND_TRUST.md](SECURITY_AND_TRUST.md) | Auth, privacy, data safety |
| [PACKAGE_CONTRACTS.md](PACKAGE_CONTRACTS.md) | Database schema and commands |
| [PROJECT_STATE.md](PROJECT_STATE.md) | What's built, what's not |

### Specs

| File | What it covers |
|---|---|
| [docs/specs/store-membership-spec.md](docs/specs/store-membership-spec.md) | Stripe integration and photo tiers |
| [docs/specs/owner-onboarding.md](docs/specs/owner-onboarding.md) | Store owner claim flow |

### Design assets

| File | What it covers |
|---|---|
| [docs/design/ICON_PLACEMENT_SPEC.md](docs/design/ICON_PLACEMENT_SPEC.md) | Icon usage rules |
| [docs/design/PALETTE_PROPOSAL.md](docs/design/PALETTE_PROPOSAL.md) | Color palette rationale |
