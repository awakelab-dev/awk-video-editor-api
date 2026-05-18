# Internal icon endpoint

Adds `GET /api/v1/icons` for searching a local emoji/icon allowlist.

Supported query parameters:

- `q`: optional search text, max 64 characters
- `category`: optional category slug
- `limit`: optional integer, default 50, max 100
- `offset`: optional integer, default 0

Example:

```http
GET /api/v1/icons?q=taza%20de%20cafe
```

Response:

```json
{
  "success": true,
  "message": "Icons fetched successfully",
  "data": {
    "query": "taza de cafe",
    "category": null,
    "categories": ["faces", "food-drink", "objects", "people", "symbols", "travel"],
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
  }
}
```

Security model:

- local whitelist only
- no remote icon fetching
- JSON only
- no HTML, SVG, JSX, component, or markup fields
- rejects markup-like, protocol-like, double-encoded, fullwidth/confusable, control-character, and bidi-control payloads
