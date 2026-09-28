# Nomly coordination layer

`.nomly` is the Git-visible coordination and memory layer for independent Codex chats. It is deliberately Markdown-only: it coordinates work without becoming a second task-management application.

## Directory contract

- `agents/`: durable role charters.
- `tasks/inbox/`: proposed, unassigned, or not-yet-ready tasks.
- `tasks/active/`: assigned work in progress; exactly one primary owner.
- `tasks/review/`: implementation complete enough for required review and approval.
- `tasks/done/`: accepted/integrated or explicitly closed work.
- `handoffs/`: complete cross-chat transfer records.
- `decisions/`: lightweight proposals and coordination decisions pending or not requiring a permanent ADR.
- `security/`: unresolved finding registry and security coordination material.
- `status/`: one concise current-state file per permanent role.
- `templates/`: canonical task, handoff, decision, and chat-bootstrap formats.

Do not store secrets, tokens, customer data, private keys, production payloads, or sensitive incident evidence here.

## Source-of-truth order

When sources disagree, use this order:

1. Current implementation, schema/migrations, tests, and deployed configuration evidence available to the task.
2. Accepted current ADRs.
3. Active task decisions and explicit user approvals.
4. Current runbooks and project-state documentation.
5. Historical plans, roadmaps, audits, and chat recollection.

Record and route stale-document corrections; do not silently conform implementation to stale prose.

## Communication without shared chats

Repository state is the communication channel. An assignment, blocker, approval, decision, review result, changed scope, or implementation result is not shared until it is written to the relevant task/handoff/status/decision or committed documentation.

For every meaningful transition:

1. Update the task with facts, validation and next action.
2. Create a handoff when responsibility or required action crosses chats.
3. Update sender and receiver status pointers.
4. Record branch/worktree/base and diff state; add the exact SHA after Release creates a candidate commit.
5. Link a decision or ADR instead of paraphrasing it differently in multiple files.

## Task lifecycle

Tasks use `NOM-NNN` IDs. The user or Product normally allocates the next unused ID after searching all task and handoff directories. Security findings may retain `SEC-*` registry IDs until the user authorizes a corresponding `NOM-*` implementation task.

### Inbox

A task belongs in `inbox` when it is proposed, awaiting ownership, blocked on requirement clarity, or not approved to start. A proposed owner is not an active assignment.

Minimum exit criteria:

- objective and acceptance criteria are understandable;
- one primary owner accepts it;
- collaborators/reviewers are identified;
- dependencies and approval needs are known;
- dangerous ambiguity is resolved.

### Active

Move the same task file to `active` when implementation or substantive investigation starts. Set `status: active`, owner, worktree, branch, and base commit. Only the primary owner changes lifecycle state, unless the user or Release records an explicit reassignment.

The owner keeps implementation notes concise, records scope changes, and prevents undocumented expansion. Collaborators provide bounded outputs or handoffs; they do not independently redefine the task.

### Review

Move to `review` when implementation is complete enough to assess and owner validation is recorded. Include the base/diff scope and, once Release stages it, the exact candidate commit. Record required reviewers, known limitations, documentation impact, and release requirements. Security-critical or cross-domain final approval should normally review the Release-created candidate SHA.

Review outcomes are `approved`, `changes-requested`, or `blocked`, each with reviewer, date, evidence, and scope. Requested changes return the task to `active` if implementation resumes.

### Done

Move to `done` only when acceptance criteria are satisfied and one of these is recorded:

- exact commits were approved and integrated by Release;
- a documentation-only task was accepted and requires no release;
- the user explicitly closed/canceled the task, with reason.

`done` does not mean production-deployed. Record release state independently as `not-required`, `not-ready`, `pending-integration`, `integrated`, `deployed-development`, `approved-production`, `deployed-production`, or `rolled-back`.

Never create a second copy of a task when moving it. Git history is the lifecycle history.

## Handoff protocol

Use `templates/handoff.md` and name handoffs `YYYY-MM-DD-NOM-NNN-from-to-short-slug.md`.

A handoff supplements rather than replaces the task. It must let the receiver proceed from repository state alone. The sender provides exact paths, commits, validation, decisions, risks, unresolved questions, and a bounded requested action. The receiver records acceptance or rejection with reason and updates its status.

A chat-only statement is not a handoff. References such as “what we discussed,” “the previous chat,” or “continue from there” are invalid.

## Ownership overlap table

| Area | Primary | Required collaboration/review |
|---|---|---|
| API contracts and generated mobile SDK | Platform | Frontend, Mobile |
| Identity and token issuance | Platform | Frontend, Mobile, Security & QA |
| Web client-side session handling | Frontend | Security & QA review when changed |
| Mobile session handling | Mobile | Platform coordination; Security & QA review when changed |
| Reporting calculations and financial semantics | Platform | Product, Frontend; Security & QA when financial integrity changes |
| Reporting presentation | Frontend | Product; Platform for contract semantics |
| Stripe checkout lifecycle | Platform | Mobile, Security & QA |
| Clover/POS order routing | Platform | Product, Security & QA |
| Mobile app identity and application-side build config | Mobile | Platform, Release |
| Mobile release worker | Platform | Mobile, Release |
| Database migrations | Platform | Release sequencing; Security & QA when relevant |
| Vercel deployment | Release | Frontend |
| Heroku/runtime deployment | Release | Platform |
| EAS/store release execution | Release | Mobile; Platform for release-worker behavior |
| Web design-system implementation | Frontend | Product governance; Mobile when shared tokens change |
| Product terminology and Figma authority | Product | Frontend, Mobile |
| Shared backend observability | Platform | implementation owner instruments its change; Release verifies deployment |
| Application-specific observability | Implementing role | Platform for shared facilities; Release for deploy verification |
| CI/release policy | Release | Security & QA, affected implementation role |
| Threat model and independent security gate | Security & QA | affected owner; Architect for trust-boundary changes |
| ADRs and cross-domain arbitration | Architect | affected roles; user approval when constitution/invariants change |

If an area is absent, choose the role owning the resulting behavior and record the choice in the task. Do not create a new permanent agent without user approval.

## Cross-agent modification rule

An implementation owner encountering another role's files must choose one:

1. Request a bounded implementation handoff to that role.
2. Obtain written agreement in the task for a narrow compatibility edit and require that role's review.
3. Split the work into separately owned tasks linked by dependencies.

The owner may not silently bundle unrelated cleanup, opportunistic refactors, generated changes, migrations, or deployment edits. Shared contracts remain Platform-owned even when a consumer requests them.

## Risk-based approval model

### Routine/localized

Examples: copy, styling, isolated test correction, internal documentation with no policy change.

Required: clear task intent, owner validation, affected owner review if outside ownership, and recorded user approval for integration. The user's original instruction can satisfy scope/integration approval when it explicitly requests the change; record that fact.

### Product-significant

Examples: workflows, terminology, roles/capabilities, user-visible behavior, pricing presentation.

Required: Product acceptance criteria/review, implementation validation, user approval, Release integration.

### Architectural/cross-domain

Examples: public contracts, tenant model, service boundaries, lifecycle semantics, durable schema, migration sequencing.

Required: Architect review/decision, affected roles, implementation validation, Security & QA when applicable, user approval, Release integration.

### Security/financial/release-critical

Examples: auth, authorization, tenant isolation, secrets, Stripe, POS, refunds, financial reporting, public mutations, sensitive migrations, production infrastructure.

Required: Security & QA independent review, all applicable Product/Architect gates, owner validation, explicit user approval, Release integration. Unresolved high-severity findings block release unless the user explicitly accepts the documented risk; production still needs separate approval.

### Production

Release must obtain explicit user approval for the named production release/deployment after presenting exact commits, CI status, migration/rollback plan, known risks, and backup/readiness evidence. No inferred or standing approval is valid.

## Worktree and branch strategy

Before edits, run non-mutating checks for repository root, HEAD, branch, status, remotes, and relevant task files. Record the result in the task/status.

For meaningful concurrent implementation:

- have Release establish/record the base branch and worktree, or explicitly delegate that setup in the task;
- use a dedicated worktree and branch, preferably `nom/NOM-NNN-short-slug`;
- keep one primary task per branch unless Release approves a documented grouping;
- record worktree path, branch, base SHA, and current diff/candidate commit;
- do not edit the shared authoritative checkout or another role's worktree;
- do not discard, stash, reset, clean, rebase, amend, or force-push user/agent work without explicit authority;
- preserve unrelated dirty files exactly;
- implementation agents do not stage, commit, or push unless Release records a narrow delegation in the task;
- hand Release the exact worktree, base SHA, task-owned file list, validated diff, and generated-file expectations;
- Release stages only the approved task diff, creates the candidate commit, and records its immutable SHA;
- let required reviewers assess that candidate, then let Release verify ancestry, diff, tests, approvals and migration order before integration/push.

Small coordination-document updates may occur in the authoritative checkout only when they do not overlap protected user work and the task/approval permits it. Application implementation should not use that exception during concurrent work.

## Reviews and blocks

Security & QA, Architect, and Product blocks must be evidence-based and scoped. A blocker entry states:

- blocking role and date;
- affected acceptance criterion or invariant;
- concrete evidence;
- severity/impact;
- required resolution or explicit decision;
- who must act next.

The blocker stays in the task until the blocking role records clearance. Status files only point to it.

## Documentation and decisions

Use a task for work scope and execution facts. Use `decisions/` for a concise cross-agent choice that is proposed, temporary, local, or awaiting ratification. Use `docs/adr/` for a durable accepted decision that changes architecture, trust boundaries, service ownership, core lifecycle, data model strategy, or deployment topology.

The Architect decides whether an accepted `.nomly/decisions` record must become an ADR. The ADR links the source task and decision; the lightweight decision then links the ADR and is marked superseded/ratified. Avoid duplicated narratives.

## Current repository cautions

- The active product repository is `lattelink-platform`, not the outer `NOMLY` directory or the older `lattelink-security-audit` checkout.
- Current deployment is primarily a Heroku modular monolith even though legacy Compose/Terraform material remains.
- Existing documentation is unevenly current; inspect implementation.
- Protected uncommitted V3 dashboard work is recorded in Frontend and Release status.
- Unresolved security findings are recorded in `security/open-findings.md`; no finding is an accepted exception merely because it predates a task.
