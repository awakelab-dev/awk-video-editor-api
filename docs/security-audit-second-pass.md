# Second-pass defensive audit summary

Implemented in this package:

- Production env fails hard without JWT_SECRET/JWT_ISSUER/JWT_AUDIENCE/MONGODB_URI/CORS_ORIGIN.
- Placeholder JWT secrets are forbidden in production.
- JWT verification pins algorithm, issuer and audience.
- Disabled or unknown users cannot use old tokens.
- Public register cannot set role.
- Self user patch cannot set role/status.
- Admin-only user role/status endpoint remains separate.
- Projects are owner-scoped for non-admin users.
- Editor-state revision updates are atomic via `{ projectId, revision }` filter.
- Helmet security headers are enabled.
- `/api/test` is disabled in production.
- Request IDs are attached to responses.
- Body parser returns clean 400/413 responses.
- Added integration tests for auth/permissions/JWT/CORS/rate limits/project access.

Still recommended next:

- Refresh-token rotation and replay detection.
- Stronger audit/event log pipeline.
- Review per-user quotas for any newly mounted expensive routes.
- SAST/secret scanning/dependency review in CI.
