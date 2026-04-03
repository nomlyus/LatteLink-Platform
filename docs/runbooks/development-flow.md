# Development Flow

Last reviewed: `2026-04-02`

## Purpose

This document defines the exact development flow for all remaining V1 work in this repo.

The goal is to keep every change:

- ticketed
- traceable
- committed on `dev`
- pushed to `origin/dev`
- merged to `main` through section-based pull requests

## Branch Model

- `main`
  - release branch
  - only receives changes through pull requests from `dev`
  - squash-only merge target
  - no direct implementation commits
- `dev`
  - only active working branch for V1 delivery
  - all ticket work is committed here first
  - all ticket work is pushed to `origin/dev`
  - disposable working branch that is recreated or reset from `main` after each merged `dev` to `main` PR
- no feature branch should be created unless the user explicitly asks for it

## Ticket Rule

No repo change is allowed without a ticket.

That rule applies to:

- code
- docs
- workflows
- infra
- tests
- generated artifacts

If the needed work is not already covered by a ticket in [v1-implementation-tickets.md](../roadmaps/v1-implementation-tickets.md), add the ticket first before changing any other file.

The only allowed first edit without a prior ticket is adding the missing ticket itself.

## Section Rule

The default pull request boundary is one top-level ticket section from [v1-implementation-tickets.md](../roadmaps/v1-implementation-tickets.md).

The current sections are:

- `Backend Platform Tickets`
- `Customer Frontend Mobile Tickets`
- `Client Dashboard Tickets`
- `Admin Console Tickets`
- `LatteLink Web Tickets`
- `Additional Cross-Surface Tickets`

`V1 Critical Path` is planning context, not a delivery section.

Do not mix multiple sections into one PR unless the user explicitly approves that exception.

## Versioning Rule

Versioning is part of the delivery flow, not a separate afterthought.

Follow the repo versioning policy in [versioning.md](./versioning.md).

The required rule set is:

- decide the ticket's version impact before calling the ticket done
- if a ticket is docs-only, process-only, test-only, or otherwise non-release-impacting, record the ticket as `version impact: none`
- choose the actual version bump when a completed section is prepared for a `dev` to `main` PR
- the version only becomes official after the PR merges to `main` and is tagged
- before the first live release, all work still goes through `dev` to `main`
- after the first live release, the only exception is the post-launch `hotfix/*` flow documented in [versioning.md](./versioning.md)

## Bootstrap Flow

Start each cycle from current `main`.

```bash
git switch main
git pull --ff-only origin main
git switch -C dev main
git push -u origin dev
```

If `dev` already exists and already points at the intended working tip, do not recreate it unnecessarily.

## Per-Ticket Execution Flow

For each ticket:

1. Confirm the ticket exists in [v1-implementation-tickets.md](../roadmaps/v1-implementation-tickets.md).
2. Update the ticket status before implementation if the status is stale.
3. Decide the ticket's version impact using [versioning.md](./versioning.md): `none`, `patch`, `minor`, or `major`.
4. Make only the changes required for that ticket.
5. Update the ticket notes so the ticket reflects reality, including the chosen version impact when useful.
6. Run the verification relevant to that ticket.
7. Commit the ticket work on `dev`.
8. Push `dev` to `origin` immediately after the commit.

Do not batch unrelated tickets into one commit.

## Commit Rules

Every commit must include:

- a normal subject line
- a `Tickets:` section in the commit body
- a `Change log:` section in the commit body

Recommended commit template:

```text
<type>(<area>): <short summary>

Tickets:
- BE-V1-01
- BE-V1-02

Change log:
- describe the first concrete change
- describe the second concrete change
- describe any doc or workflow update included in the commit
```

`Verification:` may be added when useful, but `Tickets:` and `Change log:` are mandatory.

## Push Rules

After every ticket commit:

```bash
git push origin dev
```

Do not leave completed ticket commits only on the local `dev` branch.

## Pull Request Rules

After a section of tickets is complete on `dev`, open a pull request from `dev` to `main`.

Each PR must include:

- all relevant ticket IDs
- the section name
- the target version
- the bump type
- why the bump is justified
- the affected surfaces
- a concise summary of the shipped work
- verification performed
- risk and rollback notes when applicable

Use the GitHub template at [PULL_REQUEST_TEMPLATE.md](../../.github/PULL_REQUEST_TEMPLATE.md). Pull requests to `main` are validated by [validate-versioning-pr.yml](../../.github/workflows/validate-versioning-pr.yml).

Recommended PR body structure:

```text
## Section
- Backend Platform Tickets

## Tickets
- BE-V1-01
- BE-V1-02

## Version
- Target version: `0.2.0`
- Bump type: `minor`
- Why this bump: introduces one meaningful shipped capability for the current roadmap version
- Affected surfaces: `mobile`, `gateway`

## Change log
- summarize the completed ticket work
- summarize supporting workflow or doc changes

## Verification
- list the commands or checks that were run

## Risk and Rollback
- describe meaningful release risk and rollback path
```

Do not open a PR without listing every included ticket.

## Post-Launch Hotfix Exception

After the first live release, urgent production fixes may use a `hotfix/*` branch from `main`.

That exception is only valid when:

- the issue is urgent and production-facing
- shipping through `dev` would pull in unrelated unreleased work

When that happens:

1. branch `hotfix/*` from current `main`
2. make only the urgent fix
3. merge the hotfix to `main`
4. tag the released patch on `main`
5. merge updated `main` back into `dev` immediately

Do not leave a hotfix on `main` without bringing it back into `dev`.

## Post-Merge Reset

After a `dev` to `main` PR merges:

1. run the GitHub `release` workflow on `main` if this merged section is cutting an official version
2. update local `main` from `origin/main`
3. recreate or reset local `dev` from the updated `main`
4. refresh `origin/dev` so the remote `dev` branch matches the new local `dev`
5. start the next ticket section from that refreshed `dev`

Because `main` is squash-merge-only, the old `dev` commit history is not the same history that now exists on `main`.

Treat `dev` as disposable after each merged `dev` to `main` PR.

Recommended reset sequence:

```bash
git switch main
git pull --ff-only origin main
git branch -D dev
git switch -c dev main
git push --force-with-lease origin dev
```

If you prefer not to delete the local branch name first, an equivalent reset is acceptable as long as the result is the same: local `dev` and `origin/dev` must both point at the current merged `main` tip before new work begins.

The rule does not change:

- do not start the next section from a stale `dev`
- `dev` must be based on the current merged `main`
- `origin/dev` must be refreshed after the squash-merge reset

## Prohibited Flow

The following are not allowed unless the user explicitly approves an exception:

- direct implementation commits to `main`
- repo changes without a ticket
- commits without `Tickets:` and `Change log:`
- PRs without the included ticket IDs
- mixing unrelated ticket sections into one PR
- leaving completed ticket work unpushed on local `dev`
