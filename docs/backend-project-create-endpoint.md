# Backend: crear y cargar proyectos

Este documento define el contrato para crear proyectos nuevos y cargar proyectos existentes desde la API.

## Endpoints

- `POST /api/v1/projects`
- `GET /api/v1/projects`
- `GET /api/v1/projects/:projectId`
- `GET /api/v1/projects/:projectId/editor-state`

## Reglas principales

- El frontend no debe enviar `id` ni `projectId`.
- El backend genera siempre `projectId` con prefijo `proj_`.
- `GET /api/v1/projects/:projectId/editor-state` no crea proyectos automáticamente.
- Si el proyecto no existe, devuelve `404` con `Project not found`.
