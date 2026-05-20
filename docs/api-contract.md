# API contract snapshot

This document records the current hardened v1 route surface for the third-pass package.

## Response envelopes

Success:

```json
{
  "success": true,
  "message": "Operation successful",
  "data": {},
  "requestId": "correlation-id"
}
```

Validation failure:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "fieldName", "message": "Reason here" }
  ],
  "requestId": "correlation-id"
}
```

Authentication, authorization, and not-found failures use the same top-level shape with deterministic messages such as `Unauthorized`, `Forbidden`, or `Project not found`.

## Confirmed routes

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | public | health status only |
| POST | `/api/v1/auth/register` | public | creates editor user |
| POST | `/api/v1/auth/login` | public | returns bearer access token |
| POST | `/api/v1/auth/logout` | bearer | increments `tokenVersion` and invalidates existing access tokens for the current user |
| POST | `/api/v1/auth/logout-all` | bearer | increments `tokenVersion` and invalidates existing access tokens |
| GET | `/api/v1/auth/me` | bearer | returns current user |
| PATCH | `/api/v1/users/:userId` | self or admin | self profile update, no role/status self-escalation |
| PATCH | `/api/v1/users/:userId/admin` | admin | role/status mutation |
| DELETE | `/api/v1/users/:userId` | self or admin | user deletion path |
| POST | `/api/v1/projects` | editor/admin | creates backend-owned `proj_...` project; non-admin users are capped by `MAX_PROJECTS_PER_USER` |
| GET | `/api/v1/projects` | bearer | lists visible projects |
| GET | `/api/v1/projects/:projectId` | bearer | owner or admin |
| GET | `/api/v1/projects/:projectId/editor-state` | bearer | owner or admin |
| PATCH | `/api/v1/projects/:projectId/editor-state` | editor/admin | optimistic revision update |
| PUT | `/api/v1/projects/:projectId/snapshot` | editor/admin | owner or admin |
| GET | `/api/v1/projects/:projectId/snapshot` | bearer | owner or admin |

`/api/test` is not part of the default route contract. It is mounted only when `ENABLE_TEST_ROUTES=true` and `NODE_ENV` is not `production`; production always returns `404`.

## Role policy

| Capability | Viewer | Editor | Admin |
|---|---:|---:|---:|
| Register publicly | default role only | default role only | no |
| Read own profile | yes | yes | yes |
| Patch own username/password | yes | yes | yes |
| Patch own role/status | no | no | no |
| List visible projects | yes | yes | yes |
| Create project | no | yes | yes |
| Read own project | yes | yes | yes |
| Read other user's project | no | no | yes |
| Read own editor-state | yes | yes | yes |
| Update own editor-state | no | yes | yes |
| Read own snapshot | yes | yes | yes |
| Save own snapshot | no | yes | yes |
| Change another user role/status | no | no | yes |

## Token lifecycle

Access tokens must include a non-negative safe-integer `tokenVersion` claim. Tokens missing `tokenVersion` are rejected. `POST /api/v1/auth/logout`, `POST /api/v1/auth/logout-all`, password changes, user disable, and admin role/status mutations increment the stored user `tokenVersion`, which invalidates older access tokens on their next request. Without refresh-token sessions, `logout` and `logout-all` both invalidate the user's currently issued access tokens.

Login failures for unknown, inactive, deleted, or wrong-password users return the same generic `401 Invalid credentials` response. After login payload validation, unknown or inactive-user paths perform bcrypt comparison against a fixed dummy hash selected for the configured bcrypt cost, reducing practical email-existence timing oracles.

## Project limits and durations

Non-admin project creation is capped by `MAX_PROJECTS_PER_USER`, defaulting to `100`. Admins bypass this operational quota.

Project durations are seconds. The API accepts finite non-negative values up to `86400` with up to three decimal places, so `1.5` is valid and extreme values such as `1e100` are rejected.

## Persisted content rules

Persisted display text is plain text, not HTML. Usernames, project names, editor-state text fields, snapshot text fields, and URL-like fields are validated at the API boundary. Markup-like content, encoded tag delimiters, control characters, inline event-handler assignments, and `javascript:`, `data:`, or `vbscript:` URL protocols are rejected. Usernames are additionally restricted to letters, numbers, dots, underscores, and hyphens.

Editor-state and snapshot write payloads use top-level allowlists. Unknown top-level fields such as `ownerUserId` are rejected instead of ignored.

Editor-state read responses use the main project document as the source of truth for `data.project.projectName`, `data.project.duration`, and `data.project.resolution`. Saved editor-state storage remains the source for editor-only fields such as playback, selection, assets, tracks, revision, sessionId, and updatedAt.

## Log privacy

Account email addresses remain stored in the database for login, uniqueness, support, and future password-reset flows. Auth logs do not print raw emails or passwords. Email correlation in logs uses `emailHash`, derived from `HMAC-SHA256(LOG_HASH_PEPPER, normalizedEmail)` and truncated to 16 hex characters. Set `LOG_HASH_PEPPER` to a long random value distinct from `JWT_SECRET`.

## Known lifecycle gaps

The current package does not yet implement refresh tokens, refresh rotation, token family replay detection, forgot-password, or reset-password.


## GET /api/v1/icons

Internal emoji/icon search endpoint for the editor UI. Returns JSON records only and never returns HTML, SVG, JSX, or component markup.

Query parameters:
- `q` optional search text, max 64 characters
- `category` optional category slug
- `limit` optional integer, default 50, max 100
- `offset` optional integer, default 0

Success example:
```json
{
  "success": true,
  "message": "Icons fetched successfully",
  "data": {
    "query": "taza de cafe",
    "category": null,
    "categories": ["faces", "food-drink", "objects", "symbols", "travel"],
    "items": [
      {
        "id": "coffee",
        "emoji": "☕",
        "label": "Coffee",
        "category": "food-drink",
        "keywords": ["coffee", "cafe", "café", "cup", "mug", "taza", "bebida", "drink", "breakfast"]
      }
    ],
    "total": 1,
    "limit": 50,
    "offset": 0
  },
  "requestId": "correlation-id"
}
```

Validation failures use the standard envelope and reject control characters, markup-like queries, malformed category slugs, and out-of-range pagination values.

### Icon endpoint security notes

`GET /api/v1/icons` is an internal JSON-only endpoint for selecting emoji metadata to insert into text fields. It returns only whitelisted Unicode emoji records and never returns HTML, SVG, JSX, components, or markup fields.

The `q` parameter is normalized with Unicode NFKC before validation. Markup-like text, script/data/vbscript protocol text, inline-handler syntax, percent/double-percent encoded dangerous delimiters, ASCII control characters, and Unicode bidi controls are rejected with `422 Validation failed`. Unknown routes return JSON `404` responses.

## GET /api/v1/icons

Search icons using the Iconify provider. The endpoint returns JSON metadata and Iconify IDs only. It does not return raw SVG, HTML, JSX, or arbitrary markup.

Query parameters:

- `q`: optional search text, max 64 chars. Empty query returns curated video-editor defaults.
- `provider`: optional, currently only `iconify`.
- `category`: optional default catalog category filter.
- `limit`: optional integer, default `24`, max `100`.
- `offset`: optional integer, default `0`.

Example:

```http
GET /api/v1/icons?q=coffee&provider=iconify&limit=24
```

Response item shape:

```json
{
  "id": "mdi:coffee",
  "provider": "iconify",
  "iconId": "mdi:coffee",
  "prefix": "mdi",
  "name": "coffee",
  "label": "Coffee",
  "category": "iconify",
  "tags": ["mdi", "coffee"],
  "license": null,
  "preview": {
    "type": "iconify-id",
    "value": "mdi:coffee"
  }
}
```

Security notes:

- Search responses do not include `svg`, `html`, `component`, or `markup` fields.
- Unsafe query strings such as script tags, JavaScript URLs, encoded markup, bidi controls, and malformed categories are rejected with `422`.
- The backend only calls the fixed Iconify API host and filters upstream icon IDs with a strict allowlist pattern.
