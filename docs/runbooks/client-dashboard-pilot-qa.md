# Client Dashboard Pilot QA

Last updated: `2026-04-01`

## Purpose

Use this runbook to validate the client dashboard before a pilot deployment or after any auth, role, menu, store-settings, or live-order change.

## Required Inputs

- target dashboard URL
- target API URL
- one owner account
- one staff account
- one store with live orders enabled
- one store with time-based fulfillment or dashboard-disabled capabilities for negative-path validation
- access to gateway and identity logs

## Pass Criteria

The client dashboard passes when all of the following are true:

- email/password sign-in works for active dashboard accounts
- expired or invalid sessions return the user to sign-in cleanly
- owners and staff only see the sections their role and store capabilities allow
- manual order controls only appear when the store and role both allow them
- menu, team, and store mutations fail clearly when the user lacks access
- refresh and loading states do not leave the dashboard stuck or misleading

## Initial Blocking Findings Addressed

The April 1, 2026 QA scrub fixed these pilot-blocking issues:

- auth expiry handling now recognizes real `401` API failures instead of relying on message text matching
- order action buttons now respect `orders:write`, not just store fulfillment mode
- menu, store, and team mutations now re-check capabilities locally before sending requests
- stale or tampered section navigation is rejected locally instead of silently switching into an unavailable view

## Test Matrix

### 1. Owner Sign-In and Bootstrap

- sign in with a valid owner account
- verify the dashboard lands in an allowed section
- verify the store name and market label match the active store
- verify page refresh restores the session cleanly

### 2. Staff Sign-In and Role Boundaries

- sign in with a staff account
- verify owner-only sections or actions are absent or read-only
- verify team management is unavailable to staff
- verify store settings remain read-only for staff

### 3. Live Orders

- verify the orders board loads active orders
- verify order filters switch between active, all, and completed views
- verify a writable account can move an order through the next lifecycle step
- verify a read-only or capability-restricted account does not see manual controls
- verify canceled-order confirmation behaves correctly

### 4. Menu Controls

- for a platform-managed store, verify create/edit/delete works for a writable account
- verify visibility toggle works for an account with `menu:visibility`
- verify the dashboard becomes read-only when the store uses external menu sync

### 5. Store Settings

- verify owners can update store name, hours, and pickup instructions
- verify staff cannot submit store configuration changes

### 6. Team Management

- verify owners can create a user with name, email, role, and temporary password
- verify owners can update role, active status, and password reset
- verify duplicate team emails fail with a clear conflict instead of silently overwriting an existing account
- verify deactivation requires explicit confirmation
- verify staff cannot submit team changes

### 7. Session Failure Recovery

- invalidate or expire the session, then trigger a dashboard refresh
- verify the user is signed out and returned to the auth screen with a clear message
- verify a second sign-in works without clearing browser storage manually

## Failure States To Exercise

- invalid password
- expired access token during dashboard refresh
- expired access token during an order or menu mutation
- live order tracking disabled at the store capability level
- platform-managed menu disabled at the store capability level

## Logging Template

Record one row per QA run:

| Timestamp | Environment | Role | Store | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| `YYYY-MM-DD HH:MM` | `local/pilot/prod` | `owner/staff` | `locationId` | `pass/fail` | `details` |

## Blocking Findings

Do not approve a pilot deployment if any of these occur:

- expired sessions leave the user trapped inside a broken dashboard state
- staff can trigger owner-only mutations
- manual order controls appear when live tracking is disabled or the account lacks write access
- menu or team edits can be submitted despite store capability or role restrictions
- the dashboard loads a section that should be unavailable for the current role or store
