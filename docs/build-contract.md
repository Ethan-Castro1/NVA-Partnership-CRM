# Build contract: Village Partners requirements (Phases 1 to 5)

This is the single source of truth for every agent working on `docs/requirements.md`. If this file and the
code disagree, this file wins; if this file is silent, follow existing code patterns (read `AGENTS.md`).
`docs/requirements-plan.md` and `docs/requirements-analysis.json` hold the earlier analysis (background only).

## 0. Owner decisions (defaults accepted)
1. **Who staff see at first:** active contacts who are not funders and have no pending sign-up, plus board and
   staff (inner circle). These start `contact_mode='direct'`. Everything new starts hidden with `'introduction'`.
2. **Staff logging:** staff can record only lessons, volunteering, internships and guest talks, and only on
   people they can see. Calls, meetings, notes and emails are admin-only history.
3. **Live demo:** `OPEN_ACCESS` is removed. Demo mode (`DEMO_LOGIN=true`, or `SEED_DEMO=true`) shows
   "Continue as Administrator / Continue as Staff" buttons on `/login` that create real sessions.
   Existing connector keys and chats are NOT deleted automatically (the owner decides).
4. **Email:** Google Workspace first (Gmail API), Microsoft 365 also supported. Sync stores subject and snippet
   only (no bodies), last 12 months, only threads with known contacts. Email features refuse in demo mode.
5. **Funding stages:** identified, cultivating, proposal_submitted, awarded, declined, canceled.
6. **Staff extras:** "My Connections" = people the staff member saved, requested or worked with. Staff keep
   connector keys (tools are role-scoped). Web search for new leads is admin-only.

## 1. Global rules (every agent)
- Never weaken server-side authorization. Every loader/action/resource route checks the role and, for any
  `personId` a staff member supplies or receives, that the person is staff-visible. Hiding UI is not enough.
- Staff never receive in loader data, action data, AI tool output, or MCP output: `people.notes`,
  `people.funding_focus`, `people.origin`, `people.owner_user_id`, `people.source`, admin-visibility history,
  opportunities, follow-ups, email data, other users' requests, hidden people (including as intro-path nodes),
  intake submissions, web leads, CSV export, or any search ranking computed from private fields.
- Contact details (email, phone) reach staff only when the person is visible AND `contact_mode='direct'`.
- Every user-facing string goes through `t()` with EN and ES. **No em dashes** in copy. Keep copy short; the owner
  wants it simple, not over-explained. Brand rules in `AGENTS.md` (gold is the single accent; one gold `brand`
  button per screen at most, always a CRM action).
- Dates: "today" for the school is `schoolToday()` (America/New_York) from `app/lib/dates.ts`, passed into SQL as a
  parameter. Never compare against SQL `CURRENT_DATE`.
- Keep `npx tsc --noEmit -p .` and `npx vitest run` green for your files. Add tests for server logic you add.
- Do not install packages unless this contract says so. Do not commit, push, or touch Vercel.
- Local server per agent (never use the default `.data/pglite` or port 5173):
  `PGLITE_DIR=/tmp/nva-<unit> npm run seed -- --reset && PGLITE_DIR=/tmp/nva-<unit> DEMO_LOGIN=true npx react-router dev --port <port>`
  Sign in with curl: `curl -c jar -b jar -X POST localhost:<port>/login -d "intent=demo&role=staff"` (or `role=admin`).
  Stop your server when done.

## 2. Roles and auth (Foundation F1)
- `ROLES = ["admin", "staff"]` in `app/lib/constants.ts`. Migration renames `teacher` to `staff` (guarded DO block on
  `users_role_check`, idempotent; tested twice on PGlite). Do not rename `caps.teacher` (a teacher's name field).
- `app/lib/auth.server.ts`: delete `OPEN_ACCESS` behavior entirely. Add `export const DEMO_LOGIN =
  process.env.DEMO_LOGIN === "true" || process.env.SEED_DEMO === "true"` and `demoLogin(request, role)` that starts
  a session for the demo account of that role (seeded `admin@nva.test` Ashley, `teacher@nva.test` renamed to
  "Taylor", role staff). `requireAdmin` returns a 403 Response whose page offers a link back to `/app`.
- `package.json` `dev` script: `DEMO_LOGIN=true react-router dev` (no `OPEN_ACCESS`).
- `/login` (`app/routes/login.tsx`): when `DEMO_LOGIN`, show two buttons above the form ("Continue as Administrator",
  "Continue as Staff"); form posts `intent=demo&role=admin|staff`. After any sign-in, go to `safeNext(next)` only if
  `canAccessPath(role, next)`, else `/app`.
- `/app` (index) renders `AdminDashboard` or `StaffDashboard` by role (one route, role decides).

## 3. Permissions API (Foundation F1): `app/lib/permissions.server.ts`
```ts
export type Viewer = Pick<SessionUser, "id" | "role">;
export const isAdmin: (v: Viewer) => boolean;
/** SQL boolean: the person row (alias) is visible in the staff directory. */
export function staffVisibleSql(alias = "p"): string; // `(p.directory_visible AND p.status <> 'inactive')`
export async function canViewPerson(viewer: Viewer, personId: string, db?: Queryable): Promise<boolean>; // admin: exists
export async function requireVisiblePerson(viewer: Viewer, personId: string): Promise<void>; // throws 404 Response
export function canAccessPath(role: Role, path: string): boolean; // staff: false for /app/admin*, /app/opportunities*, /app/follow-ups*, /app/communications*, /app/organizations*
export async function requireAdminViewer(request: Request): Promise<SessionUser>; // alias of requireAdmin
```

## 4. Schema (Foundation F1): append to `SCHEMA_SQL`, idempotent, PGlite + Neon
Order: new CREATE TABLEs first, then ALTERs that reference them. One-time backfills run in
`app/lib/migrations.server.ts` (`runDataMigrations()`, called from `ensureDatabase()` after `SCHEMA_SQL`), each guarded by
`INSERT INTO app_meta (key) VALUES ($1) ON CONFLICT DO NOTHING RETURNING key` inside a transaction.

**people (new columns):**
`directory_visible BOOLEAN NOT NULL DEFAULT FALSE`, `contact_mode TEXT NOT NULL DEFAULT 'introduction'`
(`direct|introduction`, checked in app code), `categories TEXT[] NOT NULL DEFAULT '{}'`, `owner_user_id TEXT REFERENCES
users(id) ON DELETE SET NULL`, `origin TEXT` (how the relationship began, admin-only), `shared_summary TEXT` (admin-written,
staff-visible), `location TEXT` (town or neighborhood, public form + admin), `approved_at TIMESTAMPTZ`.
Indexes: `(directory_visible, status)`, `(owner_user_id)`.
`notes` = private admin notes (no data move). `funding_focus` = admin-only.

**engagements (becomes the unified contact history):** drop `engagements_kind_check` (kinds checked in app code);
add `origin TEXT NOT NULL DEFAULT 'manual'` (`manual|system|email|staff_request`), `visibility TEXT NOT NULL DEFAULT 'admin'`
(`admin|staff`), `opportunity_id`, `follow_up_id`, `staff_request_id`, `email_message_id` (all `TEXT REFERENCES ... ON DELETE
SET NULL`), `meta JSONB NOT NULL DEFAULT '{}'`. Partial unique index on `(staff_request_id, person_id) WHERE staff_request_id IS NOT NULL`.

**opportunities:** `id, person_id REFERENCES people ON DELETE CASCADE, organization_id REFERENCES organizations ON DELETE SET NULL,
track TEXT NOT NULL DEFAULT 'engagement', kind TEXT NOT NULL DEFAULT 'other', title TEXT NOT NULL, stage TEXT NOT NULL,
amount TEXT, target_date DATE, cap_id REFERENCES caps ON DELETE SET NULL, owner_user_id REFERENCES users ON DELETE SET NULL,
notes TEXT, created_by, created_at, updated_at, closed_at TIMESTAMPTZ`. Index `(stage)`, `(person_id)`.

**follow_ups:** `id, person_id NOT NULL REFERENCES people ON DELETE CASCADE, opportunity_id REFERENCES opportunities ON DELETE SET NULL,
action TEXT NOT NULL, due_on DATE NOT NULL, owner_user_id REFERENCES users ON DELETE SET NULL, status TEXT NOT NULL DEFAULT 'open'
(open|completed|canceled), awaiting_response BOOLEAN NOT NULL DEFAULT FALSE, completed_at, completed_by, created_by, created_at, updated_at`.
Index `(status, due_on)`, `(person_id)`.

**staff_requests:** `id, requester_id NOT NULL REFERENCES users, kind TEXT NOT NULL DEFAULT 'resource' (resource|introduction),
need TEXT NOT NULL, description TEXT, cap_id REFERENCES caps ON DELETE SET NULL, activity TEXT, preferred_date DATE,
timeframe TEXT, participant_count INT, status TEXT NOT NULL DEFAULT 'open' (open|arranged|completed|canceled),
response TEXT (admin reply, visible to requester), completed_note TEXT, assigned_to REFERENCES users ON DELETE SET NULL,
completed_at, created_at, updated_at`. Index `(requester_id, status)`, `(status, created_at)`.
**staff_request_people:** `request_id REFERENCES staff_requests ON DELETE CASCADE, person_id REFERENCES people ON DELETE CASCADE,
role TEXT NOT NULL DEFAULT 'interest' (interest|assigned), added_by, created_at, PRIMARY KEY (request_id, person_id)`.

**saved_resources:** `user_id REFERENCES users ON DELETE CASCADE, person_id REFERENCES people ON DELETE CASCADE, note TEXT,
created_at, PRIMARY KEY (user_id, person_id)`.

**intake_submissions:** drop `intake_submissions_status_check`; statuses `new|approved|rejected|archived` (legacy `reviewed` is
migrated to `approved`); add `matched_person_id TEXT REFERENCES people ON DELETE SET NULL`, `decision_note TEXT`,
`edited_payload JSONB`, `decided_by TEXT REFERENCES users ON DELETE SET NULL`, `decided_at TIMESTAMPTZ`. `person_id` is set when
approved (or already set on legacy rows).

**email (U6 owns code; F1 creates tables):** `email_accounts(id, provider google|microsoft, email_address, connected_by, scopes TEXT[],
refresh_token_enc TEXT NOT NULL, key_version INT DEFAULT 1, sync_cursor TEXT, last_synced_at, status active|needs_reconnect|disconnected,
last_error, created_at, updated_at)`, `email_messages(id, account_id, provider_message_id, thread_id, direction sent|received,
from_address, to_addresses TEXT[], cc_addresses TEXT[], subject, snippet, sent_at, sent_via_app BOOL, sent_by, created_at,
UNIQUE(account_id, provider_message_id))`, `email_message_people(message_id, person_id, PRIMARY KEY)`, `email_drafts(id, person_id,
author_id, purpose, subject, body, ai_generated BOOL, facts_used JSONB, flags JSONB, status draft|sent|discarded, email_message_id,
created_at, updated_at)`.

**Data migrations (guarded keys):**
- `roles_v1`: (DO block in SCHEMA_SQL is fine instead).
- `visibility_v1`: `directory_visible=TRUE, contact_mode='direct'` where (`status='active'` AND NOT `'funder' = ANY(contribution_types)`
  AND no `intake_submissions` row with status 'new' for that person) OR `affiliations && ARRAY['board','staff']`.
  Also `approved_at = created_at` for those.
- `categories_v1`: map `contribution_types` and organization kind to `categories` (see §5 mapping).
- `history_v1`: `visibility='staff'` for kinds lesson, volunteer, internship.
- `intake_status_v1`: `UPDATE intake_submissions SET status='approved' WHERE status='reviewed'`.

## 5. Vocabularies (Foundation F1): `app/lib/constants.ts`
- `CONTRIBUTION_TYPES` add `guest_speaker`, `mentoring` (colors: reuse brand tokens; icons where a Record needs them).
  `PUBLIC_CONTRIBUTION_TYPES` = skills_lesson, classroom_volunteer, guest_speaker, mentoring, after_school, internship, other.
- `CONTACT_CATEGORIES` = volunteer, guest_speaker, skills_instructor, internship_host, cap_partner, community_org, funder,
  prospective_funder, business, government, other. Mapping for `categories_v1`: skills_lesson→skills_instructor;
  classroom_volunteer|after_school|mentoring→volunteer; guest_speaker→guest_speaker; internship→internship_host;
  cap_partner→cap_partner; funder→funder; org kind business→business, government→government, nonprofit|faith|education|health→community_org.
- `CONTACT_MODES` = direct, introduction.
- `HISTORY_KINDS` (replaces/extends `ENGAGEMENT_KINDS`): lesson, volunteer, internship, guest_speaker, meeting, call, note, email_sent,
  email_received, contact_created, signup_submitted, signup_approved, follow_up_scheduled, follow_up_completed,
  opportunity_updated, engagement_completed, request_update. `ADMIN_LOGGABLE_KINDS` = lesson, volunteer, internship, guest_speaker,
  meeting, call, note, email_sent, email_received. `STAFF_LOGGABLE_KINDS` = lesson, volunteer, internship, guest_speaker.
  Staff-visible kinds by default: lesson, volunteer, internship, guest_speaker, engagement_completed.
- `OPPORTUNITY_TRACKS` = engagement, funding. `ENGAGEMENT_STAGES` = not_contacted, contacted, committed, completed, closed_declined,
  canceled. `FUNDING_STAGES` = identified, cultivating, proposal_submitted, awarded, declined, canceled.
  `OPPORTUNITY_KINDS` engagement: guest_speaker, skills_lesson, volunteering, internship, cap_partner, event, mentoring, other;
  funding: grant, donation, sponsorship, in_kind. Open stages (for "open opportunities"): not_contacted, contacted, committed,
  identified, cultivating, proposal_submitted.
- `FOLLOW_UP_STATUSES` = open, completed, canceled. Views: overdue, today, upcoming, awaiting, completed.
- `REQUEST_STATUSES` = open, arranged, completed, canceled. `REQUEST_KINDS` = resource, introduction.
- `INTAKE_STATUSES` = new, approved, rejected, archived.
- i18n labels for every vocabulary value live in `app/i18n/common.ts` (F1 adds them).

## 6. Shared server modules (Foundation)
F1:
- `app/lib/dates.ts`: `schoolToday(now?)` (YYYY-MM-DD in America/New_York), `addDays(iso, n)`.
- `app/lib/history.server.ts`: `recordHistory(entry, db?)` inserts into `engagements` with explicit origin/visibility and
  NEVER changes `people.status` unless `entry.promoteStatus === true`. `listHistory(personId, viewer)` (staff: only
  `visibility='staff'`, no author names of admins needed). Keep `logEngagement` as a thin wrapper used for manual logging.
- `app/lib/people.server.ts` viewer-scoped (required `viewer` param on every read): `searchPeople(filter, viewer)`,
  `getPerson(id, viewer)` returning `PersonView` (admin fields only for admins), `getPeopleByIds(ids, viewer)`,
  `getRelationships(personId, viewer)`, `findIntroPaths(id, viewer)`, `findConnectorsForNeed(input, viewer)`,
  `getNetwork(viewer)`, `getCounts(viewer)`. Staff: rows filtered by `staffVisibleSql`, no scoring on notes/funding_focus/origin,
  email/phone null unless `contact_mode='direct'`, intro-path graph built only from staff-visible people.
  Update every caller so the app compiles and keeps working.
- `app/lib/duplicates.server.ts`: `findDuplicates({ full_name, email, phone, organization_name }, { excludeId? })` →
  ranked candidates with reasons (same email; same last-10 phone digits; same name + same organization; same name only).
- `app/lib/connections.server.ts` `getVillageMap(viewer)`: cache per role.
- AI/MCP: `ToolContext = { user: SessionUser }`; tools filter by role through the same people functions; staff get no
  `search_web`. (Deeper assistant work is U7.)
F2:
- `app/lib/search-language.ts` (pure, tested): turns everyday questions ("Find someone to teach students basic carpentry",
  "a guest speaker who works in healthcare", "volunteers for an upcoming school event", "organization that supports
  environmental education", "host students for internships", "teach financial literacy") into `{ terms, contributionTypes,
  categories }` with stopwords and a synonym map (carpentry→woodworking, construction; healthcare→health, nursing, medicine,
  hospital; financial literacy→banking, finance, budgeting, credit; environment→environmental, bay, watershed, oysters, etc.).
  `searchPeople` uses it, and returns `reasons: MatchReason[]` (`{ kind: "skill"|"offers"|"cap"|"organization"|"title"|"bio"|"location"|"availability", value }`)
  computed only from fields the viewer may see. UI renders reasons as "Why: banking background; offers practical skills".
- `app/lib/saved.server.ts` + resource route `app/routes/app.saved.ts` (POST toggle save; visible people only).
- `app/components/resources/resource-actions.tsx`: `<ResourceActions person={{ id, full_name, email, phone, contact_mode }} saved
  compact? />` renders View Profile, Contact (mailto/tel, only when direct and details present), Request Introduction (link to
  `/app/requests/new?person=<id>&intro=1`, shown when mode is introduction or details are missing), Save/Saved (fetcher to
  `/app/saved`). i18n namespace `resources`.

## 7. Routes (final map) and owners
Public (unchanged): `/`, `/home`, `/join` (U5 edits the form), `/join/thanks`, `/login` (F1), `/mcp/:key` (U7).
Staff and admin: `/app` (U1 dashboards), `/app/ask` (U7), `/app/people` (U2a; staff = "Browse People & Skills"),
`/app/people/:personId` (U2b; staff variant), `/app/caps*` (U7 guards), `/app/requests` + `/app/requests/new` +
`/app/requests/:requestId` (U4), `/app/my-connections` (U4), `/app/saved` (F2), `/app/account`, `/app/connect`.
Admin only: `/app/people/new` (U2a quick add), `/app/people/:personId/edit` (U2b), `/app/organizations` + `/:orgId` (U2a),
`/app/connections` (U7; staff may also use it, scoped), `/app/opportunities` + `/new` + `/:opportunityId` (U3),
`/app/follow-ups` (U3), `/app/follow-ups/action` resource route (U3), `/app/admin/requests` (U4), `/app/communications` (U6),
`/app/admin/intake*` (U5), `/app/admin/settings` + `/app/admin/settings/email` + `/app/admin/email/connect/:provider` +
`/app/admin/email/callback` + `/app/people/:personId/email` (U6), `/app/admin/users` (existing), `/app/admin/export.csv`
(existing), `/app/admin` (U1: redirect to `/app`).
Navigation (U1):
- Admin: Dashboard, Ask the Village, People & Organizations, Connections, Opportunities, Follow-ups, Staff Requests,
  CAPs, Communications, Community Sign-ups, Settings.
- Staff: Dashboard, Ask the Village, Browse People & Skills, My Requests, CAPs, My Connections.

## 8. Units, waves and file ownership
Only edit files you own. New files under your own folders are yours. `app/routes.ts` is edited only by the
Foundation (it registers EVERY route in §7 up front, pointing at files that units create; F1 creates minimal
placeholder route modules so the app compiles, and units replace them).

- **F1 Foundation (wave 0):** schema, migrations, constants, dates, permissions, auth/demo login + `login.tsx`, history,
  duplicates, viewer-scoped people/connections/tools/mcp signatures, `routes.ts` + placeholders, i18n registration of new
  namespaces (`crm`, `requests`, `email`, `directory`, `resources`, `settings`) with empty `defineMessages({}, {})` files,
  `common.ts` vocab labels, `auth.ts`, `demo-seed.server.ts` (new demo data below), test updates.
- **F2 Foundation (wave 0, after F1):** search-language, reasons, saved, ResourceActions (`resources.ts`).
- **U3 Opportunities and follow-ups (wave 1):** `app/lib/opportunities.server.ts`, `app/lib/follow-ups.server.ts`,
  `app/routes/app.opportunities*.tsx`, `app/routes/app.follow-ups*.ts(x)`, `app/components/crm/*` (including profile panels:
  `OpportunitiesPanel`, `FollowUpsPanel`, `FollowUpList` with complete/reschedule/new actions, `QuickFollowUpForm`), i18n `crm.ts`.
- **U4 Staff requests (wave 1):** `app/lib/requests.server.ts`, `app/routes/app.requests*.tsx`, `app/routes/app.admin.requests*.tsx`,
  `app/routes/app.my-connections.tsx`, `app/components/requests/*` (including `RequestsPanel` for a person's profile and
  `MyRequestsList` for the staff dashboard), i18n `requests.ts`.
- **U5 Sign-up review (wave 1):** `app/lib/intake.server.ts`, `app/lib/admin.server.ts` (intake parts), `app/routes/join.tsx`,
  `app/components/intake/*`, `app/routes/app.admin.intake*.tsx`, i18n `intake.ts`, `admin.ts`.
- **U6 Email, AI drafting, Communications, Settings (wave 1):** `app/lib/email/*`, `app/lib/ai/drafts.server.ts`,
  `app/routes/app.communications.tsx`, `app/routes/app.admin.settings*.tsx`, `app/routes/app.admin.email.*.ts(x)`,
  `app/routes/app.people.$personId.email.tsx`, `app/components/email/*`, i18n `email.ts`, `settings.ts`, `account.ts`.
- **U1 Dashboards and navigation (wave 2):** `app/routes/app._index.tsx`, `app/routes/app.admin._index.tsx`, `app/routes/app.tsx`,
  `app/components/app-sidebar.tsx`, `nav-*.tsx`, `app/components/dashboard/*`, i18n `dashboard.ts`, `common.ts` (nav keys only).
- **U2a Directory, quick add, organizations (wave 2):** `app/routes/app.people._index.tsx`, `app/routes/app.people.new.tsx`,
  `app/routes/app.organizations*.tsx`, `app/components/people/directory-filters.tsx`, `people-results.tsx`, `app/components/orgs/*`,
  i18n `directory.ts`.
- **U2b Contact profile and edit (wave 2):** `app/routes/app.people.$personId.tsx`, `app/routes/app.people.$personId.edit.tsx`,
  `app/components/people/{profile-sections,record-forms,person-form,intro-paths,named-select,format}.tsx`, i18n `people.ts`,
  `app/lib/people-form.server.ts`.
- **U7 Assistant, MCP, connections, CAPs (wave 2):** `app/lib/ai/*` (except drafts.server.ts), `app/routes/app.assistant.*`,
  `app/routes/app.ask.tsx`, `app/routes/mcp.$key.ts`, `app/components/assistant/*`, `app/routes/app.connections.tsx`,
  `app/components/connections/*`, `app/lib/connections.server.ts`, `app/routes/app.caps*.tsx`, `app/components/caps/*`,
  `app/lib/caps.server.ts`, i18n `assistant.ts`, `connections.ts`, `caps.ts`.

## 9. Demo data (F1, `app/lib/demo-seed.server.ts`)
Keep all current fictional people. Add so every screen has realistic content:
- Demo users: Ashley (admin@nva.test, admin), Taylor (teacher@nva.test, staff), Marisol Maestra (maestra@nva.test, staff, es),
  plus a second admin "Jordan Admin" (jordan.admin@nva.test).
- 2 to 3 hidden prospective funders (e.g. "Dana Whitfield, Program Officer, Chesapeake Youth Futures Fund (demo)") with
  private notes mentioning a "Launchpad Innovation Center" conversation, funding_focus, categories prospective_funder,
  directory_visible FALSE. One funder opportunity (funding track, cultivating) and an overdue follow-up.
- Engagement opportunities across stages; follow-ups overdue, due today, upcoming, awaiting response, completed
  (dates relative to `schoolToday()` at seed time).
- Staff requests from Taylor: one open resource request, one introduction request, one arranged with a future date, one completed
  (with an `engagement_completed` history row).
- One pending sign-up whose email matches an existing person (to exercise linking), and a carpenter sign-up (Example 1).
- Mark realistic people `contact_mode='introduction'` (some) vs `'direct'`.
For existing databases (live demo), add the new demo rows via a guarded data migration `demo_crm_v1` that runs only when
`SEED_DEMO=true` and the demo people exist.
