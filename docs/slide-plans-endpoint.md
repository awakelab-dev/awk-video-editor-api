# Slide plans endpoint

## Endpoint

- `POST /api/v1/slide-plans`

## Request body

```json
{
  "text": "Texto largo a dividir en slides",
  "title": "Título opcional",
  "audience": "Audiencia opcional",
  "tone": "Tono opcional"
}
```

## Behavior

- The endpoint validates the body with Zod and rejects unknown fields.
- It generates a slide plan that follows the layouts defined in `docs/slide-schema.json`.
- It tries to use the largest practical number of slide definitions while keeping the content coherent.
- The response is deterministic and does not depend on external AI services.

## Response

The response includes the schema template metadata plus an enriched `slides` array where every slide has an `id`, `layout`, and generated `content`.
