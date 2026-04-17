# API Endpoint Standards

## Design principles

1. All application endpoints MUST live under `/api/v1`.
2. Endpoints MUST use nouns, not verbs.
3. Resource names MUST be plural.
4. Paths MUST be lowercase.
5. Multi-word path segments MUST use kebab-case.
6. Subresources MUST represent real hierarchy.
7. Request bodies MUST NOT be accepted on `GET`.
8. Params, query, and body MUST be validated with Zod.
9. Unknown fields MUST be rejected on strict contracts.
10. Responses MUST use the standard success/error envelope.
11. Mutation endpoints MUST document idempotency and conflict behavior.
12. Editor-state mutations MUST include a `revision` field for optimistic concurrency.

## Naming rules

### Good
- `GET /api/v1/projects`
- `POST /api/v1/projects`
- `GET /api/v1/projects/:projectId`
- `PATCH /api/v1/projects/:projectId`
- `GET /api/v1/projects/:projectId/editor-state`
- `PATCH /api/v1/projects/:projectId/editor-state`
- `PUT /api/v1/projects/:projectId/snapshot`
- `GET /api/v1/projects/:projectId/session`
- `POST /api/v1/projects/:projectId/session/join`
- `POST /api/v1/projects/:projectId/elements`
- `GET /api/v1/media`
- `GET /api/v1/renders/:renderId`
- `POST /api/v1/renders/:renderId/cancel`

### Bad
- `/api/v1/getProjects`
- `/api/v1/createProject`
- `/api/v1/project/:id/update`
- `/api/v1/deleteProject/:id`
- `/api/v1/editorState/save`
- `/api/v1/getMediaAssets`

## Parameter management rules

### Path params
Path params MUST be used for resource identity.

Examples:
- `/api/v1/projects/:projectId`
- `/api/v1/projects/:projectId/editor-state`
- `/api/v1/renders/:renderId`

### Query params
Query params MUST be used for filtering, sorting, pagination, and search.

Examples:
- `GET /api/v1/media?projectId=proj_123&type=video&page=1&limit=20`
- `GET /api/v1/media?projectId=proj_123&search=intro`
- `GET /api/v1/projects?search=promo&sort=updatedAt:desc`

### Request body
Request body MUST be used for create/update payloads only.

Rules:
- Required fields MUST be documented.
- Optional fields SHOULD be omitted when not used.
- Unknown fields MUST NOT be silently accepted.
- Enum-like values MUST be validated explicitly.

## HTTP method policy

- `GET` = read
- `POST` = create or non-idempotent action
- `PATCH` = partial update
- `PUT` = full replacement when the contract is explicit
- `DELETE` = delete

## Response format

### Success
\`\`\`json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {}
}
\`\`\`

### Success with pagination metadata
\`\`\`json
{
  "success": true,
  "message": "Media assets fetched successfully",
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 52
  }
}
\`\`\`

### Error
\`\`\`json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "text",
      "message": "Text is required"
    }
  ]
}
\`\`\`

## Error format standard

The API MUST return the following error shape:

\`\`\`json
{
  "success": false,
  "message": "Human readable summary",
  "errors": [
    {
      "field": "optional.field.path",
      "message": "Specific validation detail"
    }
  ]
}
\`\`\`

### Sample 404
\`\`\`json
{
  "success": false,
  "message": "Project not found"
}
\`\`\`

### Sample 409
\`\`\`json
{
  "success": false,
  "message": "Editor state revision conflict",
  "errors": [
    {
      "field": "revision",
      "message": "Expected latest revision before update"
    }
  ]
}
\`\`\`

### Sample 429
\`\`\`json
{
  "success": false,
  "message": "Too many requests"
}
\`\`\`

## Status code matrix

| Code | Meaning | Usage |
|---|---|---|
| 200 | OK | Successful read/update/action |
| 201 | Created | New resource created |
| 204 | No Content | Optional delete response |
| 400 | Bad Request | Semantically bad client request |
| 401 | Unauthorized | Authentication required |
| 403 | Forbidden | Authenticated but not allowed |
| 404 | Not Found | Resource absent |
| 409 | Conflict | Revision/session conflict |
| 422 | Unprocessable Entity | Schema validation failure |
| 429 | Too Many Requests | Rate limiting |
| 500 | Internal Server Error | Unexpected server failure |

## Versioning policy

1. All public endpoints MUST be versioned under `/api/v1`.
2. Breaking changes MUST create a new major API path, such as `/api/v2`.
3. Additive changes SHOULD preserve backward compatibility.
4. Deprecated behavior SHOULD be documented before removal.

## Naming consistency rules for IDs and fields

- Resource IDs MUST use `projectId`, `renderId`, `sessionId`, `elementId`, `trackId`.
- Client and server MUST NOT mix `id`, `_id`, and `project_id` for the same field in external contracts.
- MongoDB `_id` MUST NOT be exposed as the primary API identifier.
- Durations in snapshot payloads MUST be expressed in seconds.
- Timings in create-text payloads MUST use `startMs` and `durationMs`.

## Project-specific endpoint examples

1. `POST /api/v1/projects`
2. `GET /api/v1/projects`
3. `GET /api/v1/projects/:projectId`
4. `PATCH /api/v1/projects/:projectId`
5. `GET /api/v1/projects/:projectId/editor-state`
6. `PATCH /api/v1/projects/:projectId/editor-state`
7. `PUT /api/v1/projects/:projectId/snapshot`
8. `GET /api/v1/projects/:projectId/session`
9. `POST /api/v1/projects/:projectId/session/join`
10. `POST /api/v1/projects/:projectId/elements`
11. `GET /api/v1/media?projectId=proj_123&type=video&page=1&limit=20&search=intro`
12. `GET /api/v1/renders/:renderId`
13. `POST /api/v1/renders/:renderId/cancel`

## Canonical request examples

### Create text element
\`\`\`json
{
  "type": "text",
  "trackId": "track_001",
  "text": "New title",
  "position": {
    "x": 0.5,
    "y": 0.5
  },
  "style": {
    "fontSize": 42,
    "fontWeight": 700,
    "color": "#FFFFFF"
  },
  "timing": {
    "startMs": 0,
    "durationMs": 4000
  }
}
\`\`\`

### Update editor state
\`\`\`json
{
  "revision": 5,
  "sessionId": "session_demo-project",
  "project": {
    "projectName": "Promo Reel",
    "duration": 12.5,
    "resolution": {
      "w": 1920,
      "h": 1080
    }
  },
  "playback": {
    "currentTime": 2.1,
    "isPlaying": false,
    "zoomLevel": 120
  },
  "selection": {
    "selectedElementId": "text_01",
    "selectionSource": "timeline"
  },
  "assets": [],
  "tracks": []
}
\`\`\`

### Save snapshot
\`\`\`json
{
  "snapshotVersion": 1,
  "savedAt": "2026-04-10T12:00:00.000Z",
  "project": {
    "projectName": "Promo Reel",
    "duration": 12.5,
    "resolution": {
      "w": 1920,
      "h": 1080
    }
  },
  "playback": {
    "currentTime": 2.1,
    "isPlaying": false,
    "zoomLevel": 120
  },
  "selection": {
    "selectedElementId": "text_01",
    "selectionSource": "timeline"
  },
  "assets": [
    {
      "id": "asset_1",
      "duration": 12.5
    }
  ],
  "tracks": [
    {
      "id": "track_1",
      "duration": 12.5,
      "elements": [
        {
          "id": "text_01",
          "duration": 4
        }
      ]
    }
  ]
}
\`\`\`

## PR checklist

- [ ] Endpoint path follows `/api/v1`
- [ ] Route names use nouns, lowercase, plural resources
- [ ] Params/query/body are validated with Zod
- [ ] Unknown body fields are rejected where required
- [ ] Response envelope matches standard
- [ ] Error envelope matches standard
- [ ] Status codes are documented and correct
- [ ] Auth and authorization implications are considered
- [ ] Rate limiting/security implications are considered
- [ ] Tests cover at least one success case
- [ ] Tests cover at least one error case
- [ ] README/docs updated
- [ ] Frontend contract impact reviewed
