# SENTRIX backend setup

## Supabase
1. Create a new Supabase project dedicated to SENTRIX.
2. Open SQL Editor and run `supabase/migrations/001_initial_schema.sql`.
3. In Authentication, configure email confirmation and allowed redirect URLs for your deployed domain.
4. Copy the project URL and anon/publishable key into your deployment environment as `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
5. Keep the service-role key server-side only. Never commit secrets.

## Current boundary
The schema provides profiles, owned assets, assessment records, findings, and audit history with Row Level Security. It does not implement a scanner. Assessment creation, state transitions, findings, and audit writes are deliberately server-only until a permission-gated Edge Function is implemented.

## Before production
Add domain ownership verification, explicit authorization evidence, rate limits, abuse monitoring, retention/deletion workflows, and tests for every RLS policy. Do not scan a domain without permission.
