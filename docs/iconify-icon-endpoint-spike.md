# Icon endpoint spike: Iconify provider

## Recommendation

Use Iconify as the first real icon provider for the internal video editor icon picker.

Why Iconify:

- It is designed around icon search/pickers and many icon sets.
- It supports a public API and self-hosting.
- It lets the backend return stable icon IDs instead of raw SVG in search results.
- It has better coverage than a small local emoji catalog and avoids generic web scraping.

## Endpoint

```http
GET /api/v1/icons?q=coffee&provider=iconify&limit=24&offset=0
```

Query parameters:

| Parameter | Required | Default | Notes |
|---|---:|---:|---|
| `q` | no | empty | Search text, max 64 chars. Empty query returns curated default video-editor icons. |
| `provider` | no | `iconify` | Only `iconify` is accepted in this spike. |
| `category` | no | empty | Filter for curated defaults: `media`, `editing`, `actions`, `status`, `objects`. |
| `limit` | no | `24` | Integer 1-100. |
| `offset` | no | `0` | Integer >= 0. |

Example response:

```json
{
  "success": true,
  "message": "Icons fetched successfully",
  "data": {
    "query": "coffee",
    "provider": "iconify",
    "category": null,
    "categories": ["actions", "editing", "media", "objects", "status"],
    "security": {
      "svgReturnedInSearch": false,
      "renderMode": "iconify-id"
    },
    "source": "iconify-api",
    "items": [
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
    ],
    "total": 1,
    "limit": 24,
    "offset": 0
  }
}
```

## Security decisions

The search endpoint returns **metadata only**. It intentionally does not return:

- raw SVG
- HTML
- JSX/React component strings
- arbitrary markup

This reduces stored/reflected XSS risk. The frontend should render using a vetted Iconify renderer or a safe internal renderer from the returned `iconId`.

Additional protections:

- no user-controlled URL fetching; the backend only calls the fixed Iconify API host
- strict validation for `q`, `provider`, `category`, `limit`, and `offset`
- reject markup-like input, double-encoded markup, JavaScript/data/vbscript protocols, bidi controls, and control chars
- reject unsupported providers such as `web`, `internet`, or arbitrary remote SVG sources
- sanitize upstream results by accepting only safe Iconify IDs matching `prefix:name`
- fallback to curated default icons when Iconify is unavailable

## Default icons

When `q` is empty, the endpoint returns curated video-editor defaults from Material Design Icons IDs, such as:

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

Use Iconify first, then consider custom upload as a separate controlled feature.
