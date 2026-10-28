import { createHash } from "node:crypto";

// ---------- running the schema safely (see db.server.ts runSchema) ----------

/** Any fixed number; every server start takes the same transaction-scoped lock. */
export const SCHEMA_LOCK_ID = 7_310_402_026;

let versionKey: string | undefined;
/** app_meta key that records "this database has run this exact SCHEMA_SQL". */
export function schemaVersionKey(): string {
  versionKey ??= `schema_sha256:${createHash("sha256").update(SCHEMA_SQL).digest("hex").slice(0, 32)}`;
  return versionKey;
}

/**
 * SCHEMA_SQL wrapped for one simple-protocol run, which Postgres (and PGlite)
 * treat as one implicit transaction:
 * - pg_advisory_xact_lock first, so concurrent cold starts take turns instead
 *   of deadlocking (CREATE INDEX holds ShareLock while ALTER TABLE wants
 *   AccessExclusive) or racing on CREATE TABLE (duplicate pg_type rows). The
 *   lock is released at commit, so it also works through a transaction pooler.
 * - the version key last, so it only lands if the whole schema did; older
 *   version keys are cleared.
 */
export function schemaRunSql(): string {
  const key = schemaVersionKey();
  return `SELECT pg_advisory_xact_lock(${SCHEMA_LOCK_ID});
${SCHEMA_SQL}
INSERT INTO app_meta (key) VALUES ('${key}') ON CONFLICT (key) DO NOTHING;
DELETE FROM app_meta WHERE key LIKE 'schema_sha256:%' AND key <> '${key}';
`;
}

/**
 * The whole schema, idempotent. Each server start runs it unless this database
 * already ran this exact text (see schemaRunSql), so lab school tenants need no
 * migration jobs. To change a table, add an
 * `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` line at the end rather than
 * editing a CREATE, so existing databases pick the change up too.
 *
 * This holds adults only (partners, volunteers, board, staff). Never store
 * student information here.
 */
export const SCHEMA_SQL = /* sql */ `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'es')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

-- id is the SHA-256 of the cookie token, so a database leak can't be replayed.
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other'
    CHECK (kind IN ('business', 'nonprofit', 'government', 'education', 'health', 'faith', 'other')),
  website TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS organizations_name_idx ON organizations (lower(name));

-- Everyone in the village: partners, volunteers, board members, staff, and
-- people someone referred who haven't been contacted yet (status 'lead').
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en', 'es', 'both')),
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  title TEXT,
  bio TEXT,
  -- Free-text tags, stored lowercase: e.g. {'sewing','welding','public speaking'}.
  skills TEXT[] NOT NULL DEFAULT '{}',
  -- Community Action Project themes they could support: e.g. {'environment','housing'}.
  cap_topics TEXT[] NOT NULL DEFAULT '{}',
  -- Keys from CONTRIBUTION_TYPES in app/lib/constants.ts.
  contribution_types TEXT[] NOT NULL DEFAULT '{}',
  -- Keys from AFFILIATIONS: e.g. {'board'} or {'parent','community'}.
  affiliations TEXT[] NOT NULL DEFAULT '{}',
  availability TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('lead', 'new', 'active', 'inactive')),
  source TEXT NOT NULL DEFAULT 'admin' CHECK (source IN ('intake', 'referral', 'admin', 'web', 'import')),
  notes TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS people_email_idx ON people (lower(email));
CREATE INDEX IF NOT EXISTS people_status_idx ON people (status);
CREATE INDEX IF NOT EXISTS people_org_idx ON people (organization_id);

-- Each public form submission, kept as submitted, linked to the person it created or matched.
CREATE TABLE IF NOT EXISTS intake_submissions (
  id TEXT PRIMARY KEY,
  person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  locale TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'archived')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS intake_status_idx ON intake_submissions (status, submitted_at DESC);

-- Who knows whom. Read 'knows', 'colleague', 'family' and 'other' as
-- two-way; 'referred' means person_id referred related_person_id to NVA.
CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  related_person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'knows' CHECK (kind IN ('referred', 'knows', 'colleague', 'family', 'other')),
  note TEXT,
  source TEXT NOT NULL DEFAULT 'admin' CHECK (source IN ('intake', 'admin', 'web')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (person_id <> related_person_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS relationships_pair_idx ON relationships (person_id, related_person_id, kind);
CREATE INDEX IF NOT EXISTS relationships_related_idx ON relationships (related_person_id);

-- Community Action Projects a teacher is planning or running.
CREATE TABLE IF NOT EXISTS caps (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  driving_question TEXT,
  description TEXT,
  topics TEXT[] NOT NULL DEFAULT '{}',
  needs TEXT,
  term TEXT,
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'complete')),
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cap_partners (
  cap_id TEXT NOT NULL REFERENCES caps(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  role TEXT,
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'contacted', 'confirmed', 'declined')),
  note TEXT,
  added_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cap_id, person_id)
);

-- The CRM history: lessons taught, internships hosted, calls, notes.
CREATE TABLE IF NOT EXISTS engagements (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  cap_id TEXT REFERENCES caps(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('lesson', 'volunteer', 'internship', 'meeting', 'email', 'call', 'note')),
  happened_on DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS engagements_person_idx ON engagements (person_id, happened_on DESC);

-- Leads found on the web for the connection finder. Kept apart from
-- people until someone reviews one and saves it as a contact.
CREATE TABLE IF NOT EXISTS web_leads (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  name TEXT NOT NULL,
  organization TEXT,
  role_title TEXT,
  summary TEXT,
  why_relevant TEXT,
  source_urls JSONB NOT NULL DEFAULT '[]',
  via_person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  via_note TEXT,
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'saved', 'dismissed')),
  saved_person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS web_leads_status_idx ON web_leads (status, created_at DESC);

-- Small app-wide flags (e.g. that the demo data was loaded).
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Funders: what they fund, typical amounts and deadlines, in staff's words.
ALTER TABLE people ADD COLUMN IF NOT EXISTS funding_focus TEXT;

-- Organization kinds are checked in the app (ORGANIZATION_KINDS), so new
-- kinds such as 'foundation' need no migration.
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_kind_check;

-- Saved "Ask the village" conversations, one row per chat, private to the
-- staff member who had it. messages holds AI SDK UIMessages as JSON.
CREATE TABLE IF NOT EXISTS assistant_chats (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assistant_chats_user_idx ON assistant_chats (user_id, updated_at DESC);

-- Personal keys for the MCP connector (/mcp/<key>). id is the SHA-256 of
-- the key, like sessions, so the database never holds a usable key.
CREATE TABLE IF NOT EXISTS mcp_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS mcp_keys_user_idx ON mcp_keys (user_id);

-- CAP details from the CAP Selection Guide: teacher, blocks (A meets Monday
-- and Friday, B and C Tuesday and Thursday), labels such as 'misa' or
-- 'bilingual' (CAP_LABELS), and how students might make an impact.
ALTER TABLE caps ADD COLUMN IF NOT EXISTS teacher TEXT;
ALTER TABLE caps ADD COLUMN IF NOT EXISTS blocks TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE caps ADD COLUMN IF NOT EXISTS labels TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE caps ADD COLUMN IF NOT EXISTS impact TEXT;

-- ---------- Village Partners CRM (requirements phases 1 to 5) ----------
-- New tables first, then the ALTERs that reference them. One-time data moves
-- (backfills) live in migrations.server.ts, each guarded by a key in app_meta.

-- Roles: 'teacher' became 'staff'. Databases from before still carry the old
-- check (admin, teacher); swap it once, rename the rows, and leave it alone after.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'users_role_check' AND conrelid = 'users'::regclass
       AND pg_get_constraintdef(oid) LIKE '%teacher%'
  ) THEN
    ALTER TABLE users DROP CONSTRAINT users_role_check;
  END IF;
  UPDATE users SET role = 'staff' WHERE role = 'teacher';
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check' AND conrelid = 'users'::regclass) THEN
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'staff'));
  END IF;
END $$;

-- Opportunities: one per thing someone might do (a workshop, an internship, a
-- grant), so one person can have many. Stages depend on the track
-- (ENGAGEMENT_STAGES or FUNDING_STAGES); tracks, kinds and stages are checked in app code.
CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY,
  person_id TEXT REFERENCES people(id) ON DELETE CASCADE,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  track TEXT NOT NULL DEFAULT 'engagement',
  kind TEXT NOT NULL DEFAULT 'other',
  title TEXT NOT NULL,
  stage TEXT NOT NULL,
  amount TEXT,
  target_date DATE,
  cap_id TEXT REFERENCES caps(id) ON DELETE SET NULL,
  owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS opportunities_stage_idx ON opportunities (stage);
CREATE INDEX IF NOT EXISTS opportunities_person_idx ON opportunities (person_id);

-- Follow-up tasks for the admin (reminders inside the app only, never emails).
CREATE TABLE IF NOT EXISTS follow_ups (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  opportunity_id TEXT REFERENCES opportunities(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  due_on DATE NOT NULL,
  owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open',
  awaiting_response BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  completed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS follow_ups_status_due_idx ON follow_ups (status, due_on);
CREATE INDEX IF NOT EXISTS follow_ups_person_idx ON follow_ups (person_id);

-- Staff requests ("I need a guest speaker on healthcare"), separate from the
-- admin's opportunity pipeline. Staff see only their own.
CREATE TABLE IF NOT EXISTS staff_requests (
  id TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL DEFAULT 'resource',
  need TEXT NOT NULL,
  description TEXT,
  cap_id TEXT REFERENCES caps(id) ON DELETE SET NULL,
  activity TEXT,
  preferred_date DATE,
  timeframe TEXT,
  participant_count INT,
  status TEXT NOT NULL DEFAULT 'open',
  response TEXT,
  completed_note TEXT,
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_requests_requester_idx ON staff_requests (requester_id, status);
CREATE INDEX IF NOT EXISTS staff_requests_status_idx ON staff_requests (status, created_at);

-- People on a request: the contact a teacher asked about ('interest') or the one the admin arranged ('assigned').
CREATE TABLE IF NOT EXISTS staff_request_people (
  request_id TEXT NOT NULL REFERENCES staff_requests(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'interest',
  added_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, person_id)
);
CREATE INDEX IF NOT EXISTS staff_request_people_person_idx ON staff_request_people (person_id);

-- Contacts a staff member saved for later ("Save resource").
CREATE TABLE IF NOT EXISTS saved_resources (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, person_id)
);
CREATE INDEX IF NOT EXISTS saved_resources_person_idx ON saved_resources (person_id);

-- A connected NVA mailbox (Google Workspace or Microsoft 365, OAuth). Only an
-- encrypted refresh token is kept, never a password. Sync keeps subject and
-- snippet only, for threads with known contacts.
CREATE TABLE IF NOT EXISTS email_accounts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  email_address TEXT NOT NULL,
  connected_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  refresh_token_enc TEXT NOT NULL,
  key_version INT NOT NULL DEFAULT 1,
  sync_cursor TEXT,
  last_synced_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_messages (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  provider_message_id TEXT NOT NULL,
  thread_id TEXT,
  direction TEXT NOT NULL,
  from_address TEXT,
  to_addresses TEXT[] NOT NULL DEFAULT '{}',
  cc_addresses TEXT[] NOT NULL DEFAULT '{}',
  subject TEXT,
  snippet TEXT,
  sent_at TIMESTAMPTZ,
  sent_via_app BOOLEAN NOT NULL DEFAULT FALSE,
  sent_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, provider_message_id)
);
CREATE INDEX IF NOT EXISTS email_messages_sent_idx ON email_messages (sent_at DESC);

CREATE TABLE IF NOT EXISTS email_message_people (
  message_id TEXT NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  PRIMARY KEY (message_id, person_id)
);
CREATE INDEX IF NOT EXISTS email_message_people_person_idx ON email_message_people (person_id);

-- Drafts written in the app (by hand or with AI). Never sent without an admin's explicit approval.
CREATE TABLE IF NOT EXISTS email_drafts (
  id TEXT PRIMARY KEY,
  person_id TEXT REFERENCES people(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  purpose TEXT,
  subject TEXT,
  body TEXT,
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  facts_used JSONB NOT NULL DEFAULT '[]',
  flags JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  email_message_id TEXT REFERENCES email_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_drafts_person_idx ON email_drafts (person_id, updated_at DESC);

-- people: who staff can see and contact, CRM categories, the relationship's owner and origin.
-- directory_visible: shown in the staff directory (admins decide). contact_mode: 'direct'
-- (staff see email and phone) or 'introduction' (staff ask the admin). notes, funding_focus,
-- origin and owner_user_id are admin-only; shared_summary is written by an admin for staff.
ALTER TABLE people ADD COLUMN IF NOT EXISTS directory_visible BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE people ADD COLUMN IF NOT EXISTS contact_mode TEXT NOT NULL DEFAULT 'introduction';
ALTER TABLE people ADD COLUMN IF NOT EXISTS categories TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE people ADD COLUMN IF NOT EXISTS owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE people ADD COLUMN IF NOT EXISTS origin TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS shared_summary TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS people_visible_idx ON people (directory_visible, status);
CREATE INDEX IF NOT EXISTS people_owner_idx ON people (owner_user_id);

-- engagements is now the whole contact history. Kinds (HISTORY_KINDS) are checked in app code.
-- origin: manual | system | email | staff_request. visibility: admin | staff.
ALTER TABLE engagements DROP CONSTRAINT IF EXISTS engagements_kind_check;
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS opportunity_id TEXT REFERENCES opportunities(id) ON DELETE SET NULL;
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS follow_up_id TEXT REFERENCES follow_ups(id) ON DELETE SET NULL;
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS staff_request_id TEXT REFERENCES staff_requests(id) ON DELETE SET NULL;
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS email_message_id TEXT REFERENCES email_messages(id) ON DELETE SET NULL;
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS engagements_request_person_idx ON engagements (staff_request_id, person_id)
  WHERE staff_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS engagements_visibility_idx ON engagements (visibility, happened_on DESC);

-- Sign-up review: new | approved | rejected | archived (checked in app code;
-- 'reviewed' rows become 'approved' in migrations.server.ts). person_id is set
-- once approved (legacy rows already have it); matched_person_id is an existing
-- record the reviewer linked it to.
ALTER TABLE intake_submissions DROP CONSTRAINT IF EXISTS intake_submissions_status_check;
ALTER TABLE intake_submissions ADD COLUMN IF NOT EXISTS matched_person_id TEXT REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE intake_submissions ADD COLUMN IF NOT EXISTS decision_note TEXT;
ALTER TABLE intake_submissions ADD COLUMN IF NOT EXISTS edited_payload JSONB;
ALTER TABLE intake_submissions ADD COLUMN IF NOT EXISTS decided_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE intake_submissions ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;

-- A staff request shared with colleagues (requirements section 10: "unless a collaboration is explicitly
-- shared"). They can see it, add a completion note and mark it completed; only the requester and admins
-- edit, cancel or share it.
CREATE TABLE IF NOT EXISTS staff_request_shares (
  request_id TEXT NOT NULL REFERENCES staff_requests(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shared_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, user_id)
);
CREATE INDEX IF NOT EXISTS staff_request_shares_user_idx ON staff_request_shares (user_id);

-- Sign in with Playlab: the Playlab user id an account is linked to (see playlab-sign-in.server.ts).
ALTER TABLE users ADD COLUMN IF NOT EXISTS playlab_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_playlab_id ON users (playlab_id) WHERE playlab_id IS NOT NULL;
`;
