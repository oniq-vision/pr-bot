# ONIQ PR-bot (Azure Functions, TypeScript – v4 model)

HTTP-triggered endpoints your agent/relay can call to create branches, push commits, and open PRs via a **GitHub App**.
Implements **Easy Auth–ready** security + **HMAC** verification using the v4 Functions model.

## Endpoints
- `POST /api/branch`
- `POST /api/batch-commit`
- `POST /api/open-pr`
- `POST /api/comment`

## Build & Run
```bash
npm ci
npm run build
func start
```

## Security
- Enable **Authentication (Easy Auth)** for the Function App (Require authentication).
- Client must send headers: `X-Timestamp`, `X-Request-Id`, `X-Signature` (sha256 HMAC over `timestamp + "\n" + rawBody`).
- Secrets (GitHub App PEM, HMAC secret) are read from **Azure Key Vault** using **Managed Identity**.

## App Settings
- `GH_APP_ID`, `GH_INSTALLATION_ID`, `KEYVAULT_URL`
- Optional: `GH_APP_PRIVATE_KEY_SECRET` (default: `github-app-private-key`)
- Optional: `HMAC_SECRET_NAME` (default: `pr-bot-hmac-secret`)

Permissions on GitHub App: **Contents (RW)**, **Pull requests (RW)**, **Metadata (R)**.
