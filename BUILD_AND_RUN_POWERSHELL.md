# Build and Run with PowerShell

This package is source-first and build-ready. It intentionally does not require bundled `node_modules`.

## 1. Extract and enter the project

```powershell
Expand-Archive -LiteralPath .\awk-video-editor-api-auth-v1-third-pass.zip -DestinationPath .\awk-video-editor-api-auth-v1-third-pass -Force
Set-Location .\awk-video-editor-api-auth-v1-third-pass
```

## 2. Install dependencies

```powershell
npm ci
```

## 3. Build

```powershell
npm run build
```

## 4. Run tests and dependency audit

```powershell
npm test
npm audit --audit-level=high
npm run test:manifest
```

## 5. Configure local runtime

Use a real local MongoDB instance before starting the API.

```powershell
$env:PORT="4000"
$env:MONGODB_URI="mongodb://127.0.0.1:27017"
$env:MONGODB_DB_NAME="awk_video_editor"
$env:JWT_SECRET="dev-only-change-this-secret-please-123456789"
$env:JWT_EXPIRES_IN="1h"
$env:JWT_ISSUER="awk-video-editor-api"
$env:JWT_AUDIENCE="awk-video-editor-client"
$env:CORS_ORIGIN="http://localhost:5173"
$env:BCRYPT_ROUNDS="12"
$env:MAX_PROJECTS_PER_USER="100"
$env:LOG_HASH_PEPPER="dev-only-log-hash-pepper-change-me-123456789"
$env:NODE_ENV="development"
```

## 6. Run the API

```powershell
npm start
```

In another PowerShell window:

```powershell
Invoke-RestMethod -Method GET -Uri "http://127.0.0.1:4000/health"
```

## Production note

Do not reuse the development `JWT_SECRET` in production. Production startup is designed to fail if required secrets are missing or if the JWT secret is a known placeholder.
