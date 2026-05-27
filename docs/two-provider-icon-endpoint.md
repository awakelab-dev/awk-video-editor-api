# Two-provider icon URL endpoint spike

## Goal

Provide internal icon search endpoints that return safe icon metadata and URLs from two providers:

1. Iconify
2. The Noun Project

Every non-empty query is translated or normalized to English before provider search so inputs such as `bicicleta`, `lampara amarilla`, `cafe`, and `ladrillo construccion` can match English-first provider indexes.

## Endpoints

All `/api` endpoints require a valid bearer JWT when `AUTH_REQUIRED=true`. Tokens can be obtained from the local `/api/v1/auth/register` and `/api/v1/auth/login` flow, or minted by a trusted upstream with matching JWT settings. Viewer, editor, and admin roles may use the icon provider routes.

Generic endpoint:

```http
GET /api/v1/icons?q=lampara%20amarilla&provider=iconify
GET /api/v1/icons?q=lampara%20amarilla&provider=nounproject
```

Provider aliases:

```http
GET /api/v1/icons/iconify?q=lampara%20amarilla
GET /api/v1/icons/nounproject?q=lampara%20amarilla
```

Selected Noun Project file endpoints:

```http
GET /api/v1/icons/nounproject/:iconId/download?color=ffcc00&filetype=svg
GET /api/v1/icons/nounproject/:iconId/file?color=ffcc00&filetype=svg
GET /api/v1/icons/nounproject/:iconId/file?color=0055ff&filetype=png&size=512
```

`/download` returns JSON containing the provider base64 payload. `/file` returns decoded bytes with `image/svg+xml` or `image/png`.

## Response shape

```json
{
  "success": true,
  "message": "Icons fetched successfully",
  "data": {
    "originalQuery": "lampara amarilla",
    "translatedQuery": "yellow lamp",
    "translation": {
      "provider": "fallback-dictionary",
      "target": "en",
      "detectedSourceLanguage": "unknown",
      "usedFallback": true
    },
    "provider": "iconify",
    "source": "iconify-api",
    "items": [
      {
        "id": "mdi:lamp",
        "provider": "iconify",
        "iconId": "mdi:lamp",
        "label": "Lamp",
        "preview": {
          "type": "svg-url",
          "value": "mdi:lamp",
          "url": "https://api.iconify.design/mdi/lamp.svg?color=%23ffcc00"
        }
      }
    ]
  }
}
```

Noun Project records use `preview.type = "thumbnail-url"` and include `license`, `attribution`, `tags`, and `styles` when the provider returns safe values.

## Translation

Environment variables:

```env
TRANSLATION_PROVIDER=google
GOOGLE_TRANSLATE_API_KEY=your_google_translate_key
```

If Google translation is not configured or fails, the endpoint falls back to a deterministic local dictionary covering:

- `bicicleta` / `bici` -> `bicycle`
- `cafe` -> `coffee`
- `taza` -> `cup`
- `lampara` -> `lamp`
- `lampara amarilla` -> `yellow lamp`
- `amarilla` / `amarillo` -> `yellow`
- `ladrillo` -> `brick`
- `construccion` -> `construction`
- `edificio` -> `building`
- `coche` -> `car`
- `perro` -> `dog`
- `gato` -> `cat`

## Provider behavior

Iconify:

- Search URL: `https://api.iconify.design/search?query=translatedQuery&limit=N&start=offset`
- Preview URL: `https://api.iconify.design/{prefix}/{name}.svg`
- If `color` is present, preview URL appends `?color=%23{hex}`.
- Empty or failed searches return curated editor defaults.
- Upstream IDs must match validated `prefix:name` before URL construction.

Noun Project:

- Search URL: `https://api.thenounproject.com/v2/icon`
- OAuth: OAuth 1.0a HMAC-SHA1 signed with `NOUN_PROJECT_API_KEY` and `NOUN_PROJECT_API_SECRET`; no access token is used.
- Search query params: `query`, `limit`, `thumbnail_size=200`, `blacklist=1`.
- Search does not send `offset`, `color`, `filetype`, or `size`.
- Noun thumbnails are temporary provider URLs and can expire within an hour.
- Color and file type are applied only after selecting an icon through the `/download` or `/file` endpoint.

## Provider configuration

Iconify works without credentials.

Noun Project requires:

```env
NOUN_PROJECT_API_KEY=your_key
NOUN_PROJECT_API_SECRET=your_secret
```

When these values are missing, `provider=nounproject` and Noun file endpoints return `503` with `ICON_PROVIDER_NOT_CONFIGURED`.

## Security decisions

Search responses return URL metadata only. They do not return raw SVG, HTML, JSX, component strings, or arbitrary markup.

Protections:

- Query is validated before translation.
- Translated output is validated again before provider search.
- Provider must be `iconify` or `nounproject`.
- `limit` is restricted to 1-100 and `offset` must be >= 0.
- `offset` is capped at 10000 to avoid unbounded upstream pagination.
- Color must be `#rgb`, `#rrggbb`, `rgb`, or `rrggbb` hex.
- Noun file `iconId` must be 1-32 digits only.
- Noun file `filetype` must be `svg` or `png`.
- Noun PNG `size` must be 20-1200; SVG rejects `size`.
- The backend never fetches arbitrary user URLs.
- Iconify URLs are constructed only from validated IDs.
- Noun provider calls target only `api.thenounproject.com`.
- Noun thumbnail URLs must be HTTPS URLs on `static.thenounproject.com`.
- Noun selected-file payloads are capped at 2 MB after base64 decoding.
- SVG file responses reject obvious active content such as `script`, `foreignObject`, inline events, `javascript:`, `data:`, and external `href` references.
- PNG file responses must have a PNG signature.
- API keys and secrets are read only from environment variables and must not be committed.
