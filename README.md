# SENTRIX — Security Intelligence Workspace

SENTRIX is a defensive security workspace for digital assets a user owns or is explicitly authorized to manage.

## Ownership verification
- GitHub OAuth Device Flow links a user's GitHub account.
- GitHub API checks the authenticated identity and repository permissions.
- Personal repositories require the authenticated account to be the repository owner with admin permission.
- Organization repositories require admin permission; SENTRIX labels this as organization administrator access, not legal ownership.
- Contributor/write access alone is never accepted as ownership.
- Domain verification remains a separate live HTTPS file check.

## Back4App backend
- Parse Server authentication (username/email/password).
- Cloud Code endpoints for domain/asset management, GitHub account connection, repository ownership verification, audit events, and assessment requests.
- GitHub OAuth tokens are encrypted server-side; no token or Master Key is exposed to browser code.
- Cloud Code source: `cloud/main.js`; browser integration: `app.js`.

## Important limits
The current backend does **not** run a vulnerability scanner. Assessment requests are stored as requests only; no scan, vulnerability result, or score is fabricated. Before adding any assessment engine, implement verified ownership/authorization, strict scope controls, rate limits, abuse monitoring, and audit review.

## Setup
Follow [BACKEND_SETUP.md](BACKEND_SETUP.md). GitHub OAuth App setup and Back4App Config values are required before GitHub repository verification can run. Each project must use its own Back4App app and credentials. Never put the Master Key or GitHub token-encryption key in browser code or Git.
