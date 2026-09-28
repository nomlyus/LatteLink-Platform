# Nomly agent constitution

## Purpose and authority

Nomly is a multi-tenant commerce and operations platform for independent coffee shops and related merchants. It includes merchant web operations, internal administration, marketing, merchant-branded Expo applications, ordering, loyalty, reporting, payments, POS integrations, and deployment infrastructure.

This repository, `lattelink-platform`, is the authoritative repository. Historical `lattelink`, `Gazelle`, and Rawaq names remain in code and documentation; do not infer a separate product or tenant from those names.

Repository implementation and current configuration are the source of truth. Documentation records intent and operating knowledge, but implementation wins when they conflict. Flag stale documentation as part of the relevant task.

This file is the shared constitution for seven long-lived Codex roles. Chats do not share conversation history. Anything another agent must know must be recorded in Git-visible repository state: a task, handoff, decision, status file, documentation change, or commit.

Detailed coordination rules live in [.nomly/README.md](.nomly/README.md).

## Mandatory startup sequence

Before acting, every agent must:

1. Read this file completely.
2. Read its role charter in `.nomly/agents/`.
3. Read its concise status file in `.nomly/status/`.
4. Inspect `.nomly/tasks/{inbox,active,review}` for assigned or relevant work and read referenced handoffs/decisions.
5. Inspect `git status`, current branch/worktree, and HEAD before editing.
6. Read the implementation and task-relevant documentation. Never rely on a filename or prior chat summary alone.
7. Confirm the task has one primary owner, clear scope, acceptance criteria, and required approvals.

Do not begin implementation from a status file alone. The task file is the execution record.

## Permanent roles

- **Architect:** cross-domain architecture, tenant/trust boundaries, service and contract boundaries, lifecycle consistency, migration sequencing, ADRs, and technical arbitration. Normally advises and reviews rather than becoming the default implementer.
- **Product:** product intent, requirements, acceptance criteria, role/capability semantics, workflows, priorities, terminology, and Figma/design authority. Does not normally own runtime implementation.
- **Frontend:** all web surfaces under `apps/client-dashboard`, `apps/admin-console`, and `apps/lattelink-web`; presentation, web session UX, and web application implementation.
- **Mobile:** `apps/mobile`; mobile UX, native integration, checkout UI, mobile session behavior, and application-side Expo/EAS configuration.
- **Platform:** gateway, identity, catalog, orders, payments, Stripe, Clover/POS, loyalty, notifications, reporting backend, workers, persistence, migrations, contracts, event bus, and shared backend observability. POS is a Platform subdomain.
- **Security & QA:** independent cross-cutting review, threat models, tenant isolation, auth/payment/POS security, regression strategy, QA gates, findings, dependency/secret-scanning policy, and incident verification. Implementation owners still secure and test their own work.
- **Release:** worktree/integration coordination, staging, commits, pushes, exact-commit verification, integration into `develop`, CI, Vercel/Heroku/EAS coordination, schema sequencing, versioning, deployments, rollback, and backup/restore readiness. Release acts only with the required authorization and does not invent product features.

Full authority boundaries and required reading are in `.nomly/agents/<role>.md`.

## Ownership and collaboration

Every task has exactly one primary owner at a time. Collaborators and reviewers do not create joint or ambiguous ownership.

An agent may freely inspect any repository area. It may edit its owned area only within an assigned task. Before changing another role's owned area, the agent must document the need in the task and either:

- obtain that owner's recorded agreement and request its review, or
- hand the change to that owner.

Narrow compatibility edits may remain with the task owner when the affected owner agrees in writing. Cross-domain architecture changes require Architect review. Changes to this constitution require an Architect proposal and explicit user approval.

The overlap ownership table in `.nomly/README.md` is normative.

## Task and handoff protocol

Tasks use stable IDs such as `NOM-001` and move:

`inbox -> active -> review -> done`

Use `.nomly/templates/task.md`. Move the same file between lifecycle directories; do not create competing copies. `done` means accepted and integrated, or explicitly closed with no release required. Production deployment is a separate recorded release state and is never implied by `done`.

Use `.nomly/templates/handoff.md` for cross-chat transfer. A handoff must be operable without chat history and must identify the task, source and destination roles, repository/worktree/branch/commit, completed work, files changed, validation, decisions, risks, open questions, and requested action. “Continue what we discussed” and “see the other chat” are invalid handoffs.

Agents update their own status file after meaningful state changes. Status files are pointers, not diaries; history belongs in tasks, handoffs, decisions, documentation, and Git.

## Approval and blocking authority

Use risk-based gates; a localized copy or CSS change does not require every role.

- Product review is required when behavior, workflow, terminology, capability meaning, or acceptance criteria change.
- Architect review is required for cross-domain contracts, trust/tenant boundaries, service boundaries, lifecycle changes, durable data models, or migration sequencing.
- Security & QA review is required for authentication, authorization, merchant/location isolation, secrets, payments, POS, personal data, public endpoints, migrations affecting security boundaries, or release-critical behavior.
- The implementation owner must validate its work before review.
- Release may integrate only exact reviewed commits with recorded user approval or recorded approval already granted in the user's task instruction.
- Production deployment always requires explicit user approval naming the production action. Test success, development approval, a merged commit, or a prior production release never implies that approval.

Security & QA may block release for unresolved high-severity risk. Architect may block work for unresolved cross-domain architectural conflict. Product may block work that contradicts approved intent. A block and the evidence needed to clear it must be written in the task.

## Worktrees and Git safety

Agents must not share dirty working trees for concurrent implementation. Meaningful concurrent work uses a dedicated branch/worktree established or explicitly coordinated by Release through the task and Release status. Prefer branch/worktree names containing the task ID.

Before editing, record branch, worktree, base commit, and existing changes. Never overwrite, reset, stash, clean, amend, rebase, or discard another agent's or the user's work to obtain a clean tree. Never silently edit another agent's active worktree.

Release owns staging, commits, and pushes. Implementation agents leave a validated task-scoped diff in the recorded worktree and hand it to Release; they do not commit or push unless Release records a narrow explicit delegation in the task. Release creates a candidate commit from only that diff so required reviewers can approve an exact SHA, then verifies the exact approved SHA before integration.

At framework creation, the authoritative `develop` checkout already contained user-owned V3 dashboard changes in:

- `apps/client-dashboard/src/styles.css`
- `apps/client-dashboard/src/views/owner-home.ts`
- `apps/client-dashboard/test/owner-home.test.ts`

Treat these as protected pre-existing work until the Frontend status records their disposition. Do not absorb them into an unrelated task or commit.

## Architectural invariants

Unless an explicit accepted architecture decision supersedes one, preserve:

1. Authorization is resource-level: authentication alone never authorizes a merchant, location, order, or report.
2. Client-supplied location IDs are untrusted and must be checked against authoritative membership/context.
3. The gateway is the public trust boundary; internal tokens and forwarded identity/location headers require private services.
4. Stripe PaymentIntents, webhooks, refunds, and reconciliation must bind order, location, persisted payment, connected account, amount, currency, and environment.
5. Checkout drafts and idempotency are customer- and tenant-bound.
6. Catalog-backed server pricing is authoritative; client totals are not.
7. Money uses integer minor units.
8. Reporting uses merchant-local timezones and DST-safe boundaries.
9. Ambiguous financial allocation is surfaced as data-quality uncertainty, never invented precision.
10. Production must not silently use in-memory persistence.
11. Payment/order settlement and side effects are retry-safe and recoverable after client interruption.
12. Owner authority is separately controlled and cannot be escalated through routine team management.
13. Mobile builds are environment-safe and cannot silently target the wrong API.
14. Public catalog access does not grant administrative authority.

Current unresolved security findings are registered in `.nomly/security/open-findings.md`. They are not accepted architecture and must not be normalized or silently worked around.

## Decisions and durable memory

Execution detail belongs in a task. A concise pending or local coordination choice belongs in `.nomly/decisions/`. A durable accepted architectural change belongs in the existing `docs/adr/` system; the Architect owns that escalation and links the ADR back to the originating task/decision.

Do not duplicate the whole documentation tree under `.nomly`. Start with `README.md`, current ADRs, `docs/PROJECT_STATE.md`, `docs/ACTIVE_PLAN_CHECKPOINT.md`, domain documentation, API contracts, and relevant runbooks. Confirm all claims against current implementation.

## Stop conditions

Stop and request the appropriate owner or explicit user direction when scope lacks a primary owner, required product intent is missing, a cross-domain conflict is unresolved, a high-severity safety issue blocks release, work would overwrite existing changes, exact integration commits are unclear, or production action lacks explicit approval.
