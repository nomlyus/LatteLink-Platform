# Operator dashboard session policy (1.2.0)

This documents the current browser session behavior for the owner, manager, and store operator dashboard. It records the Product choices confirmed on September 23, 2026 and the implementation boundaries that still need independent Security & QA review. It does not change customer mobile sessions or internal Nomly admin sessions.

## Approved 1.2.0 behavior

- Sign-in remains remembered across browser restarts. The dashboard stores the operator session in browser `localStorage`; closing the tab or browser does not sign the operator out.
- The access token lasts 30 minutes. Refresh rotates the access and refresh tokens. The operator session has a 30-day absolute maximum from the original sign-in; refreshing does not reset that maximum. These values are enforced by the identity service and can be configured for operator absolute lifetime.
- There is no separate 1.2.0 idle timer based on human input. Dashboard polling/refresh may keep an otherwise idle open tab current until the 30-day absolute limit.
- An expired or revoked session returns the operator to sign-in with a recoverable message. The browser clears its local session before requesting server-side logout; if the API is unavailable, server revocation may not complete immediately.
- A safe token refresh updates the session without changing the current dashboard section or selected location. The section is also saved for page reload; a fresh sign-in/reload resolves locations from the operator’s authorized locations.
- Product explicitly defers password re-checks for sensitive owner actions from 1.2.0. This is not authorization to bypass normal role/capability checks.

## Shared-device operating rule

Because the approved session survives browser restarts, staff using a shared café device must use their own operator accounts and explicitly sign out at the end of their shift. Do not leave an owner account signed in on a shared device. Browser close alone is not logout. Account deactivation and a successful explicit logout revoke server sessions; recovery from expiry requires signing in again.

## Security boundary

The browser stores the access and refresh tokens in `localStorage`, which is readable by JavaScript running on the same origin. This supports the approved cross-restart persistence, but does not protect a session from same-origin script compromise. Do not describe these browser tokens as encrypted or HttpOnly. A future browser-session redesign may evaluate an HttpOnly-cookie/BFF model; it is not part of 1.2.0.

The dashboard sends access tokens in the Authorization header and refresh/logout tokens in POST request bodies, not in URL query parameters. In the repository implementation, Fastify request serializers log method, sanitized URL, request ID, and user agent, while request-completion records omit headers and bodies. Sentry scrubs sensitive-named fields and sanitizes URLs. These are source-level controls only; they do not establish every deployed proxy, host, browser-extension, or Sentry retention/access control.

The database-at-rest protection of persisted session tokens is separate from this browser policy and is tracked by [#498](https://github.com/nomlyus/LatteLink-Platform/issues/498). Until its approved dev cutover is complete, do not treat this policy as clearance of SEC-006.

## Verification evidence

Relevant automated coverage lives in:

- `services/identity/test/operator-auth.test.ts` — refresh rotation, logout invalidation, absolute-expiry rejection, and recovery after access-token expiry.
- `services/identity/test/session-token-rotation.test.ts` — bounded token size, rotation uniqueness, and concurrent rotation behavior.
- `apps/client-dashboard/test/lifecycle.test.ts` and `apps/client-dashboard/test/storage.test.ts` — client session recovery and browser storage behavior.
- `packages/observability/test/observability.test.ts` — URL sanitization and sensitive telemetry scrubbing.

The exact chosen model still requires independent Security & QA review, including whether the persistent localStorage exposure and shared-device operating rule are acceptable for 1.2.0. Keep #418 open until that review is recorded.
