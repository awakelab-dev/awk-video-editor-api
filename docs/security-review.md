# Security review

## Scope

This review covers the current Node.js + TypeScript + Express + MongoDB API source in this package.

## Findings

### Confirmed: stored-XSS precursor in project name

- Severity: moderate
- Confidence: confirmed
- Evidence: the previous second-pass build accepted `<script>alert(1)</script>` as a project name with `201`.
- Exploitability notes: the API response is JSON and does not execute the payload itself. The risk becomes exploitable when a frontend, admin tool, report, email template, or log viewer renders the stored name as HTML rather than text.
- Impact: browser-side script execution in a consuming UI, possible account actions in the victim's session, data theft from the UI context, or admin-panel compromise depending on rendering context.
- Remediation: project creation now rejects markup-like characters, encoded tag delimiters, script-like URL protocols, inline handler assignments, and control characters in names. Regression tests cover this.

### Confirmed: stored-XSS precursors in editor-state, snapshot, and username write paths

- Severity: high when rendered by a frontend as HTML; otherwise moderate as unsafe persisted content.
- Confidence: confirmed
- Evidence: authorized assessment PoCs showed `PATCH /api/v1/projects/:projectId/editor-state`, `PUT /api/v1/projects/:projectId/snapshot`, and `PATCH /api/v1/users/:userId` accepted `<svg/onload=alert(1)>` and `javascript:` values before this fix.
- Exploitability notes: authenticated editors could store unsafe strings in `project.projectName`, asset labels/titles, URL-like fields, track element text/captions, snapshot playback custom fields, or username. The API response is JSON, but any unsafe frontend sink can turn those persisted values into stored XSS.
- Impact: persistent UI compromise, admin-panel XSS, action forgery in the victim's browser context, or token exposure if the frontend stores tokens in JavaScript-readable storage.
- Remediation: shared persisted text and URL validators now protect usernames, project names, editor-state nested persisted strings, and snapshot nested persisted strings. Snapshot and editor-state project duration/resolution now use bounded numeric checks; `1.5` seconds is allowed while extreme values are rejected. Regression tests cover the submitted PoCs.

### Confirmed: login accepted hostile extra fields

- Severity: moderate
- Confidence: confirmed
- Evidence: the previous second-pass build accepted valid credentials plus an extra `injected` field with `200`.
- Exploitability notes: this was not an observed auth bypass, but accepting malformed request shapes weakens the API boundary and can hide injection probes inside otherwise valid requests.
- Impact: poorer auditability, higher fuzzing surface, and possible future handler confusion if request bodies are extended.
- Remediation: login now rejects all fields except `email` and `password`; malformed emails are rejected. Regression tests cover this.

### Confirmed: login timing oracle on unknown or inactive accounts

- Severity: moderate
- Confidence: confirmed
- Evidence: the audited login path returned before `bcrypt.compare` for unknown or inactive users, while known users with a wrong password performed a bcrypt comparison.
- Exploitability notes: repeated login probes could use an obvious timing difference to infer whether an email belongs to an active account.
- Impact: user enumeration and easier credential-stuffing targeting.
- Remediation: login now always performs `bcrypt.compare` after payload validation, using the real user hash for active users and a fixed cost-matched dummy bcrypt hash for unknown, disabled, deleted, or otherwise inactive accounts. The failure response remains the same `401 Invalid credentials` shape for all credential/account-state failures. Regression tests cover response consistency and spy on the unknown-user path to prove the dummy hash is used.

### Confirmed: production JWT secret did not enforce length or obvious weakness

- Severity: high
- Confidence: confirmed
- Evidence: production env validation previously rejected missing and known placeholder values but did not enforce a minimum secret length or repeated-character weakness.
- Exploitability notes: weak HMAC secrets can be brute-forced offline if an attacker obtains a token sample.
- Impact: forged JWT access tokens if the secret is guessed or cracked.
- Remediation: production now rejects JWT secrets shorter than 32 characters, known placeholders, repeated-character strings, and placeholder-like words. Regression tests cover missing, placeholder, short, repeated, and valid production secrets.

### Confirmed: `/logout` did not invalidate the current access token

- Severity: moderate
- Confidence: confirmed
- Evidence: authorized assessment showed a token remained valid after `POST /api/v1/auth/logout`.
- Exploitability notes: a stolen bearer token could continue working until expiry after the user logged out.
- Impact: logout did not reduce replay window for already issued access tokens.
- Remediation: `POST /api/v1/auth/logout` now increments `tokenVersion`, so the presented user's existing access tokens are rejected on their next request. Refresh-token rotation and per-session revocation remain future work.

### Confirmed: no per-user project quota

- Severity: moderate
- Confidence: confirmed
- Evidence: authorized assessment created 105 projects as one editor without hitting a cap.
- Exploitability notes: this is an abuse and cost-control issue rather than an authorization bypass.
- Impact: authenticated users could create unbounded project records until storage, database, or operational limits are reached.
- Remediation: non-admin project creation is now capped by `MAX_PROJECTS_PER_USER`, defaulting to `100`; admins bypass the quota. Regression tests cover quota enforcement.

### Confirmed: signed tokens without tokenVersion were accepted

- Severity: low
- Confidence: confirmed
- Evidence: authorized PoC signed `{ sub: "usr_admin" }` without `tokenVersion` and received `200` from `GET /api/v1/auth/me`.
- Exploitability notes: an attacker still needed the signing secret or a valid legacy token, but accepting missing `tokenVersion` weakened revocation semantics for users at version `0`.
- Impact: migration/backward-compatibility bypass of the tokenVersion revocation model.
- Remediation: `authenticateRequest` now requires `tokenVersion` to be a non-negative safe integer and compares it to the stored user version. Regression tests cover missing `tokenVersion`.

### Confirmed: editor-state and snapshot accepted unknown top-level fields

- Severity: low
- Confidence: confirmed
- Evidence: authorized PoC sent `ownerUserId` in `PATCH /api/v1/projects/:projectId/editor-state`; it was ignored and the request succeeded.
- Exploitability notes: current code did not persist that field into authorization-critical records, but accepting unknown fields makes future mass-assignment regressions easier.
- Impact: weaker request boundary and higher risk if future handlers spread `req.body`.
- Remediation: editor-state and snapshot writes now reject unknown top-level fields using allowlists. Regression tests cover `ownerUserId`.

### Confirmed: auth logs contained raw email addresses

- Severity: low
- Confidence: confirmed
- Evidence: failed-login and registration logs printed raw emails such as `attacker+probe@example.com`.
- Exploitability notes: this did not expose passwords or tokens, but raw emails are PII and attackers can inject arbitrary addresses into failed-login logs.
- Impact: unnecessary PII in terminal output, CI logs, log aggregators, and incident bundles.
- Remediation: auth logs now emit `emailHash` instead of raw email. The hash uses `HMAC-SHA256` with `LOG_HASH_PEPPER`; the user database still stores real normalized emails for account lookup and support. Regression tests assert raw emails and passwords are not logged.

### Confirmed: `/api/test` was mounted by default outside production

- Severity: low
- Confidence: confirmed
- Evidence: `src/app.ts` mounted the test router whenever `NODE_ENV` was not `production`.
- Exploitability notes: the current test route was low impact, but default debug/test surfaces tend to grow over time and should not be present in deployable runtimes unless explicitly enabled.
- Impact: accidental route exposure in development, staging, or test-like deployments.
- Remediation: `/api/test` now mounts only when `ENABLE_TEST_ROUTES=true` and `NODE_ENV` is not `production`. Production always returns `404` even if the flag is set. Regression tests cover default-off, explicit opt-in, and production-deny behavior.

## Not evidenced

- Remote code execution: not evidenced.
- SQL injection: not applicable to MongoDB and not evidenced.
- Authentication bypass via malformed JWT: not evidenced; tests cover wrong secret, `alg=none`, wrong issuer, wrong audience, expired token, bad subject, disabled user, and deleted user.
- Cross-owner project/snapshot access for editors: not evidenced; tests cover owner enforcement.

## Residual recommendation

This package materially reduces boundary abuse and access-token replay risk, but it is not a complete auth lifecycle implementation. The next highest-value work is refresh-token rotation, refresh-token replay detection, forgot/reset password, and structured audit logging with redaction.
