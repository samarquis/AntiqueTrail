# Older-Adult Onboarding Evidence

Evidence gathered for wayfinder ticket #69 ("Research — older-adult onboarding
evidence (pacing, plain language, interruption)") on the Antique Trail map:
"Simple 70-year-old-friendly store onboarding spec". The spec will claim the
Store Partner onboarding journey (QR -> consent -> account/MFA -> store draft ->
approval wait -> activation -> first Portal login) can be completed alone by a
70-year-old non-computer person. This file collects high-trust primary sources
that back (or qualify) the design decisions the map's grilling tickets will make.

Status: uncommitted working research note. Source of record for this work is
issue #69 on the Antique Trail tracker.

## 1. One field per page (pacing)

### GOV.UK "One thing per page" — primary government guidance (strong)

- Source: GDS Design in Government blog, "One thing per page", Tim Paul, 3 July 2015
  https://designnotes.blog.gov.uk/2015/07/03/one-thing-per-page/
- GOV.UK Service Manual, "Structuring forms" (form-structure guide)
  https://www.gov.uk/service-manual/design/form-structure
- GOV.UK Design System, "Question pages" pattern
  https://design-system.service.gov.uk/patterns/question-pages/

Key claims (GDS, based on their own user research across public services):
- Start by splitting a form across multiple pages, each page containing just
  one thing: one piece of information, one decision, or one question.
- "Low-confidence users find them easier to use" — directly relevant to a
  non-computer 70-year-old.
- One thing per page helps users: understand what is being asked, focus on the
  question, find their way through an unfamiliar process, use the service on a
  mobile device, and "recover easily from form errors".
- It enables auto-saving answers as the user goes (resume/interruption support).
- GDS explicitly allows merging pages when user research shows it helps (e.g.
  internal expert users); the default starting point is one thing per page.
- Question pages must include a back link, page heading, and continue button;
  a progress indicator ("Question 3 of 5") may be added if research shows it helps.

Relevance: directly supports the "one field per screen" decision for the draft
portion and the "Step n of 5" convention already in DESIGN_SYSTEM.md.

### Nielsen Norman Group — cognitive load and form structure (strong)

- Source: NN/g, "Few Guesses, More Success: 4 Principles to Reduce Cognitive
  Load", 2025 https://www.nngroup.com/articles/4-principles-reduce-cognitive-load/

Key claims:
- Single-column layouts outperform multicolumn for form-completion rates.
- Grouping related fields into sections lets users focus on one category at a
  time; section headings preview the topic and reduce cognitive load.
- Progressive disclosure (show only what is needed at each step) reduces
  cognitive load; cites the GOV.UK "one thing per page" pattern.
- Order questions by priority/dependency/complexity/sensitivity; start simple,
  get sensitive material later.

### Secondary quantitative claims (weaker — vendor blogs, directional only)

- PlatoForms claims one-question-per-step "bumps completion rates up by 23%"
  https://www.platoforms.com/blog/form-design-science-completion-rates/
- Coolform (vendor, self-published): 12-question lead-gen form, 18% completion
  all-on-one-page vs 41% one-question-at-a-time
  https://www.coolform.co/blog/one-question-per-screen

These are marketing sources with no peer review; use only as directional
support, not as evidence in the spec's acceptance criteria.

## 2. Older adults: errors, error recovery, and form behavior

### Nielsen Norman Group — "Usability for Older Adults" (strong, primary research)

- Source: NN/g, "Usability for Older Adults: Challenges and Changes", Kate
  Moran / Lexie Kane, updated 2024
  https://www.nngroup.com/articles/usability-for-senior-citizens/
- Three rounds of user research, 123 participants aged 65+ (oldest 89); most
  recent round recruited participants "at least 70 years old" — matches the
  product's 70+ target.

Key findings:
- Older users "make more mistakes" than younger users; participants were
  thwarted by simple typos and "punished for entering hyphens or parentheses
  in telephone or credit-card numbers" — accept loose input formats.
- Older users often could not read error messages: wording obscure or
  imprecise, or placement overlooked. "When older users encounter error
  handling, simplicity is even more important than usual. Focus on the error,
  explain it clearly, and make it as easy as possible to fix."
- Small font sizes and small targets are substantial barriers; vision,
  hearing, and manual dexterity decline with age.
- Interfaces are "inflexible and unforgiving of errors"; participants were
  frustrated by finicky date/time selectors — "Why won't they just let me type
  the time?" (prefer forgiving inputs over restrictive pickers where possible).

### NN/g — usability testing with older adults (methodology, weaker on claims)

- https://www.nngroup.com/articles/usability-testing-older-adults/

### UCSF Ignite Lab — skill and usability barriers, 2026 (strong, recent)

- Source: "Identifying Skill and Usability Barriers to Digital Health Tool Use
  Among Older Adult Patients in US Safety-Net Clinics", mixed-methods study of
  64 patients, mean age 62, 2026
  https://ignitelab.ucsf.edu/recent-findings/2026/5/6/identifying-skill-and-usability-barriers-to-digital-health-tool-use-among-older-adult-patients-in-us-safety-net-clinics-mixed-methods-study

Findings:
- 74% could join a video visit, 71% log in, but only 52% could navigate to
  websites — foundational skills gaps are real.
- Common barriers: "challenges with password creation and error recovery",
  confusion around URLs and links, difficulty with text-messaging workflows.
- Directly supports designing the onboarding to be gentle around account
  creation, password creation, and recovery paths (Ticket 3).

### JMIR — usability problems of eHealth apps for older adults (strong)

- Source: JMIR Formative Research, "Conceptualizing Usability for the eHealth
  Context: Content Analysis of Usability Problems", 2021
  https://formative.jmir.org/2021/7/e18198/
- Multiple studies of apps with adults 55-70+; recurring problem categories
  include missing error prevention and feedback (e.g. "The system does not
  explain that the age of the user should be entered numerically").

### Systematic review — mobile app design for older adults 60+ (strong)

- Source: PMC, "Optimizing mobile app design for older adults", systematic
  review (1,556 records screened, 132 included, Jun 2014–Mar 2025)
  https://pmc.ncbi.nlm.nih.gov/articles/PMC12350549
- Essential design elements found across studies: simplified navigation,
  enlarged text and touch targets, voice interaction, and "error-tolerant
  interfaces".

## 3. Plain language and content

### GOV.UK — plain English is mandatory (strong, primary)

- Source: GOV.UK content and publishing guidance, "Use clear language"
  https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/
- GOV.UK Service Manual "Structuring forms" recommends a question protocol:
  only ask a question if you know why you need it, what you will do with it,
  and how you'll check it — then design how to ask it.

### Plain language programs (strong)

- PlainLanguage.gov (US federal, statutory requirement for agencies)
  https://www.plainlanguage.gov/guidelines/
- Digital.gov plain language guide (18F)
  https://digital.gov/guides/plain-language/
- WCAG 3.1 Readable guideline supports plain-language practice
  https://www.w3.org/WAI/WCAG21/quickref/#readable

Relevance: Draft field copy (Ticket 2) and consent/MFA guidance (Ticket 3)
should be written to plain-language standards; existing DESIGN_SYSTEM.md plain
labels rule already points this direction.

## 4. Target size and typography minimums

### WCAG 2.2 — Target Size (Minimum) 2.5.8, Level AA (normative)

- Source: W3C WAI, "Understanding Success Criterion 2.5.8: Target Size
  (Minimum)" https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- Targets for pointer inputs must be at least 24x24 CSS pixels (with spacing
  exceptions). WCAG 2.2 AA is the governing bar (PRD states WCAG 2.2 AA).
- Target Size (Enhanced) 2.5.5 (AAA) recommends 44x44 CSS px — the common
  mobile touch guidance (Apple: 44pt; Android: 48dp). EqualWeb/Deque note
  "44x44 is a safer touch target and meets 2.5.5 too".

Relevance: the product's Age-Inclusive baseline already sets 48px+ targets
(above both bars); the hours editor's interactive controls must honor these.

### NN/g — small text and small targets barrier (strong)

- See section 2: "Small Font Sizes and Small Targets" — small type caused
  problems even for teenage users; barriers for older ones.
- NN/g also notes abilities decline 0.8% per year between ages 25-60 and
  middle-aged users already need larger fonts
  https://www.nngroup.com/articles/middle-aged-web-users/

## 5. MFA, passwords, and authentication for older users

### HICSS 2021 — "Non-Inclusive Online Security: Older Adults' Experience with Two-Factor Authentication" (strong, peer-reviewed)

- Source: Das, Jelen, Kim; HICSS-54, 2021
  https://scholarspace.manoa.hawaii.edu/items/3fe2dd1f-e420-4873-83c6-0820daf81580
  (DOI 10.24251/HICSS.2021.779)
- Think-aloud study of older adults (>=60) registering and using 2FA hardware
  tokens: "non-inclusive design and inadequate risk communication resulted in
  minimal adoption by our older adult participants."

### USEC 2025 — "I'm 73, you can't expect me to have multiple passwords" (strong, peer-reviewed)

- Source: Symposium on Usable Security and Privacy (USEC) 2025, arXiv:2502.11650
  https://arxiv.org/html/2502.11650v1
- Irish older adults: managing multiple passwords is a significant frustration;
  participants needed "practical, step-by-step instructions"; verification
  codes were seen as more convenient than setting up MFA; strongly prefer
  concrete guidance over abstract security advice.

### Frontegg — cost of login frustration (secondary, vendor survey)

- 87% of Americans abandoned a sign-up/purchase over login difficulties; 62%
  have been locked out due to added MFA layers; among baby boomers 69%
  abandoned due to login difficulty
  https://frontegg.com/guides/cost-of-login-frustration (via smallbiztrends.com)

### Simple Interact — digital forms for elderly patients (secondary, vendor)

- https://simpleinteract.com/blog/digital-forms-for-elderly/
- Directional claims: reach users on devices they already use (email/browser
  link rather than forcing app download or passwords); avoid logins where
  possible; large buttons, clear fonts, checkboxes over typing; 90%+ completion
  reported in elder-heavy orthopedic clinics.

Relevance: Ticket 3 (gentle consent + MFA guidance) must not assume the owner
understands MFA or password managers; step-by-step instructions with plain
reassurance; the owner-controlled email+MFA requirement stays, but the spec
must design the guidance and recovery around these documented failure modes.

## 6. Interruption tolerance and resume

### GOV.UK "One thing per page" (strong)

- Auto-save as you go is a stated benefit of one-thing-per-page forms; GDS
  also references save-and-return patterns for long tasks:
  "many services on GOV.UK allow users to save and return, or to enter
  information in an order that's convenient for them" (blog comments, Tim Paul).

### WCAG 2.2.2 Pause/Stop/Hide and 2.2.4 Interruptions (normative, applicable)

- W3C WAI older-users guidance calls out distractions and interruptions:
  https://www.w3.org/WAI/older-users/developing/
- WCAG 2.2.2 (A) — mechanism to pause, stop, or hide moving/blinking content
- WCAG 2.2.4 (AAA) — interruptions can be postponed or suppressed

Relevance: Ticket 4 (interruption and resume design) is backed by GOV.UK's
save-and-return practice and the one-thing-per-page auto-save benefit; the
draft must persist per-field state so an interrupted owner resumes exactly
where they left off (the codebase already has resume handles in
src/features/partners/partnerClient.ts).

## 7. What the evidence does NOT support (cautions for the spec)

- No peer-reviewed study was found that quantifies one-field-per-screen
  completion uplift for 70+ users specifically; GOV.UK's recommendation is
  grounded in their own government-service user research and is the strongest
  available authority.
- The 23% / 18%-vs-41% figures are vendor marketing, not citable evidence.
- Passwordless/MFA-avoidance vendor claims (Blink/Trusona 2018) are marketing
  and conflict with the product's fixed owner-controlled email+MFA ADR; the
  ADR stands, but guidance design should follow the USEC/HICSS findings.

## Sources

1. GOV.UK Design in Government — One thing per page (2015)
   https://designnotes.blog.gov.uk/2015/07/03/one-thing-per-page/
2. GOV.UK Service Manual — Structuring forms
   https://www.gov.uk/service-manual/design/form-structure
3. GOV.UK Design System — Question pages pattern
   https://design-system.service.gov.uk/patterns/question-pages/
4. NN/g — Few Guesses, More Success: 4 Principles to Reduce Cognitive Load (2025)
   https://www.nngroup.com/articles/4-principles-reduce-cognitive-load/
5. NN/g — Usability for Older Adults: Challenges and Changes (2024)
   https://www.nngroup.com/articles/usability-for-senior-citizens/
6. NN/g — Usability Testing With Older Adults
   https://www.nngroup.com/articles/usability-testing-older-adults/
7. UCSF Ignite Lab — Skill and Usability Barriers to Digital Health Tool Use (2026)
   https://ignitelab.ucsf.edu/recent-findings/2026/5/6/identifying-skill-and-usability-barriers-to-digital-health-tool-use-among-older-adult-patients-in-us-safety-net-clinics-mixed-methods-study
8. JMIR Formative Research — Conceptualizing Usability for the eHealth Context (2021)
   https://formative.jmir.org/2021/7/e18198/
9. PMC — Optimizing mobile app design for older adults (systematic review)
   https://pmc.ncbi.nlm.nih.gov/articles/PMC12350549
10. W3C WAI — Older Users and Web Accessibility
    https://www.w3.org/WAI/older-users/
11. W3C WAI — Developing Websites for Older People (WCAG 2.0 applies)
    https://www.w3.org/WAI/older-users/developing/
12. W3C WAI — Understanding SC 2.5.8 Target Size (Minimum), WCAG 2.2
    https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
13. HICSS-54 (2021) — Non-Inclusive Online Security: Older Adults' Experience
    with Two-Factor Authentication
    https://scholarspace.manoa.hawaii.edu/items/3fe2dd1f-e420-4873-83c6-0820daf81580
14. USEC 2025 — "I'm 73, you can't expect me to have multiple passwords"
    https://arxiv.org/html/2502.11650v1
15. PlainLanguage.gov — https://www.plainlanguage.gov/guidelines/
16. Digital.gov — Plain Language guide https://digital.gov/guides/plain-language/
17. GOV.UK — Use clear language
    https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/
18. Frontegg (via smallbiztrends) — Cost of Login Frustration (2025)
    https://frontegg.com/guides/cost-of-login-frustration
19. Simple Interact — Improving Digital Forms for Elderly Patients (2025)
    https://simpleinteract.com/blog/digital-forms-for-elderly/
