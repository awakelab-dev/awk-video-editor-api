# Third-pass security hardening notes

## Confirmed issue fixed

The second-pass API accepted project names such as:

```json
{ "name": "<script>alert(1)</script>" }
```

That is a stored-XSS precursor. The JSON API response does not execute the script by itself, but the value becomes dangerous if any frontend, admin tool, email template, report, or log viewer later renders the project name as HTML instead of plain text.

Examples of unsafe client behavior:

```js
title.innerHTML = project.name
```

```html
<div data-name="{{ project.name }}">
```

The safe client behavior is contextual output encoding, such as assigning text:

```js
title.textContent = project.name
```

The API now rejects project names with markup-like characters or obvious script execution patterns. The frontend must still render all user-controlled values safely.

## Third-pass changes

- `POST /api/v1/auth/login` now rejects unknown fields instead of tolerating hostile extras.
- Project creation now rejects markup-like project names, encoded tag delimiters, script-like URL protocols, and inline handler assignments such as `onerror=`.
- Project creation now rejects ampersand/entity-style project names such as `&lt;script&gt;` and ambiguous entity-looking strings.
- Project creation now allows bounded fractional-second durations such as `1.5`, while rejecting extreme, negative, or overly precise duration values.
- Username updates now reject markup and are restricted to letters, numbers, dots, underscores, and hyphens.
- Editor-state updates now reject unsafe project names, nested persisted XSS-like strings, and unsafe URL protocols in assets/tracks.
- Snapshot saves now reject unsafe project names, nested persisted XSS-like strings, unsafe URL protocols, and extreme project duration/resolution values.
- Access tokens now carry `tokenVersion`; `logout`, `logout-all`, password changes, user disable, and admin role/status mutations invalidate older access tokens.
- Access tokens without `tokenVersion` are now rejected instead of treated as version `0`.
- Non-admin project creation is capped by `MAX_PROJECTS_PER_USER`, defaulting to `100`, to reduce unbounded storage abuse.
- Editor-state and snapshot writes now reject unknown top-level fields such as `ownerUserId`.
- Auth logs now hash email identifiers with `LOG_HASH_PEPPER` instead of printing raw emails. Database account emails are still stored normally for login, uniqueness, support, and future reset flows.
- Regression tests were added for those boundary cases.

## Assurance limits

No application can be honestly certified as having "no vulnerabilities" from a single local test pass. What this package can claim is narrower:

- the local TypeScript build succeeds;
- the automated test suite passes;
- dependency audit currently reports no high-or-worse npm advisories;
- the confirmed stored-XSS precursors across project creation, editor-state, snapshot, and username write paths; loose login body shape; and first-pass token invalidation gaps were fixed;
- the known remaining auth lifecycle gaps are documented.

Remaining recommended work:

- refresh-token rotation and replay detection;
- forgot/reset password;
- full structured audit logging with redaction;
- generated manifest tests and black-box API tests;
- CI security scanning with dependency audit and DAST.
