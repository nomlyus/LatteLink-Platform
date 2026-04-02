# Versioning

Last reviewed: `2026-04-02`

## Purpose

This document defines the exact versioning flow for this repo from `V1` through `V5`.

The goal is to keep versioning:

- simple
- traceable
- tied to shipped work
- aligned with the roadmap milestones

## Core Policy

- use semantic versioning: `MAJOR.MINOR.PATCH`
- use one repo-wide version for the whole product
- use `v` prefixes for official release tags, for example `v1.2.0`
- use bare semantic versions in files and app configuration, for example `1.2.0`

## What Each Bump Means

### Major

Use a `major` bump when a full roadmap milestone version is complete.

Examples:

- `v1.0.0` when all `V1` roadmap milestones are complete
- `v2.0.0` when all `V2` roadmap milestones are complete
- `v3.0.0` when all `V3` roadmap milestones are complete

`major` versions in this repo are milestone-based, not general-purpose breaking-change markers.

## Minor

Use a `minor` bump for a meaningful shipped capability.

Examples:

- a meaningful new customer flow
- a meaningful new dashboard or admin capability
- a meaningful new backend capability that changes what the product can do

## Patch

Use a `patch` bump for fixes and non-capability improvements.

Examples:

- bug fixes
- polish
- security hardening
- workflow or CI fixes
- refactors that do not add a new meaningful capability

## None

Use `version impact: none` for work that does not materially affect the shipped product.

Examples:

- docs-only work
- process-only work
- test-only work
- internal cleanup

## Release Line Before V1

Until all `V1` roadmap milestones are complete, stay on the `0.x.y` line.

That means:

- `0.x.y` is the pre-`V1` release line
- `1.0.0` is cut only when the full `V1` milestone is complete

## Source Of Truth

The official released version is the Git tag on `main`.

That means:

- the `dev` to `main` PR declares the intended target version
- the version becomes official only after the PR merges to `main`
- the merged `main` commit is then tagged as `vX.Y.Z`

Package versions or local notes may mirror the release, but they are not the official source of truth for shipped versions.

## Ticket Rule

Each ticket must have an explicit version impact decision:

- `major`
- `minor`
- `patch`
- `none`

That decision should be made before the ticket is considered done.

The ticket does not cut the version by itself. It only contributes to the later section-level release decision.

## When The Actual Version Is Chosen

The actual version bump is chosen at the section `dev` to `main` PR level.

That means:

- tickets record version impact individually
- the completed section PR chooses the final target version
- the PR explains why that target version is correct

Do not cut a new official version for every ticket.

## Pull Request Rule

Every `dev` to `main` PR must include:

- `Target version`
- `Bump type`
- `Why this bump`
- `Affected surfaces`
- `Included ticket IDs`

The target version should be the version that will be tagged on `main` if the PR merges.

## Post-Merge Tagging

After the PR merges to `main`:

1. sync local `main` with `origin/main`
2. confirm the merged state is the release state you want to identify
3. create an annotated tag in the form `vX.Y.Z`
4. push the tag

The tag is the official release identifier.

## No Prerelease Semver Labels

Do not use prerelease semantic versions for now.

Examples that are out of scope for this flow:

- `v1.0.0-beta.1`
- `v1.0.0-rc.1`

Use branches, PRs, and existing build channels such as `internal` or `beta` instead.

## Mobile Version Alignment

When a release includes the mobile app:

- the mobile app version must match the repo version exactly
- mobile build numbers remain separate and may increment independently

Example:

- repo release: `v1.2.0`
- mobile app version: `1.2.0`
- build number: increments separately for TestFlight or App Store delivery

## Post-Launch Hotfix Flow

Before the first live release, all work still goes through `dev` to `main`.

After the first live release, urgent production fixes may use a `hotfix/*` branch from `main`.

Use that exception only when:

- the issue is urgent
- the issue affects the live product
- using `dev` first would pull in unrelated unreleased work

Hotfix flow:

1. branch `hotfix/*` from current `main`
2. make only the urgent fix
3. merge the hotfix to `main`
4. tag the patch release on `main`
5. merge updated `main` back into `dev` immediately

Do not leave a hotfix only on `main`.
