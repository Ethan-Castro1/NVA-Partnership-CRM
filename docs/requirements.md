# Village Partners: Application Refinements and Development Requirements

Source: New Village Academy, October 2026. Condensed faithfully from NVA's requirements document; section numbers match the original.

## Overview
Two purposes in one app, one shared database:
- **Community Resource Directory:** NVA teachers and staff quickly find community members, volunteers, organizations and professionals who can support classroom learning, CAPs, internships, school events and other activities.
- **Partnership Management CRM:** NVA's partnership administrator builds and maintains relationships, manages contacts, documents conversations, follows up on opportunities, communicates with stakeholders and tracks partnership activity.

Entry points: the public sign-up page (/join), manual entry by the administrator (including funders and people who never used the form), and staff. Improve, do not rebuild. Preserve People, Connections, CAPs, Ask the Village, the public Join page and other working features. Review code, schema, auth, permissions and workflows first; reuse what works.

## 1. Roles and dashboards
Two internal roles only: **Administrator** and **Staff** (teachers, facilitators, counselors and other employees use Staff). Users land on the right dashboard at sign-in. More than one administrator is allowed.

### A. Administrator dashboard
Full app: directory and CRM. Prioritizes relationship management, follow-ups and partnership activity.
Navigation: Dashboard, Ask the Village, People & Organizations, Connections, Opportunities, Follow-ups, Staff Requests, CAPs, Communications, Community Sign-ups, Settings.
Overview shows actionable items: follow-ups due today; overdue follow-ups; upcoming follow-ups; contacts awaiting responses; recent contact activity; open partnership opportunities; staff requests requiring assistance; new community sign-ups awaiting review; upcoming confirmed engagements.
Quick actions: add a contact, record an interaction, create a follow-up, draft an email, review a staff request. Admin also has every staff search feature.

### B. Staff dashboard
Simple; find a resource quickly; no CRM pipelines.
Navigation: Dashboard, Ask the Village, Browse People & Skills, My Requests, CAPs, My Connections.
Most prominent: a search box, "What do you need help with?", with examples:
- Find someone to teach students basic carpentry.
- Find a guest speaker who works in healthcare.
- Find volunteers for an upcoming school event.
- Find a community organization that supports environmental education.
- Find someone who could host students for internships.
Below: my open requests; upcoming confirmed engagements; my CAPs (where applicable); recently added community resources; saved contacts or resources.
Designed around **Search → Connect → Arrange**. Staff never see CRM fundraising records, administrative relationship notes, email inboxes or internal opportunity pipelines.

## 2. Community resource search
Preserve and improve Ask the Village and People search. Everyday language, not exact keywords. Searchable: skills and expertise; professional background; organization; ways willing to help; relevant CAPs; volunteer interests; internship opportunities; location (where available); availability (where available).
Results show **why** someone matches. Example: "I need someone who can teach students about financial literacy" → community member with a banking background who indicated interest in teaching practical skills.
Each result: **View Profile, Contact, Request Introduction, Save Resource.** Contact vs Request Introduction depends on the contact's permissions and relationship settings. Staff see only contacts approved for the shared resource directory.

## 3. Staff requests
Separate from the administrator's opportunity pipeline. Short form: what they need; brief description; relevant CAP or school activity (optional); preferred date or timeframe; number of volunteers/participants (optional); specific contact of interest (optional). The administrator receives it.
Statuses: **Open** (submitted / looking for support), **Arranged** (someone agreed, arrangements confirmed), **Completed** (took place), **Canceled** (no longer needed).
Staff see and update their own requests. The administrator sees all requests, can assist, assign resources and update statuses.
Direct contact vs introduction is set on the contact profile. An introduction request appears on the admin dashboard as needing attention.
When staff mark an engagement Completed, the activity is added to the contact's history, with an optional short note. Teachers never do detailed CRM documentation.

## 4. CRM contact management
Categories (multiple per contact): community volunteers; guest speakers; practical skills instructors; internship hosts; CAP partners; community organizations; funders and prospective funders; businesses and corporate partners; government representatives; other stakeholders.
**Quick entry:** name, organization, email or phone, short notes; everything else optional; then assign a follow-up date. Example note: "Met at the community reception. Interested in supporting internships. Asked me to send more information next week."
**Profile:** name and contact info; organization and title; categories; skills and ways they can help; how the relationship originated; relationship owner; relationship status; visibility settings; conversation history; related opportunities; follow-up tasks; related staff requests; previous engagements. Contacts remain after opportunities complete. **Duplicate detection** prevents multiple records for the same person.

## 5. Opportunity tracking
Per opportunity, not per relationship. Stages: **Not Contacted, Contacted, Committed, Completed, Closed/Declined, Canceled.** One person can have many opportunities (e.g. completed a workshop, committed to a future CAP, discussing an internship). Never change the person's overall relationship status automatically when an opportunity changes. Funding prospects may need other stages (proposal submitted, awarded, declined); don't force funding into the engagement workflow.

## 6. Follow-ups and tasks (one of the most important improvements)
Task: contact; action needed; due date; assigned owner; related opportunity (optional); status Open or Completed. Example: Contact Jordan Smith, "Send information about internship opportunities", due October 22. Tasks appear on the admin dashboard.
Views: **Overdue, Due Today, Upcoming, Completed, Awaiting Response.** From the dashboard: mark complete, reschedule, create another follow-up. Reminders inside the app only; **no reminder emails.** Open the app and immediately see what needs attention.

## 7. Contact and communication history
Chronological history per contact. Entries: contact created; community sign-up submitted; email sent; email received; phone conversation; meeting; note added; follow-up scheduled; opportunity updated; volunteer engagement completed. The admin adds manual notes and activity. Email history populates automatically once an authorized email account is connected. Keep manual notes visibly distinct from verified email activity.

## 8. Email integration
Admin connects an NVA email account with provider-supported auth (OAuth). Never store email passwords.
Features: compose from contact profiles; send through the connected account; view previous emails with a contact; associate emails with contacts; record sent emails in history; create follow-ups after sending. Staff never access the admin inbox or private email history.
**AI drafting** from a contact: Draft Introduction, Thank-you, Follow-up, Meeting Request, Partnership Invitation, Funding Follow-up. Uses stored information only: name and organization, previous interactions, meeting notes, opportunities, authorized email conversations, the purpose. Draft is editable. **Never sent automatically**; every message needs explicit review and approval. Never invent details or commitments. If integration needs credentials or provider configuration not yet available, identify the requirements rather than simulating.

## 9. Public community sign-up
Preserve /join. Members indicate contact info; organization; skills and expertise; ways to contribute; interest in volunteering, mentoring, internships, guest speaking or practical skills sessions; availability; anything else. Submissions go to an **admin review queue**: review, approve, edit or reject. Approved members can become searchable for staff, subject to consent and visibility. Public submissions never automatically expose private contact details to all users. Review checks for existing records so a submission can update or link to an existing person instead of duplicating.

## 10. Permissions (enforced at the database and API level; hiding UI is not enough)
| Capability | Admin | Staff |
|---|---|---|
| Search approved community resources | Yes | Yes |
| Use Ask the Village | Yes | Yes |
| View approved resource profiles | Yes | Yes |
| Submit resource requests | Yes | Yes |
| Manage own requests | Yes | Yes |
| See all staff requests | Yes | No |
| Add and manage all CRM contacts | Yes | No |
| Manage opportunity pipelines | Yes | No |
| View private relationship notes | Yes | No |
| Manage follow-up tasks across CRM | Yes | No |
| Access connected administrator email | Yes | No |
| Use CRM AI email drafting | Yes | No |
| Review public sign-ups | Yes | No |
| Manage user accounts and settings | Yes | No |
Staff see only their own requests unless a collaboration is explicitly shared. The admin decides whether a contact is visible in the staff directory and whether staff can contact them directly.

## 11. Shared data: example flows
1. **Community volunteer:** carpenter signs up → admin approves → searchable by staff → teacher searches woodworking → contacts or requests intro → workshop arranged → teacher marks Completed → appears in the carpenter's history. Teacher never touches the pipeline.
2. **Funder:** admin meets a foundation rep → adds to CRM → prospective funder → meeting notes + follow-up → AI drafts email → reviewed and sent → history updated → funding opportunities managed. Funder hidden from staff unless the admin approves visibility.
3. **Principal needs volunteers:** principal uses the Staff dashboard → searches event volunteers → sees approved resources → contacts a volunteer or requests an intro → arranged and completed → added to shared history. No separate principal dashboard.

## 12. Development sequence
1. Role-based experience: confirm auth and permissions; distinct Admin and Staff dashboards; role-based navigation; preserve search, directory, connections and CAPs; keep users and data intact.
2. Core CRM: streamlined entry; categories and visibility; opportunity stages; contact history; follow-up tasks; dashboard indicators.
3. Staff workflow: requests; tracking; contact and introduction actions; automatic engagement history; links between requests and the CRM.
4. Email and AI: secure connection; communication history; drafting and sending; AI personalized drafts; follow-ups from email.
5. Testing: realistic scenarios for both experiences. Staff find and contact resources quickly; staff cannot access private CRM records; admin tracks relationships end to end; completed staff engagements update histories; public submissions enter review; email respects permissions; AI drafting is accurate; desktop and mobile both work.

## 13. Technical requirements
Inspect the code; identify what's satisfied, what needs modification, what's new. Map the schema; plan migrations; preserve contacts, CAP associations, relationships and sign-ups. Reuse components and patterns. Server-side authorization. No unnecessary dependencies or duplicate systems. No placeholders or mock data replacing working features. Identify external services and credentials for email. Plan before major architecture changes; per phase, identify changes, implement, test before moving on.

## Vision
Staff: find someone who can help, make a connection, arrange the support. Admin: capture relationships, manage opportunities, track conversations, follow up, communicate, preserve institutional knowledge. Community: offer skills, time and resources through an accessible sign-up form. Less administrative work for NVA staff.
