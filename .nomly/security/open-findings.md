# Open security findings

These findings were verified as visible in the active repository during the 2026-09-11 baseline inspection. They are unresolved coordination inputs, not accepted architecture, risk acceptance, or authorization to remediate. Security & QA must re-verify current code and deployed context when a dedicated task is created.

Do not place exploit secrets, production tokens, or customer data in this register.

## SEC-001 — Passkey registration identity binding

- **State:** open; requires dedicated Platform implementation task and Security & QA verification.
- **Observed boundary:** public passkey registration accepts a target user ID and can bind a credential/issue a session without an existing authenticated target-user session or equivalent account proof; strong user verification is not required.
- **Primary owner for remediation:** Platform.
- **Required collaborators:** Security & QA; Mobile/Frontend if enrollment UI changes; Architect if identity lifecycle changes.
- **Release implication:** block exposure/release of affected passkey enrollment until independently reviewed.

## SEC-002 — Clover credential and location isolation

- **State:** open; requires dedicated Platform task and deployed-context confirmation.
- **Observed boundary:** Clover OAuth is public and credential resolution can fall back from location-specific credentials to a global/latest credential, which is not tenant-safe.
- **Current limiting fact:** the standard paid-order lifecycle does not currently invoke automatic Clover submission; this does not make the storage/lookup behavior acceptable.
- **Primary owner for remediation:** Platform.
- **Required collaborators:** Product, Security & QA, Architect if association model changes.

## SEC-003 — Stripe Connect webhook account binding

- **State:** open; requires dedicated Platform task and Stripe endpoint configuration evidence.
- **Observed boundary:** webhook signatures are verified, but settlement does not fully bind event account/livemode and PaymentIntent to the persisted connected account, location, and payment record as strongly as finalize/reconciler paths do.
- **Primary owner for remediation:** Platform.
- **Required collaborators:** Security & QA, Architect for lifecycle implications, Release for deployed webhook/config verification.

## SEC-004 — Rate-limit key accepts pre-auth user header

- **State:** open; requires dedicated Platform task.
- **Observed boundary:** a raw caller-controlled `x-user-id` can participate in rate-limit key selection before authenticated identity decoration on affected routes.
- **Primary owner for remediation:** Platform.
- **Required collaborator:** Security & QA.

## SEC-005 — Invite-token disclosure boundary

- **State:** open; requires scoping and verification.
- **Observed boundary:** console email delivery may log a complete invite URL, while invite tokens are path material not necessarily removed by query sanitization.
- **Primary owner for remediation:** Platform for invite/delivery behavior; Frontend if URL structure changes.
- **Required collaborators:** Security & QA, Release for logging configuration evidence.

## SEC-006 — Sensitive application values lack field-level encryption

- **State:** open design/risk assessment; external infrastructure protections are unknown.
- **Observed boundary:** session/Apple/Clover credential material is persisted without visible application-level field encryption.
- **Primary owner for assessment/remediation:** Platform.
- **Required collaborators:** Security & QA, Architect, Release for key management and rollout.

## SEC-007 — Legacy order idempotency customer binding

- **State:** open; verify reachability and reproduction before remediation.
- **Observed boundary:** the legacy order-create idempotency model appears quote/hash-oriented rather than explicitly customer-bound; the newer checkout-draft path is customer-bound.
- **Primary owner for remediation:** Platform.
- **Required collaborators:** Security & QA, Architect if retiring the legacy lifecycle.

## Additional review-sensitive design boundaries

These are not asserted vulnerabilities on their own, but changes require security review:

- operator access/refresh sessions stored in browser `localStorage`;
- signed but unencrypted internal-admin session-cookie payload;
- locally validated customer JWT revocation window until access-token expiry;
- shared database and internal-service credentials;
- mutable CI/tool references in parts of the supply chain;
- unauthenticated merchant-launch intake and other public mutation routes.
