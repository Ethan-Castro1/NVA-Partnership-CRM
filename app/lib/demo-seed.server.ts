/**
 * Fictional demo data. Every person and organization here is made up.
 * Used by `npm run seed` locally and by SEED_DEMO=true on a demo deployment.
 *
 * seedDemoData() fills an empty database. seedDemoCrm() adds the CRM layer
 * (more demo logins, hidden funders, opportunities, follow-ups, staff requests
 * and sign-ups to review); it also runs once on a live demo seeded before the
 * CRM existed (the demo_crm_v1 migration), so it only uses the `db` it is given.
 */
import { CATALOG_META_KEY, addDemoCapPartners, insertCatalogCaps, mapOldTopics, migrateDemoToCatalog } from "./cap-catalog.server";
import { hashPassword } from "./auth.server";
import { INNER_CIRCLE, type Affiliation, type ContributionType, type RelationshipKind, type Role } from "./constants";
import { normalizeTags } from "./constants";
import { addDays, schoolToday } from "./dates";
import { newId, query, type Queryable } from "./db.server";
import { recordHistory } from "./history.server";
import type { IntakePayload } from "./intake-types";
import { addRelationship, createPerson, logEngagement, type PersonInput } from "./people.server";

const PASSWORD = process.env.SEED_PASSWORD || "village-demo-2026";

type Seed = PersonInput & { key: string };
const P = (
  key: string,
  full_name: string,
  affiliations: Affiliation[],
  contribution_types: ContributionType[],
  rest: Partial<PersonInput>,
): Seed => ({ key, full_name, affiliations, contribution_types, status: "active", source: "admin", ...rest });

const people: Seed[] = [
  // Inner circle: board and staff.
  P("denise", "Denise Okafor", ["board"], ["cap_partner"], {
    title: "Retired nurse manager", skills: ["nursing", "public health", "mentoring"], cap_topics: ["public health"],
    bio: "Spent 30 years in community nursing; knows many people in local health care.", email: "denise.okafor@example.org",
  }),
  P("marcus", "Marcus Bell", ["board"], ["cap_partner", "internship"], {
    title: "Attorney", organization_name: "Bell & Avery Law (demo)", organization_kind: "business",
    skills: ["law", "public speaking", "mock trial"], cap_topics: ["civic engagement", "housing"], email: "marcus.bell@example.org",
  }),
  P("rosa", "Rosa Delgado", ["board", "parent"], ["skills_lesson", "internship"], {
    title: "Owner", organization_name: "Panadería Sol (demo)", organization_kind: "business", preferred_language: "both",
    skills: ["baking", "small business", "bookkeeping"], cap_topics: ["small business", "food access"],
    bio: "Runs a family bakery and is active in the Latino business network.", email: "rosa.delgado@example.org",
  }),
  P("jamie", "Jamie Torres", ["staff"], [], {
    title: "Community Action Project coordinator", organization_name: "New Village Academy", organization_kind: "education",
    skills: ["project management"], cap_topics: ["environment", "the bay"], email: "jamie.torres@example.org",
  }),
  P("priya", "Priya Raman", ["staff"], [], {
    title: "Internships coordinator", organization_name: "New Village Academy", organization_kind: "education",
    skills: ["career coaching"], email: "priya.raman@example.org",
  }),

  // Community partners.
  P("lucia", "Lucía Herrera", ["community"], ["skills_lesson", "classroom_volunteer"], {
    title: "Tailor", organization_name: "Hilo y Aguja Alterations (demo)", organization_kind: "business", preferred_language: "es",
    skills: ["sewing", "tailoring", "pattern making"], cap_topics: ["small business"], availability: "Tuesday and Thursday afternoons",
    email: "lucia.herrera@example.org",
  }),
  P("grace", "Grace Whitfield", ["community"], ["skills_lesson"], {
    title: "Quilting guild president", organization_name: "Harborside Quilters (demo)", organization_kind: "nonprofit",
    skills: ["sewing", "quilting", "textile arts"], cap_topics: ["arts & culture", "local history"], availability: "Weekday mornings",
    email: "grace.whitfield@example.org",
  }),
  P("tom", "Tom Brennan", ["community"], ["internship", "skills_lesson"], {
    title: "Welding shop foreman", organization_name: "Severn Marine Fabrication (demo)", organization_kind: "business",
    skills: ["welding", "metal fabrication", "boat repair"], cap_topics: ["the bay"], availability: "Can host 2 interns on Fridays",
    email: "tom.brennan@example.org",
  }),
  P("aisha", "Aisha Khan", ["community"], ["classroom_volunteer", "internship"], {
    title: "Software engineer", organization_name: "Bayline Software (demo)", organization_kind: "business",
    skills: ["coding", "web design", "data analysis"], cap_topics: ["transportation"], email: "aisha.khan@example.org",
  }),
  P("andre", "Andre Phillips", ["community"], ["skills_lesson", "internship"], {
    title: "Head chef", organization_name: "Dock Street Kitchen (demo)", organization_kind: "business",
    skills: ["cooking", "food safety", "restaurant management"], cap_topics: ["food access"], email: "andre.phillips@example.org",
  }),
  P("helen", "Dr. Helen Cho", ["community"], ["cap_partner", "internship"], {
    title: "Pediatrician", organization_name: "Bayview Community Clinic (demo)", organization_kind: "health",
    skills: ["medicine", "public health"], cap_topics: ["public health"], email: "helen.cho@example.org",
  }),
  P("sam", "Sam Whitaker", ["community"], ["cap_partner", "classroom_volunteer"], {
    title: "Restoration program lead", organization_name: "Severn Oyster Collective (demo)", organization_kind: "nonprofit",
    skills: ["marine biology", "water testing", "boating"], cap_topics: ["environment", "the bay"], email: "sam.whitaker@example.org",
  }),
  P("luis", "Luis Romero", ["community"], ["skills_lesson", "internship"], {
    title: "Carpenter", organization_name: "Romero & Sons Carpentry (demo)", organization_kind: "business", preferred_language: "both",
    skills: ["carpentry", "woodworking", "construction"], cap_topics: ["housing"], email: "luis.romero@example.org",
  }),
  P("kendra", "Kendra Moss", ["community"], ["skills_lesson", "classroom_volunteer"], {
    title: "Photographer", skills: ["photography", "video editing", "storytelling"], cap_topics: ["arts & culture", "youth voice"],
    email: "kendra.moss@example.org",
  }),
  P("olivia", "Olivia Grant", ["community"], ["cap_partner"], {
    title: "Urban planner", organization_name: "City Planning Office (demo)", organization_kind: "government",
    skills: ["urban planning", "maps", "public meetings"], cap_topics: ["transportation", "housing", "civic engagement"],
    email: "olivia.grant@example.org",
  }),
  P("hector", "Héctor Morales", ["parent"], ["skills_lesson", "internship"], {
    title: "Auto mechanic", organization_name: "Forest Drive Auto (demo)", organization_kind: "business", preferred_language: "es",
    skills: ["auto repair", "engines", "customer service"], email: "hector.morales@example.org",
  }),
  P("naomi", "Naomi Fields", ["community"], ["cap_partner", "classroom_volunteer"], {
    title: "Garden coordinator", organization_name: "Eastport Community Garden (demo)", organization_kind: "nonprofit",
    skills: ["gardening", "composting", "nutrition"], cap_topics: ["food access", "environment"], email: "naomi.fields@example.org",
  }),
  P("ellen", "Ellen Park", ["community"], ["classroom_volunteer", "cap_partner"], {
    title: "Reporter", organization_name: "Bay Weekly Ledger (demo)", organization_kind: "business",
    skills: ["journalism", "interviewing", "writing"], cap_topics: ["civic engagement", "youth voice"], email: "ellen.park@example.org",
  }),
  P("carmen", "Carmen Ruiz", ["community"], ["cap_partner"], {
    title: "Immigration attorney", organization_name: "Ruiz Legal Aid (demo)", organization_kind: "nonprofit", preferred_language: "both",
    skills: ["law", "immigration", "know your rights"], cap_topics: ["immigration", "civic engagement"], email: "carmen.ruiz@example.org",
  }),
  P("gloria", "Gloria Mensah", ["community"], ["cap_partner", "internship"], {
    title: "Program director", organization_name: "Homes for Harbor Families (demo)", organization_kind: "nonprofit",
    skills: ["affordable housing", "grant writing", "community organizing"], cap_topics: ["housing"], email: "gloria.mensah@example.org",
  }),
  P("deshawn", "DeShawn Carter", ["community"], ["skills_lesson", "classroom_volunteer"], {
    title: "Music producer", skills: ["music production", "audio engineering", "songwriting"], cap_topics: ["arts & culture", "youth voice"],
    email: "deshawn.carter@example.org",
  }),
  P("megan", "Megan O'Neil", ["community"], ["classroom_volunteer", "cap_partner"], {
    title: "Teen services librarian", organization_name: "Harbor Branch Library (demo)", organization_kind: "government",
    skills: ["research", "media literacy", "local history"], cap_topics: ["local history", "civic engagement"], email: "megan.oneil@example.org",
  }),
  P("tasha", "Tasha Greene", ["parent"], ["classroom_volunteer"], {
    title: "Bookkeeper", skills: ["bookkeeping", "budgeting", "tutoring"], availability: "Monday mornings", email: "tasha.greene@example.org",
  }),

  // Leads: people someone mentioned who haven't been contacted yet.
  { key: "mei", full_name: "Mei Lin", affiliations: ["community"], contribution_types: ["skills_lesson"], status: "lead", source: "referral",
    title: "Textile artist", skills: ["sewing", "embroidery", "costume design"], cap_topics: ["arts & culture"],
    notes: "Lucía says Mei designs costumes for a community theater and loves teaching." },
  { key: "paul", full_name: "Paul Avery", affiliations: ["community"], contribution_types: ["skills_lesson"], status: "lead", source: "referral",
    title: "Paramedic", skills: ["first aid", "cpr", "emergency medicine"], cap_topics: ["public health"],
    notes: "Dr. Cho's colleague; might teach a CPR lesson." },
  { key: "ray", full_name: "Ray Dominguez", affiliations: ["community"], contribution_types: ["internship"], status: "lead", source: "referral",
    title: "Electrician", organization_name: "Bright Line Electric (demo)", organization_kind: "business",
    skills: ["electrical", "solar installation"], cap_topics: ["environment"], notes: "Tom has worked with Ray on boat wiring." },
];

const links: [string, string, RelationshipKind, string][] = [
  ["denise", "helen", "colleague", "Worked together at the clinic for 10 years"],
  ["helen", "paul", "colleague", "Paramedic who brings patients to the clinic"],
  ["marcus", "olivia", "knows", "Serve on a city housing task force together"],
  ["marcus", "carmen", "colleague", "Fellow attorneys"],
  ["olivia", "gloria", "colleague", "Partner on affordable housing plans"],
  ["rosa", "lucia", "knows", "Neighbors in the same shopping center"],
  ["rosa", "andre", "knows", "Andre buys bread from Rosa's bakery"],
  ["rosa", "carmen", "referred", "Rosa sent Carmen our way"],
  ["rosa", "hector", "family", "Cousins"],
  ["lucia", "mei", "knows", "Mei rents studio space next to the shop"],
  ["lucia", "grace", "knows", "Both teach at the quilting guild"],
  ["jamie", "sam", "colleague", "Ran a creek clean-up together"],
  ["sam", "naomi", "knows", "Compost partnership with the garden"],
  ["priya", "tom", "knows", "Met at a career fair"],
  ["tom", "luis", "colleague", "Subcontract on boat interiors"],
  ["tom", "ray", "colleague", "Work together on boat wiring"],
  ["priya", "aisha", "knows", "College friends"],
  ["aisha", "kendra", "knows", "Kendra shot photos for Aisha's company"],
  ["jamie", "megan", "colleague", "Library hosts CAP research days"],
  ["megan", "ellen", "knows", "Ellen covers library events"],
  ["denise", "tasha", "knows", "Same church"],
  ["deshawn", "kendra", "colleague", "Make music videos together"],
];

/** Finds a demo login by email or creates it (password: DEMO_PASSWORD). */
async function ensureUser(
  db: Queryable,
  input: { email: string; name: string; role: Role; locale?: "en" | "es" },
): Promise<string> {
  const find = async () => (await db.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [input.email]))[0]?.id;
  const existing = await find();
  if (existing) return existing;
  await db.query(
    `INSERT INTO users (id, email, name, password_hash, role, locale) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (email) DO NOTHING`,
    [newId(), input.email, input.name, await hashPassword(PASSWORD), input.role, input.locale ?? "en"],
  );
  return (await find())!;
}

/**
 * Who staff see at first (the same rule as the visibility_v1 migration):
 * active contacts who aren't funders and have no sign-up waiting, plus board and staff.
 */
function startsVisible(person: Pick<PersonInput, "status" | "contribution_types" | "affiliations">, pendingSignup = false): boolean {
  if ((person.affiliations ?? []).some((a) => INNER_CIRCLE.includes(a))) return true;
  return person.status === "active" && !(person.contribution_types ?? []).includes("funder") && !pendingSignup;
}

/**
 * Loads the fictional demo data (people, connections, CAPs, sign-ups, the CRM
 * layer and four demo logins). Returns false and does nothing if people already exist.
 */
export async function seedDemoData(): Promise<boolean> {
  const [{ n }] = await query<{ n: number }>("SELECT count(*)::int AS n FROM people");
  if (n > 0) return false;
  const db: Queryable = { query };

  const adminId = await ensureUser(db, { email: "admin@nva.test", name: "Ashley", role: "admin" });
  const teacherId = await ensureUser(db, { email: "teacher@nva.test", name: "Taylor", role: "staff" });
  await ensureUser(db, { email: "maestra@nva.test", name: "Marisol Maestra", role: "staff", locale: "es" });

  const ids = new Map<string, string>();
  for (const { key, ...person } of people) {
    const visible = startsVisible(person);
    ids.set(
      key,
      await createPerson(
        {
          ...person,
          cap_topics: mapOldTopics(normalizeTags(person.cap_topics)),
          directory_visible: visible,
          contact_mode: visible ? "direct" : "introduction",
        },
        adminId,
      ),
    );
  }
  for (const [a, b, kind, note] of links) {
    await addRelationship({ personId: ids.get(a)!, relatedPersonId: ids.get(b)!, kind, note }, adminId);
  }

  // CAPs: this semester's real CAPs from the CAP Selection Guide, with a few demo partners.
  const capIds = await insertCatalogCaps(adminId);
  await addDemoCapPartners(capIds, teacherId);
  await query("INSERT INTO app_meta (key) VALUES ($1) ON CONFLICT (key) DO NOTHING", [CATALOG_META_KEY]);

  // Engagement history (the work itself is shared with staff; the call is admin-only).
  await logEngagement({ personId: ids.get("lucia")!, kind: "lesson", happenedOn: "2026-09-18", notes: "Taught hemming and basic machine sewing to 12 students." }, teacherId);
  await logEngagement({ personId: ids.get("tom")!, kind: "internship", happenedOn: "2026-09-26", notes: "Two 10th graders shadowed the shop for a day." }, adminId);
  await logEngagement({ personId: ids.get("sam")!, kind: "volunteer", happenedOn: "2026-10-02", notes: "Led water sampling at the creek." }, teacherId);
  await logEngagement({ personId: ids.get("ellen")!, kind: "call", happenedOn: "2026-10-08", notes: "Interested in a student journalism workshop." }, adminId);

  // Sign-ups from before the review queue: each already made a (hidden) contact.
  const signups: IntakePayload[] = [
    {
      full_name: "Jordan Ellis", email: "jordan.ellis@example.org", preferred_language: "en", organization: "Chesapeake Bike Works (demo)",
      title: "Shop owner", contribution_types: ["skills_lesson", "internship"], skills: ["bike repair", "small business"],
      cap_topics: ["transportation"], availability: "Saturdays", affiliations: ["community"], bio: "I fix bikes and want to teach teens how.",
      referred_by: { name: "Aisha Khan" }, referrals: [{ name: "Sofia Bauer", how_known: "My business neighbor", can_help_with: "Runs a print shop, could teach screen printing" }],
      consent: true,
    },
    {
      full_name: "Valeria Campos", email: "valeria.campos@example.org", preferred_language: "es", organization: null, title: "Enfermera",
      contribution_types: ["classroom_volunteer", "cap_partner"], skills: ["enfermería", "primeros auxilios"], cap_topics: ["public health", "immigration"],
      availability: "Viernes por la tarde", affiliations: ["parent"], bio: "Mamá de un estudiante de 9.º grado. Me encantaría ayudar.",
      referred_by: null, referrals: [], consent: true,
    },
  ];
  for (const payload of signups) {
    const personId = await createPerson(
      {
        full_name: payload.full_name, email: payload.email, preferred_language: payload.preferred_language,
        organization_name: payload.organization, title: payload.title, skills: payload.skills, cap_topics: mapOldTopics(payload.cap_topics),
        contribution_types: payload.contribution_types, affiliations: payload.affiliations, availability: payload.availability,
        bio: payload.bio, status: "new", source: "intake", directory_visible: false, contact_mode: "introduction",
      },
      null,
    );
    if (payload.referred_by?.name === "Aisha Khan") {
      await addRelationship({ personId: ids.get("aisha")!, relatedPersonId: personId, kind: "referred", source: "intake" }, null);
    }
    await query("INSERT INTO intake_submissions (id, person_id, payload, locale) VALUES ($1,$2,$3,$4)", [
      newId(), personId, JSON.stringify(payload), payload.preferred_language === "es" ? "es" : "en",
    ]);
    await recordHistory({ personId, kind: "signup_submitted", origin: "system", visibility: "admin" });
  }

  // The CRM layer, then mark it done so the demo_crm_v1 migration never adds it twice.
  await seedDemoCrm(db);
  await query("INSERT INTO app_meta (key) VALUES ('demo_crm_v1') ON CONFLICT (key) DO NOTHING");

  const [{ total }] = await query<{ total: number }>("SELECT count(*)::int AS total FROM people");
  console.log(`[nva] Seeded ${total} fictional people, ${links.length} connections and ${capIds.size} CAPs.`);
  return true;
}

// ---------- the CRM layer ----------

const LAUNCHPAD_NOTE =
  "Met at the community reception at the Launchpad Innovation Center. Interested in supporting internships. Asked me to send more information next week.";

/** Hidden prospective funders: only admins see them (and their notes). */
const DEMO_FUNDERS: (PersonInput & { key: string })[] = [
  {
    key: "dana",
    full_name: "Dana Whitfield",
    email: "dana.whitfield@example.org",
    phone: "(410) 555-0142",
    title: "Program Officer",
    organization_name: "Chesapeake Youth Futures Fund (demo)",
    organization_kind: "foundation",
    contribution_types: ["funder"],
    affiliations: ["community"],
    categories: ["prospective_funder"],
    status: "active",
    source: "admin",
    location: "Annapolis",
    origin: "Community reception at the Launchpad Innovation Center",
    notes: `${LAUNCHPAD_NOTE} Follow-up conversation at the Launchpad Innovation Center about a youth internship fund; she wants numbers on student placements.`,
    funding_focus: "Youth workforce and internships in Anne Arundel County. Grants of $10,000 to $50,000. Letters of inquiry due March 1.",
  },
  {
    key: "victor",
    full_name: "Victor Alvarez",
    email: "victor.alvarez@example.org",
    title: "Community Giving Manager",
    organization_name: "Severn Valley Bank (demo)",
    organization_kind: "business",
    contribution_types: ["funder"],
    affiliations: ["community"],
    categories: ["prospective_funder", "business"],
    status: "new",
    source: "admin",
    origin: "Introduced by Marcus Bell after the Launchpad Innovation Center open house",
    notes: "Brief chat at the Launchpad Innovation Center open house. The bank sponsors financial literacy programs and might fund a CAP showcase.",
    funding_focus: "Sponsorships of $2,500 to $10,000 for financial literacy and small business programs. Decisions each quarter.",
  },
  {
    key: "lena",
    full_name: "Lena Brooks",
    email: "lena.brooks@example.org",
    title: "Trustee",
    organization_name: "Harbor Family Foundation (demo)",
    organization_kind: "foundation",
    contribution_types: ["funder"],
    affiliations: ["community"],
    categories: ["prospective_funder"],
    status: "lead",
    source: "referral",
    origin: "Denise Okafor's neighbor",
    notes: "Denise mentioned Lena after the Launchpad Innovation Center tour. Not contacted yet.",
    funding_focus: "Family foundation; small grants for arts and environment.",
  },
];

/** People staff should reach through an introduction (busy, or prefer it), with a summary for staff. */
const INTRODUCTION_ONLY: [string, string][] = [
  ["helen.cho@example.org", "Pediatrician at the community clinic. Glad to talk with students about health careers; ask the admin to set it up."],
  ["marcus.bell@example.org", "Board member and attorney. Coaches mock trial; introductions through the admin."],
  ["olivia.grant@example.org", "City urban planner. Can bring real maps and zoning cases to a CAP."],
];
const SHARED_SUMMARIES: [string, string, string][] = [
  ["luis.romero@example.org", "Carpenter with his own shop. Loves hands-on woodworking demos; brings tools.", "Eastport"],
  ["lucia.herrera@example.org", "Tailor. Teaches sewing in English or Spanish; great with beginners.", "Annapolis"],
  ["tasha.greene@example.org", "Bookkeeper and parent. Can teach budgeting and banking basics.", "Parole"],
  ["sam.whitaker@example.org", "Runs oyster restoration on the Severn; takes students out on the water.", "Annapolis"],
];

/**
 * Adds the CRM demo layer. Uses only `db` (it may run inside a migration
 * transaction before the app's shared query() is ready). Dates are relative to
 * schoolToday() so the dashboard always has something overdue, due today and upcoming.
 */
export async function seedDemoCrm(db: Queryable): Promise<void> {
  const today = schoolToday();
  const personByEmail = async (email: string) =>
    (await db.query<{ id: string }>("SELECT id FROM people WHERE lower(email) = $1", [email]))[0]?.id ?? null;
  const capByKey = async (key: string) =>
    (await db.query<{ id: string }>("SELECT id FROM caps WHERE $1 = ANY(topics) ORDER BY created_at LIMIT 1", [key]))[0]?.id ?? null;

  // Demo logins: Ashley and Jordan (admins), Taylor and Marisol (staff).
  const ashley = await ensureUser(db, { email: "admin@nva.test", name: "Ashley", role: "admin" });
  const jordan = await ensureUser(db, { email: "jordan.admin@nva.test", name: "Jordan Admin", role: "admin" });
  const taylor = await ensureUser(db, { email: "teacher@nva.test", name: "Taylor", role: "staff" });
  const marisol = await ensureUser(db, { email: "maestra@nva.test", name: "Marisol Maestra", role: "staff", locale: "es" });
  await db.query("UPDATE users SET name = 'Taylor' WHERE email = 'teacher@nva.test' AND name = 'Taylor Teacher'");

  // Who staff reach directly and who through an introduction; summaries and towns staff can read.
  for (const [email, summary] of INTRODUCTION_ONLY) {
    await db.query(
      "UPDATE people SET contact_mode = 'introduction', shared_summary = coalesce(shared_summary, $2) WHERE lower(email) = $1",
      [email, summary],
    );
  }
  for (const [email, summary, location] of SHARED_SUMMARIES) {
    await db.query(
      "UPDATE people SET shared_summary = coalesce(shared_summary, $2), location = coalesce(location, $3) WHERE lower(email) = $1",
      [email, summary, location],
    );
  }
  await db.query("UPDATE people SET owner_user_id = $1 WHERE owner_user_id IS NULL AND directory_visible", [ashley]);

  // Hidden prospective funders.
  const funder = new Map<string, string>();
  for (const { key, ...input } of DEMO_FUNDERS) {
    const existing = await personByEmail(input.email!);
    const id =
      existing ??
      (await createPerson({ ...input, directory_visible: false, contact_mode: "introduction", owner_user_id: ashley }, ashley, db));
    funder.set(key, id);
    if (!existing) await recordHistory({ personId: id, kind: "contact_created", origin: "system", visibility: "admin", userId: ashley, happenedOn: addDays(today, -21) }, db);
  }
  const denise = await personByEmail("denise.okafor@example.org");
  const marcus = await personByEmail("marcus.bell@example.org");
  if (denise) await addRelationship({ personId: denise, relatedPersonId: funder.get("lena")!, kind: "knows", note: "Neighbors" }, ashley, db);
  if (marcus) await addRelationship({ personId: marcus, relatedPersonId: funder.get("victor")!, kind: "knows", note: "Bank client" }, ashley, db);
  await recordHistory(
    {
      personId: funder.get("dana")!, kind: "meeting", origin: "manual", visibility: "admin", userId: ashley, happenedOn: addDays(today, -14),
      notes: "Coffee after the Launchpad Innovation Center reception. She asked for our internship numbers and a one-page overview.",
    },
    db,
  );

  // Opportunities: engagement and funding tracks, across stages.
  const people = {
    luis: await personByEmail("luis.romero@example.org"),
    ellen: await personByEmail("ellen.park@example.org"),
    aisha: await personByEmail("aisha.khan@example.org"),
    tom: await personByEmail("tom.brennan@example.org"),
    andre: await personByEmail("andre.phillips@example.org"),
    naomi: await personByEmail("naomi.fields@example.org"),
    kendra: await personByEmail("kendra.moss@example.org"),
    lucia: await personByEmail("lucia.herrera@example.org"),
    helen: await personByEmail("helen.cho@example.org"),
  };
  const housingCap = await capByKey("housing scarcity");
  const threadsCap = await capByKey("common threads");
  const healthCap = await capByKey("the human race");
  const opportunity = async (input: {
    personId: string | null; track: "engagement" | "funding"; kind: string; title: string; stage: string;
    amount?: string; targetDate?: string | null; capId?: string | null; owner?: string; notes?: string; closed?: boolean;
  }) => {
    if (!input.personId) return null;
    const id = newId();
    await db.query(
      `INSERT INTO opportunities (id, person_id, track, kind, title, stage, amount, target_date, cap_id, owner_user_id, notes, created_by, closed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9,$10,$11,$12, CASE WHEN $13::boolean THEN now() END)`,
      [id, input.personId, input.track, input.kind, input.title, input.stage, input.amount ?? null, input.targetDate ?? null,
        input.capId ?? null, input.owner ?? ashley, input.notes ?? null, ashley, input.closed ?? false],
    );
    return id;
  };
  const danaGrant = await opportunity({
    personId: funder.get("dana")!, track: "funding", kind: "grant", title: "Youth Futures internship grant", stage: "cultivating",
    amount: "$25,000", targetDate: addDays(today, 45), notes: "Letter of inquiry first. She wants placement numbers.",
  });
  await opportunity({
    personId: funder.get("victor")!, track: "funding", kind: "sponsorship", title: "CAP showcase sponsorship", stage: "identified",
    amount: "$5,000", owner: jordan,
  });
  const luisWorkshop = await opportunity({
    personId: people.luis, track: "engagement", kind: "skills_lesson", title: "Woodworking workshop for the Housing CAP",
    stage: "committed", targetDate: addDays(today, 9), capId: housingCap,
  });
  const ellenWorkshop = await opportunity({
    personId: people.ellen, track: "engagement", kind: "guest_speaker", title: "Student journalism workshop", stage: "contacted",
    targetDate: addDays(today, 21),
  });
  const aishaInternship = await opportunity({
    personId: people.aisha, track: "engagement", kind: "internship", title: "Spring coding internship (2 students)", stage: "not_contacted",
  });
  const tomShadow = await opportunity({
    personId: people.tom, track: "engagement", kind: "internship", title: "Fall shop shadow day", stage: "completed",
    targetDate: "2026-09-26", closed: true,
  });
  await opportunity({
    personId: people.andre, track: "engagement", kind: "event", title: "Food access CAP tasting", stage: "closed_declined",
    notes: "Restaurant too busy this semester. Try again in spring.", closed: true,
  });
  await opportunity({
    personId: people.naomi, track: "engagement", kind: "volunteering", title: "Garden build day", stage: "canceled",
    notes: "Rained out; the garden will reschedule.", closed: true,
  });
  const kendraMentor = await opportunity({
    personId: people.kendra, track: "engagement", kind: "mentoring", title: "Photography mentor for two students", stage: "contacted",
    owner: jordan,
  });
  if (danaGrant) {
    await recordHistory(
      { personId: funder.get("dana")!, kind: "opportunity_updated", origin: "system", visibility: "admin", userId: ashley,
        opportunityId: danaGrant, happenedOn: addDays(today, -14), notes: "Youth Futures internship grant: Cultivating" },
      db,
    );
  }

  // Follow-ups: overdue, due today, upcoming, awaiting a reply, and done.
  const followUp = async (input: {
    personId: string | null; action: string; dueOn: string; opportunityId?: string | null; owner?: string;
    awaiting?: boolean; completed?: boolean;
  }) => {
    if (!input.personId) return;
    const id = newId();
    await db.query(
      `INSERT INTO follow_ups (id, person_id, opportunity_id, action, due_on, owner_user_id, status, awaiting_response,
                               completed_at, completed_by, created_by)
       VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8, CASE WHEN $9::boolean THEN now() END, CASE WHEN $9::boolean THEN $6 END, $10)`,
      [id, input.personId, input.opportunityId ?? null, input.action, input.dueOn, input.owner ?? ashley,
        input.completed ? "completed" : "open", input.awaiting ?? false, input.completed ?? false, ashley],
    );
    await recordHistory(
      { personId: input.personId, kind: input.completed ? "follow_up_completed" : "follow_up_scheduled", origin: "system",
        visibility: "admin", userId: input.owner ?? ashley, followUpId: id, notes: input.action,
        happenedOn: input.completed ? input.dueOn : addDays(input.dueOn, -7) < today ? addDays(input.dueOn, -7) : today },
      db,
    );
  };
  await followUp({ personId: funder.get("dana")!, action: "Send the internship program overview and placement numbers", dueOn: addDays(today, -3), opportunityId: danaGrant });
  await followUp({ personId: people.ellen, action: "Confirm workshop dates with Ellen", dueOn: addDays(today, -1), opportunityId: ellenWorkshop });
  await followUp({ personId: people.luis, action: "Confirm the lumber list and room for the workshop", dueOn: today, opportunityId: luisWorkshop });
  await followUp({ personId: people.aisha, action: "Send information about internship opportunities", dueOn: addDays(today, 5), opportunityId: aishaInternship });
  await followUp({ personId: funder.get("victor")!, action: "Intro call about the CAP showcase sponsorship", dueOn: addDays(today, 8), owner: jordan });
  await followUp({ personId: people.kendra, action: "Waiting to hear back about mentoring", dueOn: addDays(today, 2), opportunityId: kendraMentor, awaiting: true, owner: jordan });
  await followUp({ personId: people.tom, action: "Thank-you note after the shadow day", dueOn: addDays(today, -12), opportunityId: tomShadow, completed: true });

  // Staff requests from Taylor (and one from Marisol, in Spanish).
  const request = async (input: {
    requester: string; kind?: "resource" | "introduction"; need: string; description?: string; capId?: string | null;
    activity?: string; preferredDate?: string | null; timeframe?: string; participants?: number; status?: string;
    response?: string; completedNote?: string; assignedTo?: string | null; people?: [string | null, "interest" | "assigned"][];
    createdDaysAgo?: number;
  }) => {
    const id = newId();
    const completed = input.status === "completed";
    await db.query(
      `INSERT INTO staff_requests (id, requester_id, kind, need, description, cap_id, activity, preferred_date, timeframe,
                                   participant_count, status, response, completed_note, assigned_to, completed_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9,$10,$11,$12,$13,$14, CASE WHEN $15::boolean THEN now() END,
               now() - make_interval(days => $16), now())`,
      [id, input.requester, input.kind ?? "resource", input.need, input.description ?? null, input.capId ?? null,
        input.activity ?? null, input.preferredDate ?? null, input.timeframe ?? null, input.participants ?? null,
        input.status ?? "open", input.response ?? null, input.completedNote ?? null, input.assignedTo ?? null, completed,
        input.createdDaysAgo ?? 2],
    );
    for (const [personId, role] of input.people ?? []) {
      if (!personId) continue;
      await db.query(
        "INSERT INTO staff_request_people (request_id, person_id, role, added_by) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
        [id, personId, role, role === "assigned" ? ashley : input.requester],
      );
    }
    return id;
  };
  await request({
    requester: taylor, need: "A guest speaker on healthcare careers",
    description: "My 10th grade advisory is exploring careers in health. Someone who can talk about nursing or medicine.",
    activity: "Advisory", timeframe: "Any Tuesday or Thursday in November", participants: 22, createdDaysAgo: 1,
  });
  await request({
    requester: taylor, kind: "introduction", need: "Introduction to Dr. Helen Cho",
    description: "Could she visit my Human Race CAP to talk about clinic work?", capId: healthCap,
    timeframe: "Next month", participants: 18, people: [[people.helen, "interest"]], createdDaysAgo: 3,
  });
  await request({
    requester: taylor, need: "Woodworking demo for the Housing CAP", capId: housingCap, preferredDate: addDays(today, 9),
    participants: 16, status: "arranged", response: "Luis Romero will come with tools. Room 104 at 9 am.", assignedTo: ashley,
    people: [[people.luis, "assigned"]], createdDaysAgo: 10,
  });
  const sewing = await request({
    requester: taylor, need: "Sewing lesson for the Common Threads CAP", capId: threadsCap, preferredDate: addDays(today, -20),
    participants: 12, status: "completed", response: "Lucía Herrera can teach hemming.", completedNote: "Students hemmed their own aprons. Lucía was wonderful.",
    assignedTo: ashley, people: [[people.lucia, "assigned"]], createdDaysAgo: 30,
  });
  if (people.lucia) {
    await recordHistory(
      { personId: people.lucia, kind: "engagement_completed", origin: "staff_request", visibility: "staff", userId: taylor,
        staffRequestId: sewing, capId: threadsCap, happenedOn: addDays(today, -20),
        notes: "Students hemmed their own aprons. Lucía was wonderful." },
      db,
    );
  }
  await request({
    requester: marisol, need: "Voluntarios para la feria de ciencias",
    description: "Necesitamos adultos que ayuden a guiar a los grupos durante la feria.", activity: "Feria de ciencias",
    timeframe: "Viernes por la mañana, a fin de mes", participants: 4, createdDaysAgo: 2,
  });

  // Sign-ups waiting for review (new style: no contact until approved). One matches an
  // existing person's email (Kendra), so review can link it; one is Example 1's carpenter.
  const pending: IntakePayload[] = [
    {
      full_name: "Kendra Moss", email: "kendra.moss@example.org", preferred_language: "en", organization: null, title: "Photographer",
      contribution_types: ["mentoring", "guest_speaker"], skills: ["photography", "drone photography"], cap_topics: [],
      availability: "Wednesday afternoons", affiliations: ["community"],
      bio: "Signing up again to offer mentoring. I now fly drones for real estate shoots.", referred_by: null, referrals: [], consent: true,
    },
    {
      full_name: "Walter Haines", email: "walter.haines@example.org", phone: "(410) 555-0177", preferred_language: "en",
      organization: "Haines Custom Cabinets (demo)", title: "Carpenter", contribution_types: ["skills_lesson", "guest_speaker"],
      skills: ["carpentry", "woodworking", "cabinet making", "hand tools"], cap_topics: ["housing scarcity"],
      availability: "Friday mornings", affiliations: ["community"],
      bio: "Carpenter for 30 years in Eastport. I'd love to teach teens to use hand tools safely and build something real.",
      referred_by: null, referrals: [], consent: true,
    },
  ];
  for (const [i, payload] of pending.entries()) {
    const exists = await db.query("SELECT 1 FROM intake_submissions WHERE payload->>'email' = $1 AND person_id IS NULL", [payload.email]);
    if (exists.length) continue;
    await db.query(
      `INSERT INTO intake_submissions (id, person_id, payload, locale, submitted_at) VALUES ($1, NULL, $2, $3, now() - make_interval(hours => $4))`,
      [newId(), JSON.stringify(payload), payload.preferred_language === "es" ? "es" : "en", 6 + i * 20],
    );
  }
}

/**
 * SEED_DEMO=true: load the demo data once at startup when the database is
 * empty. A row in app_meta makes sure only one server instance does it.
 */
export async function seedDemoFromEnv(): Promise<void> {
  if (process.env.SEED_DEMO !== "true") return;
  const claimed = await query("INSERT INTO app_meta (key) VALUES ('demo_seed') ON CONFLICT (key) DO NOTHING RETURNING key");
  if (claimed.length) await seedDemoData();
  // Databases seeded before the CAP catalog existed get the real CAPs once.
  await migrateDemoToCatalog();
}

export const DEMO_PASSWORD = PASSWORD;

