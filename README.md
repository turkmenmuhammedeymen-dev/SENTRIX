# SENTRIX — Security Intelligence Workspace

SENTRIX is an independent, defensive security-awareness workspace for assets a user owns or is explicitly authorized to assess.

## Starter interface
- Responsive landing page and animated intro.
- Local-only asset URL form; no real scan is performed.

## Backend foundation
- Supabase migration for profiles, owned assets, assessment records, findings, and audit events.
- Row Level Security policies; privileged assessment writes are server-only.
- Setup guide: [BACKEND_SETUP.md](BACKEND_SETUP.md).

## Safety
No unauthorized access, exploitation, credential collection, stealth, or third-party targeting. No fabricated scan results or scores. A real scanner requires explicit authorization, scope verification, server-side execution, rate limits, and audit logs.
