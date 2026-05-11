# Residual risk

This project is hardened against the confirmed issues covered by the test suite, but it is not vulnerability-free.

## Verified in this package

- deterministic request IDs are added to JSON responses;
- production rejects missing, placeholder, short, or obviously weak JWT secrets;
- JWT verification pins algorithm, issuer, and audience;
- disabled or deleted users cannot continue using old access tokens;
- public registration rejects role injection and unknown fields;
- login rejects unknown fields and malformed emails;
- login uses the same generic failure response for unknown users, wrong passwords, and inactive/deleted accounts;
- unknown and inactive-account login paths perform bcrypt comparison against a fixed cost-matched dummy hash;
- auth logs hash emails with `LOG_HASH_PEPPER` and do not log raw emails or passwords in covered tests;
- project creation rejects frontend-owned IDs, owner injection, script-like names, ampersand/entity-style encodings, control characters, and extreme or overly precise durations;
- project creation allows bounded fractional-second durations such as `1.5`;
- non-admin project creation is capped by `MAX_PROJECTS_PER_USER`, defaulting to `100`;
- usernames reject markup and are limited to letters, numbers, dots, underscores, and hyphens;
- editor-state rejects unsafe project names, nested persisted XSS-like text, unsafe URL protocols, and unbounded project duration/resolution;
- snapshots reject unsafe project names, nested persisted XSS-like text, unsafe URL protocols, and extreme project duration/resolution;
- access tokens include `tokenVersion`;
- access tokens missing `tokenVersion` are rejected;
- `POST /api/v1/auth/logout`, `POST /api/v1/auth/logout-all`, password changes, user disable, and admin role/status mutations invalidate older access tokens;
- editor-state and snapshot writes reject unknown top-level fields;
- non-admin users cannot read or mutate other users' projects/snapshots/editor-state in covered tests;
- invalid JSON and oversized JSON bodies return clean JSON errors;
- `/api/test` is 404 by default, mounts only with `ENABLE_TEST_ROUTES=true` outside production, and is never mounted in production;
- chat/images routes remain intentionally unmounted.

## Remaining risk

- There is no refresh-token rotation or replay detection.
- There is no forgot-password or reset-password flow.
- Full structured audit logging with redaction is not implemented yet. Current auth logs redact/hash email identifiers, but this is not a complete audit event pipeline.
- CORS currently rejects disallowed origins with a custom `403` response. This is explicit, but it should be kept aligned with the external test manifest.
- DAST, SAST, and black-box API tests are not wired into this package yet.
- Frontend output encoding is still required. API validation reduces risk but does not replace context-aware escaping in UI templates, DOM sinks, emails, reports, or logs.

## Assurance statement

Do not describe this API as having "no vulnerabilities." A truthful statement is:

> The confirmed stored-XSS precursors in project creation, editor-state, snapshots, and usernames; loose login body parsing; login timing oracle; weak production JWT secret acceptance; stateless logout token replay; missing project quota; missing-tokenVersion acceptance; unknown top-level editor/snapshot fields; default test-route exposure; and raw auth-email logging risks have been remediated and covered by tests. The package builds, its automated tests pass, and the current npm dependency audit reports no known high-or-worse advisories. Frontend escaping, refresh-token, password-recovery, full audit-log, and deeper security-automation work remains.
