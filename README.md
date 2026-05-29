# AWK Video Editor API

Secure Express + TypeScript + MongoDB backend for the AWK Video Editor.

## Stack

- Node.js
- Express 5
- TypeScript
- MongoDB native driver
- Zod
- Jest + Supertest

## Product scope

This backend is designed for a video editor, not generic CRUD. It supports:

- projects
- media
- editor-state persistence
- snapshot persistence
- one active session per project
- text element creation
- revision-aware saves
- future render pipeline compatibility

## Environment

Copy `.env.example` to `.env` and replace Atlas placeholders.

Important values:

- `PORT=4000`
- `MONGODB_URI`
- `MONGODB_DB_NAME`
- `OPENAI_API_KEY` (required for `/api/summarize` and `/api/v1/slide-tracks`, optional for `/api/chat`)
- `PEXELS_API_KEY` (optional, required for `/api/images`)

## Local setup

### Install

\`\`\`bash
npm install
npm run dev
\`\`\`

### URLs

- Health: `http://localhost:4000/health`
- API base: `http://localhost:4000/api/v1`
- Summarize: `POST http://localhost:4000/api/summarize`

## AI slide tracks endpoint

`POST /api/v1/slide-tracks`

Body:

\`\`\`json
{
"text": "texto largo a resumir...",
"language": "es",
"maxSlides": 10
}
\`\`\`

Returns `tracks` ready for the editor timeline (text, audio, media) following the SQL slide template sizing pattern.

## Tests

Testing tools:

- Jest
- Supertest

Run:

\`\`\`bash
npm test
\`\`\`

## Security notes

- Helmet enabled
- CORS enabled
- Rate limiting enabled
- Request body size limits enabled
- Validation required on params/query/body
- MongoDB `_id` not exposed in API contracts
- Production errors are sanitized
- Auth-ready middleware present for future auth

## Hetzner deployment

This stack does not require nginx on ports 80/8080.

\`\`\`bash
cd /opt/awk-video-editor-api-foundation-pro
cp .env.example .env
nano .env
npm install
npm run build
PORT=4000 npm start
\`\`\`
