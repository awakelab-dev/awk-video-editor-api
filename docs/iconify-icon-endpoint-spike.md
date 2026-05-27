# Icon endpoint spike: Iconify provider

## Recommendation

Use Iconify as the first icon provider for the internal video editor icon picker. It supports search, stable icon IDs, public SVG URL rendering, and a broad catalog without returning raw SVG markup from this API.

## Endpoint

All `/api` endpoints require a valid bearer JWT when `AUTH_REQUIRED=true`. Viewer, editor, and admin roles may use Iconify search.

```http
GET /api/v1/icons?q=coffee&provider=iconify&limit=24&offset=0
GET /api/v1/icons/iconify?q=lampara%20amarilla&color=ffcc00
```

Query parameters:

| Parameter | Required | Default | Notes |
|---|---:|---:|---|
| `q` | no | empty | Search text, max 64 chars. Empty query returns curated default video-editor icons. |
| `provider` | no | `iconify` | Generic endpoint accepts `iconify` or `nounproject`; this document covers Iconify. |
| `category` | no | empty | Filter for curated defaults: `media`, `editing`, `actions`, `status`, `objects`. |
| `limit` | no | `24` | Integer 1-100. |
| `offset` | no | `0` | Integer 0-10000. Sent to Iconify as `start`. |
| `color` | no | none | `#rgb`, `#rrggbb`, `rgb`, or `rrggbb`; appended to preview URLs as `color=%23{hex}`. |

Before search, `q` is translated/normalized to English using Google Translate when configured, otherwise a deterministic local dictionary.

Example response:

```json
{
  "success": true,
  "message": "Icons fetched successfully",
  "data": {
    "originalQuery": "lampara amarilla",
    "translatedQuery": "yellow lamp",
    "provider": "iconify",
    "source": "iconify-api",
    "items": [
      {
        "id": "mdi:lamp",
        "provider": "iconify",
        "iconId": "mdi:lamp",
        "prefix": "mdi",
        "name": "lamp",
        "label": "Lamp",
        "category": "iconify",
        "tags": ["mdi", "lamp"],
        "license": null,
        "preview": {
          "type": "svg-url",
          "value": "mdi:lamp",
          "url": "https://api.iconify.design/mdi/lamp.svg?color=%23ffcc00"
        }
      }
    ],
    "total": 1,
    "limit": 24,
    "offset": 0
  }
}
```

## Security decisions

The search endpoint returns metadata and a provider URL only. It intentionally does not return:

- raw SVG
- HTML
- JSX/React component strings
- arbitrary markup

Additional protections:

- no user-controlled URL fetching; the backend only calls the fixed Iconify API host
- strict validation for `q`, `provider`, `category`, `limit`, `offset`, and `color`
- reject markup-like input, double-encoded markup, JavaScript/data/vbscript protocols, bidi controls, and control chars
- reject unsupported providers such as `web`, `internet`, or arbitrary remote SVG sources
- sanitize upstream results by accepting only safe Iconify IDs matching `prefix:name`
- fallback to curated default icons when Iconify is unavailable

## Default icons

When `q` is empty or Iconify search fails, the endpoint returns curated Material Design Icons IDs useful in the video editor, including:

- `mdi:movie-open`
- `mdi:play`
- `mdi:pause`
- `mdi:stop`
- `mdi:volume-high`
- `mdi:music`
- `mdi:microphone`
- `mdi:camera`
- `mdi:image`
- `mdi:content-cut`
- `mdi:format-text`
- `mdi:closed-caption`
- `mdi:upload`
- `mdi:download`
- `mdi:trash-can`
- `mdi:cog`
- `mdi:magnify`
- `mdi:alert`
- `mdi:check`
- `mdi:close`
- `mdi:heart`
- `mdi:coffee`
- `mdi:lamp`
- `mdi:bicycle`
- `mdi:brick`

## Custom icon upload

Not implemented in this spike.

Recommended future design:

- admin/editor-only upload endpoint
- `.svg` only
- 50-100 KB max size
- parse as XML
- allowlist tags: `svg`, `path`, `g`, `circle`, `rect`, `line`, `polyline`, `polygon`, `ellipse`, `title`, `desc`
- block `script`, `foreignObject`, `iframe`, `image`, `audio`, `video`, `animate`, `style`
- strip all `on*` event attributes
- strip `href`/`xlink:href` and external URLs
- require `viewBox`
- store only sanitized SVG

## Why not generic web SVG search?

Generic remote SVG fetching is high-risk:

- XSS through SVG markup
- SSRF if arbitrary URLs are fetched server-side
- license/attribution problems
- huge files or resource abuse
- tracking/external references
- unstable results

Use Iconify and Noun Project first, then consider custom upload as a separate controlled feature.
