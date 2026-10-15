/**
 * Fictional demo data. Every person and organization here is made up.
 * Used by `npm run seed` locally and by SEED_DEMO=true on a demo deployment.
 */
import { CATALOG_META_KEY, addDemoCapPartners, insertCatalogCaps, mapOldTopics, migrateDemoToCatalog } from "./cap-catalog.server";
import { createUser } from "./auth.server";
import type { Affiliation, ContributionType, RelationshipKind } from "./constants";
import { normalizeTags } from "./constants";
import { newId, query } from "./db.server";
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

/**
 * Loads the fictional demo data (people, connections, CAPs, sign-ups and three
 * demo logins). Returns false and does nothing if people already exist.
 */
export async function seedDemoData(): Promise<boolean> {
  const [{ n }] = await query<{ n: number }>("SELECT count(*)::int AS n FROM people");
  if (n > 0) return false;

  const adminId = await createUser({ email: "admin@nva.test", name: "Avery Admin", password: PASSWORD, role: "admin" });
  const teacherId = await createUser({ email: "teacher@nva.test", name: "Taylor Teacher", password: PASSWORD, role: "teacher" });
  await createUser({ email: "maestra@nva.test", name: "Marisol Maestra", password: PASSWORD, role: "teacher", locale: "es" });

  const ids = new Map<string, string>();
  for (const { key, ...person } of people)
    ids.set(key, await createPerson({ ...person, cap_topics: mapOldTopics(normalizeTags(person.cap_topics)) }, adminId));
  for (const [a, b, kind, note] of links) {
    await addRelationship({ personId: ids.get(a)!, relatedPersonId: ids.get(b)!, kind, note }, adminId);
  }

  // CAPs: this semester's real CAPs from the CAP Selection Guide, with a few demo partners.
  const capIds = await insertCatalogCaps(adminId);
  await addDemoCapPartners(capIds, teacherId);
  await query("INSERT INTO app_meta (key) VALUES ($1) ON CONFLICT (key) DO NOTHING", [CATALOG_META_KEY]);

  // Engagement history.
  await logEngagement({ personId: ids.get("lucia")!, kind: "lesson", happenedOn: "2026-09-18", notes: "Taught hemming and basic machine sewing to 12 students." }, teacherId);
  await logEngagement({ personId: ids.get("tom")!, kind: "internship", happenedOn: "2026-09-26", notes: "Two 10th graders shadowed the shop for a day." }, adminId);
  await logEngagement({ personId: ids.get("sam")!, kind: "volunteer", happenedOn: "2026-10-02", notes: "Led water sampling at the creek." }, teacherId);
  await logEngagement({ personId: ids.get("ellen")!, kind: "call", happenedOn: "2026-10-08", notes: "Interested in a student journalism workshop." }, adminId);

  // New sign-ups waiting for review.
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
        bio: payload.bio, status: "new", source: "intake",
      },
      null,
    );
    if (payload.referred_by?.name === "Aisha Khan") {
      await addRelationship({ personId: ids.get("aisha")!, relatedPersonId: personId, kind: "referred", source: "intake" }, null);
    }
    await query("INSERT INTO intake_submissions (id, person_id, payload, locale) VALUES ($1,$2,$3,$4)", [
      newId(), personId, JSON.stringify(payload), payload.preferred_language === "es" ? "es" : "en",
    ]);
  }

  console.log(`[nva] Seeded ${people.length + signups.length} fictional people, ${links.length} connections and ${capIds.size} CAPs.`);
  return true;
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

