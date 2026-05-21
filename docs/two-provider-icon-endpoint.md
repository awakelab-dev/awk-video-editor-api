# Two-provider icon URL endpoint spike

## Goal

Provide icon search endpoints that return icon URLs from two providers:

1. Provider 1: Iconify
2. Provider 2: The Noun Project

Before provider search, non-empty user queries are translated to English so searches such as `bicicleta`, `lámpara amarilla`, `café`, and `ladrillo construcción` can match providers that primarily index English terms.

## Endpoints

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

## Response shape

```json
{
  "success": true,
  "message": "Icons fetched successfully",
  "data": {
    "originalQuery": "lampara amarilla",
    "translatedQuery": "yellow lamp",
    "translation": {
      "provider": "google",
      "target": "en",
      "detectedSourceLanguage": "es",
      "usedFallback": false
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
          "url": "https://api.iconify.design/mdi/lamp.svg"
        }
      }
    ]
  }
}
```

Noun Project records use `preview.type = "thumbnail-url"` and keep attribution/license metadata when the provider returns it.

## Translation

Environment variables:

```env
TRANSLATION_PROVIDER=google
GOOGLE_TRANSLATE_API_KEY=your_google_translate_key
```

If Google translation is not configured or fails, the endpoint falls back to a small deterministic dictionary for common terms such as:

- `bicicleta` -> `bicycle`
- `café` / `cafe` -> `coffee`
- `lámpara amarilla` -> `yellow lamp`
- `ladrillo construcción` -> `construction brick`

## Provider configuration

Iconify works without credentials.

Noun Project requires:

```env
NOUN_PROJECT_API_KEY=your_key
NOUN_PROJECT_API_SECRET=your_secret
```

When these values are missing, `provider=nounproject` returns `503` with a clear configuration error instead of crashing.

## Security decisions

Search responses return URL metadata only. They do not return raw SVG, HTML, JSX, component strings, or arbitrary markup.

Protections:

- Query is validated before translation.
- Translated output is validated again before provider search.
- Iconify URLs are constructed only from validated `prefix:name` IDs.
- Noun Project URLs are accepted only from the official provider response and must be HTTPS.
- Arbitrary URL fetching / generic internet SVG search is not implemented.
- XSS-like input, JavaScript/data/vbscript protocols, encoded markup, bidi controls, and invalid provider/category values are rejected.
