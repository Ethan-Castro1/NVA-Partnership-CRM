/**
 * The whole schema, idempotent: it runs every time the server starts (lab
 * school tenants have no migration jobs). To change a table, add an
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
  role TEXT NOT NULL CHECK (role IN ('admin', 'teacher')),
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
`;
