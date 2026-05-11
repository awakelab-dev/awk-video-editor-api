# Authentication v1

## Endpoints

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `PATCH /api/v1/users/:userId`
- `DELETE /api/v1/users/:userId`

## Password policy

Passwords must:
- be at least 12 characters long
- include uppercase, lowercase, number, and special character
- not be common passwords
- not contain the email local-part or username
- not include obvious repeated/sequential patterns

## Run locally

```bash
npm install
cp .env.example .env
npm run build
npm test
npm run dev
```

## Quick manual test

Register:

```bash
curl -X POST http://127.0.0.1:4000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  --data '{
    "email": "angel@example.com",
    "username": "apidev",
    "password": "Sup3r!StrongPass"
  }'
```

Login:

```bash
curl -X POST http://127.0.0.1:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  --data '{
    "email": "angel@example.com",
    "password": "Sup3r!StrongPass"
  }'
```
