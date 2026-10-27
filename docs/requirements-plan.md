# Village Partners: Implementation Plan

## 1. Already in place

- **Sign-in.** Passwords are hashed, sessions are stored as hashes, there is a brute-force guard, and redirects after login are safe (`app/lib/auth.server.ts`). The role is read from the database on every request, so a role change takes effect at once.
- **More than one admin.** This already works. The app blocks an admin from demoting themselves and blocks removing the last admin (`app/lib/admin.server.ts`, `/app/admin/users`).
- **Admin pages check the role on the server.** This covers sign-up review, staff accounts, the "Needs attention" page, and the CSV export. The export leaves out notes and is protected against spreadsheet formula tricks.
- **Contact data.** People, organizations, ways to help (`contribution_types`), relationships, CAP partner stages (`cap_partners`) and activity history (`engagements`) all exist.
- **Search and AI.** Ask the Village works with an AI provider or, without one, with plain search. The connection finder, intro paths, saved chats per user, and personal connector keys all exist.
- **Engineering support.** English/Spanish wording is checked by TypeScript. Data fixes can be set to run only once (`app_meta`). Tests run on an in-memory database.

**Verified gaps:**
- The contact profile shows `notes` and `funding_focus` to every signed-in user.
- On a CAP page, any user can add, edit or remove partners, not just the CAP's owner.
- The AI tools and the connector receive only `{ userId }`, so they cannot filter by role.
- `OPEN_ACCESS=true` makes every visitor the first admin.

## 2. Phases

### Phase 1: Role-based experience

**What users see.** "Teacher" becomes "Staff". Admins and staff get different dashboards and menus.
- **Staff dashboard:** a large "What do you need help with?" box with the five example searches, then My CAPs, upcoming confirmed CAP partners, and recently added resources.
- **Admin dashboard:** today's "Needs attention" panels, recent activity, the people table, and quick actions.
- **Staff lose these powers:**
  - Logging calls, emails or notes on a contact.
  - Adding relationships.
  - Changing partners on CAPs they don't own.
  - Saving web leads as contacts.

**Data changes. No data is lost.**
- **Role rename.** A guarded one-time step drops the role CHECK, runs `UPDATE users SET role='staff' WHERE role='teacher'`, and adds a new CHECK of `('admin','staff')`. IDs, passwords, chats, keys and CAP ownership are unchanged.
- **Visibility columns.** These are moved up from Phase 2 because staff filtering needs them now:
  - `people.directory_visible BOOLEAN DEFAULT FALSE`
  - `people.contact_mode TEXT DEFAULT 'introduction'` (`direct` or `introduction`)
- **One-time fill** (see Decision 1). Mark visible anyone who is active, is not a funder, and has no pending sign-up.
- **Do not rename** the `caps.teacher` field. It holds a teacher's name, not a role.

**Code touched**
- New file `app/lib/permissions.server.ts`: `isAdmin`, `staffPersonWhere()`, `redactPersonForStaff()`, and `canAccess(role, path)`.
- `people.server.ts`: every read takes the viewer. Staff search no longer scores on `notes` or `funding_focus`.
- New `dashboard.server.ts` and two dashboard components (admin and staff).
- `navFor(role)` in the sidebar.
- `app._index`, `people._index`, `people.$personId`, `connections.tsx`, `caps.$capId.tsx`.
- AI tools: `ToolContext = { user }`, with a separate tool set per role. The connector (`mcp.server.ts`) uses the same filtering.
- Demo: remove `OPEN_ACCESS`. Add "Sign in as Admin / Staff" demo buttons that create real sessions.

**Rules enforced on the server**
- Staff loaders and tools never return hidden people, notes, `funding_focus`, source, admin activity, or the 2,000-name people picker.
- A staff user opening a hidden contact gets a 404.
- CAP partner changes require `canEditCap`.
- A staff login that points at an admin page falls back to `/app`.

**Tests.** Role-matrix tests at three levels: library functions, page loaders and actions, and the AI and connector tools. Also a test that the role migration can run twice safely.

### Phase 2: Core CRM

**What users see**
- **Quick add:** name, organization, email or phone, a note and categories, with an optional follow-up. It checks for duplicates before saving.
- **Profile:** owner, how the relationship started, status, visibility, categories, private notes vs. a shared summary, history, opportunities and follow-ups.
- **Opportunities board**, with engagement and funding shown separately.
- **Follow-ups**, with views for Overdue, Today, Upcoming, Completed and Awaiting response, and in-app reminders only.
- **Sign-up review:** approve, approve with edits, reject, or link to an existing record.

**Data changes**
- **New `people` columns:** `categories TEXT[]`, `owner_user_id`, `origin`, `shared_summary`, and `phone_digits` (generated from the phone number).
  - `categories` is filled once from `contribution_types` and organization kind.
  - The existing `notes` column becomes private admin notes, with no data move.
- **New `opportunities` table.** A `track` column (`engagement` or `funding`) decides which stages are allowed.
- **New `follow_ups` table.** "Today" is computed with `schoolToday()` (Eastern time), not the database's UTC date.
- **`engagements` becomes the single history table.**
  - Drop the kind CHECK and add `origin` (manual, system, email, staff_request), `visibility` (admin or staff), `opportunity_id`, `follow_up_id` and `meta`.
  - One-time fill: lesson, volunteer and internship rows get `visibility='staff'`.
- **Sign-ups:** `intake_submissions` gets the statuses approved, rejected and archived. Existing `reviewed` becomes `approved`.
- **Sign-ups stop changing contacts directly.** `processIntake` no longer edits existing people records. Creating, merging and linking happen in a new `approveIntake()` that the admin runs.

**Code touched**
- New files: `opportunities.server.ts`, `follow-ups.server.ts`, `history.server.ts`, `duplicates.server.ts`.
- New routes: `app.opportunities.*`, `app.follow-ups.tsx`, `app.people.quick.tsx`.
- Reworked: `app.admin.intake.$submissionId.tsx`.

**Rules.** Everything in this phase requires `requireAdmin`. Opportunity code never writes `people.status` and never calls `logEngagement`, because `logEngagement` changes the contact's status automatically.

**Tests**
- Changing a stage leaves the person's status unchanged.
- Overdue and Today are correct at 11 pm Eastern.
- Duplicate detection and merge handle conflicting rows correctly.
- A sign-up creates nothing visible until an admin approves it.

### Phase 3: Staff resource workflow

**What users see**
- Every search result shows why the person matched, plus View Profile, Contact or Request Introduction, and Save.
- **My Requests:** a short form, with statuses Open, Arranged, Completed and Canceled.
- **Admin Staff Requests queue:** introduction requests are flagged.
- **Marking a request Completed** adds an entry to the contact's history, with an optional note.

**Data changes.** New tables, so nothing existing has to move:
- `staff_requests`
- `staff_request_people`
- `saved_resources`
- `engagements.staff_request_id`, with a unique index on (request, person) so a double submit cannot log twice.

**Code touched**
- New files: `requests.server.ts`, `saved.server.ts`, `search-reasons.ts` (synonyms and why-it-matched text).
- New routes: `app.requests.*`, `app.admin.requests.tsx`, `app.my-connections.tsx`.
- A shared `ResourceActions` component used by result cards and AI answer cards.

**Rules**
- Staff can read and update only their own requests.
- Contact details are returned only when `contact_mode='direct'`, and that is decided in SQL, not in the page.
- Status changes are guarded on the server.

**Tests**
- One staff member cannot see or change another's request.
- Completion writes exactly one history entry.
- The five example searches from the spec return sensible results against the demo data.

### Phase 4: Email and AI drafting

**What users see**
- The admin connects the NVA mailbox once.
- From a contact's page the admin can view past emails, write and send, and get AI drafts for six purposes: introduction, thank-you, follow-up, meeting request, partnership invitation and funding follow-up.
- Every draft is editable and is sent only after a confirm step.
- After sending, the app offers to create a follow-up.

**Data changes**
- New `email_accounts` table. The refresh token is encrypted with AES-256-GCM, and passwords are never stored.
- New `email_messages` and `email_message_people` tables.
- Synced email is written into `engagements` with `origin='email'`, which marks it as verified.

**Code touched**
- New code in `app/lib/email/*`: encryption, message building, and provider adapters written with plain `fetch`, so no new libraries are needed.
- New `ai/drafts.server.ts`: drafts use numbered facts from the record, put a placeholder where a detail is missing, and run a check that flags any number, date, link or address not found in the record.
- New routes: `app.admin.settings.email.tsx`, connect and callback routes, and `app.people.$personId.email.tsx`.

**Rules**
- Everything here requires `requireAdmin`.
- Every email route refuses to run if `OPEN_ACCESS` is set.
- The drafting AI has no ability to send.

**Tests**
- Encryption round trip and tamper detection.
- Message encoding with Spanish accents.
- The draft check catches an invented amount.
- A staff user gets 403 on every email route.

### Phase 5: Testing

- Run the three end-to-end flows from the spec (the carpenter, the funder, and the principal) on seeded demo data, on desktop and phone.
- Run a staff "can't see private data" sweep across all of these:
  - pages and their loaders
  - actions
  - the AI tools
  - the connector
  - CSV export
  - saved chats
- Check that public sign-ups land in the review queue.
- Check that email respects permissions and that AI drafts are accurate.

## 3. Email: what the owner must supply

**Recommended: Google Workspace with an Internal app.** Most districts use Workspace. An Internal app does not need Google's verification or the paid security assessment.

1. A Workspace super admin creates a Google Cloud project under NVA's organization and turns on the Gmail API.
2. On the OAuth consent screen, choose **User type: Internal**. Scopes: `openid`, `email`, `gmail.send`, `gmail.readonly`.
3. Create an OAuth client of type **Web application**, with these redirect URIs:
   - `https://<production domain>/app/admin/email/callback`
   - `http://localhost:5173/app/admin/email/callback`
4. Send `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. We generate `EMAIL_TOKEN_KEY` and `CRON_SECRET` and set `APP_URL`, in the production environment only, never on the demo.
5. The partnership admin signs in once to connect the mailbox (a shared address such as partnerships@ is preferred).

**If NVA uses Microsoft 365 instead:**
- A single-tenant Entra app with delegated `Mail.Send`, `Mail.Read`, `offline_access` and `User.Read`.
- Tenant admin consent is required.
- Send `MS_CLIENT_ID`, `MS_CLIENT_SECRET` and `MS_TENANT_ID`. The secret expires within 24 months.

A personal @gmail.com account cannot use the Internal option.

**What ships before credentials arrive:**
- All the tables and the encryption code.
- A settings page that lists exactly which items are missing.
- Full AI drafting with Copy, Open in mail app, and "Log as sent (manual, unverified)".
- Follow-ups after sending.

Nothing is simulated.

## 4. Decisions needed

1. **Who staff see after the switch.** Default: active contacts who are not funders, not leads, and have no pending sign-up. These start as `direct`. Everything new starts hidden and set to `introduction`.
2. **Staff editing powers.** Default: from Phase 1, staff can log only lessons, volunteering and internships. Calls and notes that teachers already logged become admin-only history.
3. **Live demo.** Default: replace `OPEN_ACCESS` with the demo role buttons. Revoke all connector keys, clear sessions, and audit the user accounts.
4. **Email.** Default: Google Workspace, send plus inbox sync, storing subject and snippet only for synced mail, going back 12 months.
5. **Funding stages and categories.** Default stages: Identified, Cultivating, Proposal submitted, Awarded, Declined, Canceled. Categories are admin labels, kept separate from the "ways to help" on the sign-up form.
6. **Staff extras.** Default: "My Connections" means people the staff member has worked with, requested or saved. Staff may keep connector keys once the tools are filtered by role. Web-lead search becomes admin-only.

## 5. Risks

- **The live demo is open to anyone right now.** With `OPEN_ACCESS` on, every visitor is an admin. Accounts and connector keys that visitors created keep working after the flag is turned off, so they need to be revoked and audited. I could not read the Vercel settings, so confirm the flag is actually on in production.
- **Private data reaches staff today.** Hiding parts of the screen is not enough: pages still send notes, funder records, all emails, and the full relationship map to staff browsers. Saved AI chats may already contain private details.
- **Search side channels.** Staff can confirm what a private note says by searching for a word and seeing who ranks. Intro paths can show hidden funders as the middle link.
- **Getting the visibility fill wrong.** Too strict and the staff directory looks empty. Too loose and funders leak. Check the counts on production before deploying.
- **One-time steps must not re-run.** Every new server instance re-runs the schema at startup. Each data fill must be marked done in `app_meta`, or it will undo admin choices.
- **Public sign-ups can edit existing contacts.** A sign-up that matches an email address can currently change that contact's record and bring back a retired contact. This is fixed in Phase 2.
- **Email privacy.** Synced mail may mention students, and emails or bios may contain instructions aimed at the AI. Mitigations: snippets only, a human reviews every draft, and the draft check.
- **Breaking existing habits.** Teachers will lose some editing powers in Phase 1, so send them a short heads-up first.