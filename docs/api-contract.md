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
| POST | `/api/v1/auth/register` | public | creates an active editor user with bcrypt password hashing |
| POST | `/api/v1/auth/login` | public | returns HS256 bearer token for active users |
| POST | `/api/v1/auth/logout` | bearer | increments `tokenVersion` for the current user |
| POST | `/api/v1/auth/logout-all` | bearer | increments `tokenVersion` for the current user |
| GET | `/api/v1/auth/me` | bearer | returns the authenticated user without password hash |
| PATCH | `/api/v1/users/:userId` | self/admin | update own username/password; password change revokes old tokens |
| PATCH | `/api/v1/users/:userId/admin` | admin | update role/status and revoke old target tokens |
| DELETE | `/api/v1/users/:userId` | self/admin | disables user and revokes old tokens |
| POST | `/api/chat` | editor/admin | transforms educational text into scene JSON through OpenAI |
| POST | `/api/images` | editor/admin | searches Pexels images for storyboard elements |
| GET | `/api/v1/icons` | bearer | provider-selected icon search |
| GET | `/api/v1/icons/iconify` | bearer | Iconify search alias |
| GET | `/api/v1/icons/nounproject` | bearer | Noun Project search alias |
| GET | `/api/v1/icons/nounproject/:iconId/download` | bearer | Noun Project selected-icon JSON download payload |
| GET | `/api/v1/icons/nounproject/:iconId/file` | bearer | Noun Project selected-icon SVG/PNG bytes |
| POST | `/api/v1/projects` | editor/admin | creates backend-owned `proj_...` project owned by the JWT subject |
| GET | `/api/v1/projects` | bearer | lists visible projects; admin lists all, others list owned projects |
| GET | `/api/v1/projects/:projectId` | bearer | owner or admin |
| GET | `/api/v1/projects/:projectId/editor-state` | bearer | owner or admin |
| PATCH | `/api/v1/projects/:projectId` | editor/admin | owner or admin project patch |
| POST | `/api/v1/projects/:projectId/elements` | editor/admin | owner or admin element creation |
| GET | `/api/v1/projects/:projectId/elements` | bearer | owner or admin element listing |
| PATCH | `/api/v1/projects/:projectId/editor-state` | editor/admin | owner or admin optimistic revision update |
| PUT | `/api/v1/projects/:projectId/snapshot` | editor/admin | owner or admin |
| GET | `/api/v1/projects/:projectId/snapshot` | bearer | owner or admin |

`/api/test` is not part of the default route contract. It is mounted only when `ENABLE_TEST_ROUTES=true` and `NODE_ENV` is not `production`; production always returns `404`.

API routes require a Bearer JWT unless `AUTH_REQUIRED=false`. Browser CORS responses only reflect origins listed in comma-separated `CORS_ORIGIN`; server-to-server requests without an `Origin` header are still allowed. API routes use the configured rate limiter (`RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`) and security headers.

## Role policy

| Capability | Viewer | Editor | Admin |
|---|---:|---:|---:|
| List visible projects | yes | yes | yes |
| Create project | no | yes | yes |
| Read own project | yes | yes | yes |
| Read other user's project | no | no | yes |
| Read own editor-state | yes | yes | yes |
| Update own editor-state | no | yes | yes |
| Read own snapshot | yes | yes | yes |
| Save own snapshot | no | yes | yes |
| Use chat/image provider routes | no | yes | yes |
| Use icon provider routes | yes | yes | yes |

## Token lifecycle

This package includes local user registration, login, logout, password hashing, and user status/role management. Passwords are hashed with bcrypt. Login issues an HS256 access token signed with `JWT_SECRET` and constrained by `JWT_ISSUER`, `JWT_AUDIENCE`, and `JWT_EXPIRES_IN`.

Accepted tokens must include:

- `sub`: non-empty user ID
- `role`: `viewer`, `editor`, or `admin`
- `tokenVersion`: non-negative safe integer
- `exp`: future Unix timestamp, enforced by JWT verification
- `iss`: matching `JWT_ISSUER` when configured
- `aud`: matching `JWT_AUDIENCE` when configured

When MongoDB is connected, authenticated routes verify that the user exists, is `active`, and has a matching server-side `tokenVersion`. Logout, logout-all, password changes, admin role changes, and disabling users increment `tokenVersion` so previously issued tokens fail.

There is still no refresh-token rotation, token-family replay detection, forgot-password flow, or reset-password flow.

## Project limits and durations

Non-admin project creation is capped by `MAX_PROJECTS_PER_USER`, defaulting to `100`. Admins bypass this operational quota.

Project durations are seconds. The API accepts finite non-negative values up to `86400` with up to three decimal places, so `1.5` is valid and extreme values such as `1e100` are rejected.

## Persisted content rules

Persisted display text is plain text, not HTML. Project names, editor-state text fields, snapshot text fields, and URL-like fields are validated at the API boundary. Markup-like content, encoded tag delimiters, control characters, inline event-handler assignments, and `javascript:`, `data:`, or `vbscript:` URL protocols are rejected where validators are in place.

Editor-state and snapshot write payloads use top-level allowlists. Unknown top-level fields such as `ownerUserId` are rejected instead of ignored.

Editor-state read responses use the main project document as the source of truth for `data.project.projectName`, `data.project.duration`, and `data.project.resolution`. Saved editor-state storage remains the source for editor-only fields such as playback, selection, assets, tracks, revision, sessionId, and updatedAt.

## Icon Search

Internal icon search endpoints for the editor UI. Search responses return metadata and provider URLs only; they never return raw SVG, HTML, JSX, component strings, or arbitrary markup.

Generic endpoints:

```http
GET /api/v1/icons?q=lampara%20amarilla&provider=iconify
GET /api/v1/icons?q=lampara%20amarilla&provider=nounproject
```

Provider aliases:

```http
GET /api/v1/icons/iconify?q=lampara%20amarilla
GET /api/v1/icons/nounproject?q=lampara%20amarilla
```

Query parameters:

| Parameter | Notes |
|---|---|
| `q` | optional search text, max 64 characters; translated/normalized to English before provider search |
| `provider` | `iconify` or `nounproject`; omitted defaults to `iconify` |
| `category` | optional default-catalog category filter |
| `limit` | integer 1-100, default 24 |
| `offset` | integer 0-10000; used by Iconify, not sent to Noun Project |
| `color` | optional `#rgb`, `#rrggbb`, `rgb`, or `rrggbb`; affects Iconify preview URLs only during search |

Iconify search calls `https://api.iconify.design/search?query=...&limit=...&start=...`. Empty or failed Iconify searches fall back to curated video-editor defaults including media controls, upload/download, text/caption, settings/search, coffee, lamp, bicycle, and brick/building icons.

Noun Project search calls `https://api.thenounproject.com/v2/icon` with OAuth 1.0a HMAC-SHA1 signing and query parameters `query`, `limit`, `thumbnail_size=200`, and `blacklist=1`. Search does not send `color`, `filetype`, `size`, or `offset`.

Example response item shapes:

```json
{
  "id": "mdi:lamp",
  "provider": "iconify",
  "iconId": "mdi:lamp",
  "preview": {
    "type": "svg-url",
    "value": "mdi:lamp",
    "url": "https://api.iconify.design/mdi/lamp.svg?color=%23ffcc00"
  }
}
```

```json
{
  "id": "noun:123456",
  "provider": "nounproject",
  "iconId": "123456",
  "label": "Lamp",
  "license": "Creative Commons Attribution",
  "attribution": "Lamp by Example Creator from Noun Project",
  "preview": {
    "type": "thumbnail-url",
    "value": "123456",
    "url": "https://static.thenounproject.com/png/123456-200.png"
  }
}
```

Noun Project thumbnail URLs are provider-generated and temporary; treat them as expiring within an hour.

## Noun Project Files

Selected Noun Project icons can be rendered after selection:

```http
GET /api/v1/icons/nounproject/:iconId/download?color=ffcc00&filetype=svg
GET /api/v1/icons/nounproject/:iconId/file?color=ffcc00&filetype=svg
GET /api/v1/icons/nounproject/:iconId/file?color=0055ff&filetype=png&size=512
```

`/download` returns JSON with `base64EncodedFile`, `contentType`, `provider`, `iconId`, `color`, `filetype`, and `size` for PNG requests. `/file` decodes the same provider payload and returns actual image bytes with `Content-Type: image/svg+xml` or `Content-Type: image/png`.

Validation:

- `iconId` must be 1-32 digits only.
- `filetype` must be `svg` or `png`.
- `size` must be an integer from 20 to 1200 and is allowed only for PNG.
- `color` is normalized to lowercase hex without `#`; omitted color defaults to `000000`.
- Download requests only target `https://api.thenounproject.com/v2/icon/:iconId/download`.
- Decoded provider files are capped at 2 MB.
- SVG files are rejected if obvious active content appears, including `script`, `foreignObject`, inline event handlers, `javascript:`, `data:`, or external `href` / `xlink:href`.
- PNG files must have a PNG signature before the API returns `image/png`.

## Translation

Every non-empty icon query is translated/normalized to English before provider search.

Environment:

```env
TRANSLATION_PROVIDER=google
GOOGLE_TRANSLATE_API_KEY=your_google_translate_key
```

When `TRANSLATION_PROVIDER=google` and `GOOGLE_TRANSLATE_API_KEY` is set, Google Translate REST is used. If the key is missing, the provider is `none`, or Google translation fails, the endpoint uses a deterministic local dictionary covering at least `bicicleta`, `bici`, `cafe`, `taza`, `lampara`, `amarilla`, `amarillo`, `ladrillo`, `construccion`, `edificio`, `coche`, `perro`, and `gato`.

Responses include:

```json
{
  "originalQuery": "lampara amarilla",
  "translatedQuery": "yellow lamp",
  "translation": {
    "provider": "fallback-dictionary",
    "target": "en",
    "detectedSourceLanguage": "unknown",
    "usedFallback": true
  }
}
```

## Icon Security

- Validate `q` before translation and validate translated output again before provider search.
- Reject script-like text, SVG/onload payloads, `javascript:`, `data:`, `vbscript:`, inline `on*=` handlers, encoded/double-encoded markup, control characters, and Unicode bidi controls.
- Accept only providers `iconify` and `nounproject`.
- Construct Iconify preview URLs only from validated `prefix:name` IDs.
- Use fixed Noun Project API hosts and OAuth credentials from environment variables only.
- Do not log, return, or commit API keys or API secrets.

## Log privacy

Logs should not print bearer tokens, API keys, provider secrets, raw MongoDB connection errors, passwords, or full user-authored element payloads. Auth logs use user IDs or hashed email identifiers.

## Known lifecycle gaps

The current package implements local access-token auth but not refresh tokens, refresh rotation, token family replay detection, forgot-password, or reset-password. If another identity provider mints tokens, it must use the same HS256 secret, issuer, audience, and `tokenVersion` semantics.
