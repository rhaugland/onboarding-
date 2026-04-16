# Project Objectives

## Raw Client Ask
> "Onboarder automates the recurring work of generating auth + onboarding flows for Next.js projects. Drop in a project, compare 2-3 AI-generated options, pick one, it integrates into the codebase.
>
> **Amendment 2026-04-16:** Building this internally — no external client. Ryan is the product owner. Add the ability to invite a teammate to collaborate on flow selection."

## Distilled Objectives
1. Analyze an uploaded/local Next.js project for existing context (routes, auth, styling).
2. Generate 2-3 structurally different onboarding + auth flow options from that analysis.
3. Render interactive previews (storyboard + full) so the user can compare options side-by-side.
4. Pick one option and integrate it directly into the codebase.
5. **(new)** Invite a teammate to view and collaborate on the flow-selection step.

## Client Expectations
- Internal tool for Ryan and invited teammates — not external-client-facing.
- Drop-in → compare → pick → integrated codebase. Minimal steps. *(inferred)*
- Each "run" produces a result ready to hand off without further polish. *(inferred)*
- Fast iteration — the tool is used repeatedly across different projects. *(inferred)*
- Collaboration is lightweight — invite a teammate to the same flow-selection session, not a full multi-tenant SaaS. *(inferred from "invite a teammate" language, pending Ryan's confirmation)*

## Quality Tier
**Tier:** Functional *(default, pending Ryan's confirmation)*
**Reference:** —

## Changelog
| Date | Change | Source |
|------|--------|--------|
| 2026-04-16 | Objectives file created from inferred raw ask. | stay-on-target skill, Ryan prompt |
| 2026-04-16 | Ryan clarified: built internally, no external client. Added objective #5 (teammate invite). | Ryan message "I am building this internally, no client this time around" |
