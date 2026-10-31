# SENTRIX — Security Intelligence Workspace

SENTRIX is an independent defensive security-awareness workspace for assets a user owns or is explicitly authorized to assess.

## Back4App backend
- Parse Server authentication (username/email/password).
- Cloud Code endpoints for registering/listing/deleting owned assets and creating assessment requests.
- Server-side ownership checks and audit events.
- Cloud Code source: `cloud/main.js`; browser integration: `public/js/`.

## Important limits
The current backend does **not** run a scanner. Assessment requests are stored as requests only; no scan, vulnerability result, or score is fabricated. Before adding any assessment engine, implement verified ownership/authorization, strict scope controls, rate limits, abuse monitoring, and audit review.

## Setup
Follow [BACKEND_SETUP.md](BACKEND_SETUP.md). Each project must use its own Back4App app and its own credentials. Never put the Master Key in browser code or Git.
