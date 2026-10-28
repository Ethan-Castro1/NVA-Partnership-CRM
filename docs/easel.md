# Running Village Partners on Easel

Easel is Playlab's hosting for lab school apps: Playlab's AWS account through DuploCloud, one tenant per school
per environment. Village Partners is the `partners` app of the `nva` school.

| Environment | Tenant | Deploys | URL |
|---|---|---|---|
| dev | `exdnva` | every push to `main` (once the app is set up, below) | `https://partners-nva.dev.labschools.ai` (VPN only) |
| prod | `extnva` | by hand: Actions → Deploy → Run workflow (`prod`, `apply`), from `main` | `https://partners-nva.labschools.ai` |

## What this repo provides

- `Dockerfile`: the production image (Node 24). The server listens on `PORT` and answers `/healthcheck` with 200
  once its database works (503 before), so a pod that can't serve never takes traffic.
- `.github/workflows/deploy.yml`: tests, then calls duplocloud-infrastructure's `extapp-workflow.yml`. Its
  `before_update` runs `npm run db:migrate` in the new image as the database owner; the deploy stops if it fails.
- `npm run db:migrate` (`scripts/migrate.ts`, bundled into `build/migrate.mjs` by `npm run build`): the schema and
  the one-time data migrations. On Easel the running app connects as a role that can read and write rows but not
  change tables, so it only checks the schema is in place (`MIGRATE_DATABASE_URL` set) and refuses to start if not.
  Elsewhere (local, tests) the server still applies the schema itself.

## Setup (once)

1. **Register the app:** a PR to duplocloud-infrastructure adding this to `config/exttenant/schools.tfvars` (copy
   #143, North Cedar's), with Luke Shepard as reviewer. He approves and applies it, which creates dev:
   ```hcl
   # New Village Academy (Annapolis): Village Partners, the partnership CRM
   nva = {
     apps = {
       partners = {
         repo = "playlab-education/nva-crm-build-easel" # lowercase: the image repo is named after it
         db   = "partners" # Postgres, as DATABASE_URL; no s3: the app stores no files
       }
     }
   }
   ```
2. **Org admin, on GitHub:** give the `playlab-education` GitHub App access to this repo (before the apply), and
   give the repo the `DUPLO_TOKEN` org secret (and `DUPLO_HOST`, if it is limited to selected repos).
3. **Playlab staff:** register Village Partners at Playlab's **Admin → OpenID Clients** with these redirect URIs,
   and link NVA's Playlab organization (only its members can sign in):
   - `https://partners-nva.labschools.ai/auth/callback`
   - `https://partners-nva.dev.labschools.ai/auth/callback`
   - `http://localhost:5173/auth/callback`
4. **Set the GitHub variables and secrets** below (repo level for both environments, or on the `exdnva` / `extnva`
   environments for one).
5. **Push to `main`.** That deploys dev. Until the infra apply has run, pushes only run the tests: the apply sets
   this repo's `EXTAPP_SCHOOL` variable, and the deploy job waits for it.

## Settings

The platform sets `PORT`, `APP_URL`, `DATABASE_URL`, `MIGRATE_DATABASE_URL` and `PGSSLMODE`. Everything else is a
GitHub variable or secret on this repo:

| Name | Kind | Value |
|---|---|---|
| `PLAYLAB_URL` | variable | `https://www.playlab.ai` |
| `PLAYLAB_CLIENT_ID` | variable | from Playlab's OpenID Clients page |
| `PLAYLAB_CLIENT_SECRET` | secret | from the same page |
| `BOOTSTRAP_ADMIN_EMAIL` | variable | the first admin's email (their Playlab account's). Ignored once an admin exists |
| `PLAYLAB_API_KEY` | secret | the organization API key for the AI (see `docs/playlab-app.md`) |
| `PLAYLAB_PROJECT_ID` | variable | the Playlab app behind the AI ("CRM Chat") |
| `PLAYLAB_INSTRUCTIONS_IN_APP` | variable | `true` |
| `EMAIL_TOKEN_KEY` | secret | `openssl rand -base64 32`, for connecting mailboxes. Keep it: changing it disconnects them |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | secrets | optional: Gmail, redirect URI `<APP_URL>/app/admin/email/callback` |
| `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID` | secrets / variable | optional: Outlook, same redirect URI |
| `EXA_API_KEY` | secret | web search for new partners (Connections, and the admin assistant's search_web) |

Never set `DEMO_LOGIN`, `SEED_DEMO` or `PGLITE_DIR` on Easel. `MCP_CONNECTOR` stays unset (see below).

## Signing in

With `PLAYLAB_URL`, `PLAYLAB_CLIENT_ID` and `PLAYLAB_CLIENT_SECRET` set, `/login` offers only **Sign in with
Playlab** (`app/lib/playlab-sign-in.server.ts`) and passwords are off. Accounts stay invite-only: an admin adds
the person's email and role in Settings → Staff accounts; their first sign-in with a Playlab account that has that
verified email links the two (`users.playlab_id`), and later sign-ins match on that link. Unknown or unverified
emails, deactivated accounts and Playlab users marked as students are turned away. Removing someone from NVA's
Playlab organization, or deactivating them here, ends their access. Locally, without those values, email and
password (and the demo buttons with `DEMO_LOGIN`) still work.

## Data leaving AWS

- **Playlab API** (the AI): Playlab itself.
- **Gmail / Outlook** (optional): NVA's own mailboxes, through OAuth; email subjects and snippets are stored in Aurora.
- **Exa** (web search for new partners, kept by decision on 2026-10-28): only the admin's search words go out, and
  only for admins. Results are public web pages; leads are saved in Aurora as suggestions until an admin adds them.
- **MCP connector:** off. It would send directory data to each person's own Claude or ChatGPT account, which the
  approved subprocessors don't cover. `MCP_CONNECTOR=true` turns it back on; that's a decision for NVA and Playlab.
- Fonts are served by the app itself (Fontsource), not Google.

Logs go to Playlab's New Relic account; the app logs error names, never people's details.

## Moving the existing data

The first version ran on Vercel with a Neon database. To bring real records over: on the VPN, with the owner
credentials from the `partners-db` secret, run `pg_dump --data-only` from Neon and restore into the Easel database
after the first deploy has run `db:migrate`. Then delete the Neon database and the Vercel project, and archive the
old public `Ethan-Castro1/NVA-Partnership-CRM` repo.
