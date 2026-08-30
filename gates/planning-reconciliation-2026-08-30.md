# Gates: planning corpus reconciliation

Scope: Reconcile Antique Trail product, design, state, and execution-planning documents against current code, accepted decisions, critique evidence, and repository status.

- [x] G1: Every current root planning/product file is inventoried and assigned an explicit role.
      EVIDENCE: `PLANNING_INDEX.md` classifies all 22 previously tracked root Markdown files plus `PROJECT_STATE.md` and itself; the inventory script reported no omitted tracked root file.
- [x] G2: Implementation and backlog claims are checked against `origin/main`, live GitHub, and dated evidence.
      EVIDENCE: fresh fetch reported `HEAD...origin/main` = `0 0` at `6ac20e5`; live comparison covered all 15 open issues and found no closed issue in the open-backlog section; PR #158 remained open/draft with web and database checks passing.
- [x] G3: Accepted color, Stripe, login, typography, composition, and media-overlay decisions are represented in controlling documents.
      EVIDENCE: `PRODUCT_DECISIONS.md`, `PROJECT_STATE.md`, and `DESIGN_SYSTEM.md` contain the reaffirmed decisions and critique-derived contracts; focused Vitest verification passed 4 files / 39 auth and billing tests; typecheck passed.
- [x] G4: Stale authority/status claims are corrected without rewriting historical evidence.
      EVIDENCE: current authority files no longer contain the stale coding-hold, Packages 2-12, or Regional-Public Stripe-activation claims; historical plan/review/gate files retain their evidence under explicit snapshot banners.
- [x] G5: Links, formatting, source precedence, and changed-document consistency checks pass.
      EVIDENCE: Markdown/JSON reference scan resolved every changed-document reference; Prettier passed the new index/state/gate and manifest; `manifest.json` parsed; `git diff --check` passed.
- [x] G6: Final adversarial diff review finds no unsupported completion or release claim.
      EVIDENCE: final word-diff review preserved Product Owner/provider gates, marked public release NO-GO, kept Stripe staged off, separated synthetic from production evidence, and left the original dirty checkout untouched.
