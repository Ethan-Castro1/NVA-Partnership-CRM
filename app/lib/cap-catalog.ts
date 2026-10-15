/**
 * NVA's Community Action Projects for Semester 1, 2026-27, from the CAP
 * Selection Guide. A CAP runs 10 to 14 weeks and meets twice a week for 90
 * minutes, in one of three blocks. Safe to import on both sides.
 *
 * Each CAP's `key` is also the tag stored in people.cap_topics, so "CAP
 * topics" for a partner means "the CAPs they could help with".
 */

export const CAP_BLOCKS = ["A", "B", "C"] as const;
export type CapBlock = (typeof CAP_BLOCKS)[number];

/** Meeting days per block (i18n: caps.days.*). */
export const BLOCK_DAYS: Record<CapBlock, "monFri" | "tueThu"> = { A: "monFri", B: "tueThu", C: "tueThu" };

/** Labels from the guide (i18n: caps.label.*). */
export const CAP_LABELS = ["misa", "gov_mcap", "bilingual", "math", "digital_tech", "reading"] as const;
export type CapLabel = (typeof CAP_LABELS)[number];

/** The guide's sections (i18n: caps.area.*). */
export const CAP_AREAS = ["science", "humanities", "math_tech", "media", "independent"] as const;
export type CapArea = (typeof CAP_AREAS)[number];

export type CatalogCap = {
  key: string;
  title: string;
  teacher: string;
  blocks: CapBlock[];
  area: CapArea;
  labels: CapLabel[];
  challenge: string;
  learn: string;
  impact: string;
};

export const CAP_TERM = "Semester 1, 2026-27";

export const SEMESTER_1_CAPS: CatalogCap[] = [
  {
    key: "the human race",
    title: "The Human Race: Biology, Race, and What Makes Us Human",
    teacher: "Andrea Brown",
    blocks: ["A", "B", "C"],
    area: "science",
    labels: ["misa"],
    challenge:
      "What does biology really tell us about human difference, and what happens when society treats race as if it were a clear biological category?",
    learn: "Genetics, inheritance, variation, adaptation, evolution, human origins, and the effects of racism on health.",
    impact: "A public-facing documentary that helps Annapolis think more accurately about ancestry, race, and medicine.",
  },
  {
    key: "streams in the balance",
    title: "Streams in the Balance: Restoring Chesapeake Ecosystems",
    teacher: "John Wilkinson",
    blocks: ["A", "B", "C"],
    area: "science",
    labels: ["misa"],
    challenge:
      "The Chesapeake Bay depends on healthy streams, but sediment, nutrients, chemicals, development, and restoration choices can throw the system off balance.",
    learn: "Ecosystems, chemistry, watershed science, field investigation, data analysis, and systems modeling.",
    impact: "Collect and interpret local evidence, then contribute to restoration, citizen science, or advocacy for a healthier Chesapeake.",
  },
  {
    key: "annapolis underwater",
    title: "Annapolis Underwater!",
    teacher: "Paula Jaramillo",
    blocks: ["A", "B"],
    area: "science",
    labels: ["bilingual"],
    challenge:
      "Downtown Annapolis floods more and more often. How can a historic waterfront city adapt without losing its places, people, and culture?",
    learn: "Sea-level rise, storm surge, runoff chemistry, mapping, mathematical modeling, design, art, and city and county government. Block A is bilingual.",
    impact: "A visual design, public exhibit, youth panel, or other product that helps Annapolis imagine smarter, fairer solutions.",
  },
  {
    key: "rigged or real",
    title: "Rigged or Real? Democracy, Elections & Truth",
    teacher: "AO Isiaq",
    blocks: ["A", "C"],
    area: "humanities",
    labels: ["gov_mcap"],
    challenge: "Are today's elections fair, secure, and truly representative?",
    learn: "Voting rights, election systems, gerrymandering, campaign finance, media literacy, misinformation, and court decisions.",
    impact: "Voter education, fact-checking, teen-focused media, public dialogue, or a proposal that strengthens participation.",
  },
  {
    key: "travels of a t-shirt",
    title: "Travels of a T-Shirt: Wearing the Global Economy",
    teacher: "Nicole Snider",
    blocks: ["A", "C"],
    area: "humanities",
    labels: [],
    challenge: "A simple T-shirt connects growers, factory workers, shipping, stores, and used-clothing markets. Who benefits, and who pays?",
    learn: "Geography, industrialization, labor, trade, economic systems, natural resources, consumer choices, and waste.",
    impact: "Research products and create honest, persuasive information that helps shoppers and businesses choose with more awareness.",
  },
  {
    key: "the next act",
    title: "The Next Act: Relevance, Youth, and Theater",
    teacher: "Morris Glover",
    blocks: ["A"],
    area: "humanities",
    labels: [],
    challenge: "What would make the next generation see live theater as something made with them, about them, and for them?",
    learn: "Dramatic literature, audience research, arts economics, performance, playwriting, interviewing, and marketing.",
    impact: "Partner with the Annapolis theater community on a youth event, campaign, or plan, and put on a production.",
  },
  {
    key: "common threads",
    title: "Common Threads: My People in the Global Story",
    teacher: "AO Isiaq",
    blocks: ["B"],
    area: "humanities",
    labels: [],
    challenge: "What changes when you trace the people and cultures you identify with through world history?",
    learn: "Research and analysis across governments, economic systems, cultural encounters, imperialism, resistance, and globalization.",
    impact: "A public history product, such as a digital collage, map, timeline, book, or performance.",
  },
  {
    key: "bridges & barriers",
    title: "Bridges & Barriers: Immigrant Experience and U.S. Policy",
    teacher: "Dr. Chesse Doré",
    blocks: ["B"],
    area: "humanities",
    labels: ["gov_mcap", "bilingual"],
    challenge:
      "Immigrant communities strengthen Annapolis while facing barriers in language access, education, work, services, policy, and belonging. Which bridges can we build?",
    learn: "Local immigrant experiences, U.S. immigration history and policy, levels of government, lawmaking, and civic action, in Spanish and English.",
    impact: "Bilingual podcasts, oral histories, resource guides, impact maps, murals, or policy proposals.",
  },
  {
    key: "housing scarcity",
    title: "Between a Brick and a Hard Place: Housing Scarcity in Annapolis",
    teacher: "Dally Ridgway",
    blocks: ["C"],
    area: "humanities",
    labels: ["bilingual"],
    challenge: "Many people who work in Annapolis cannot afford to live here. How did we get here, and what should local leaders do?",
    learn: "Redlining, the GI Bill, public housing, wealth gaps, rent and homeownership, local government, financial literacy, and mapping.",
    impact: "Interviews and field research toward a housing design, podcast, community proposal, or policy recommendation.",
  },
  {
    key: "reading revolution",
    title: "Reading Revolution! Inspiring Kids to Crack the Code",
    teacher: "Dr. Sharonda Scott",
    blocks: ["C"],
    area: "humanities",
    labels: ["reading"],
    challenge: "Too many children believe they are \"bad readers\" when they need skilled practice, encouragement, and books that make reading feel powerful.",
    learn: "Why literacy matters, how to teach a skill, and how to get young children excited about reading.",
    impact: "Tutor elementary readers through read-alouds, games, a puppet performance, or a book made for them.",
  },
  {
    key: "teen mental health",
    title: "Visualizing Teen Mental Health: Making Data Talk",
    teacher: "Caleb Wise-Burton",
    blocks: ["B"],
    area: "math_tech",
    labels: ["math", "digital_tech"],
    challenge: "Adults make decisions about teen wellbeing. Do they understand what local teens are experiencing and need?",
    learn: "Surveys and interviews, ratios, percents, statistics, spreadsheets, charts, and explaining data without bias.",
    impact: "An accurate, accessible presentation or infographic set that helps local organizations support teen mental health.",
  },
  {
    key: "team it",
    title: "Team IT! Coding, AI, and Creating an NVA IT Taskforce",
    teacher: "LaToya Mitchell",
    blocks: ["B"],
    area: "math_tech",
    labels: ["digital_tech"],
    challenge: "How can students become the team that solves NVA's technology problems and uses coding and AI responsibly?",
    learn: "Troubleshooting, devices and systems, coding, AI literacy, cybersecurity habits, documentation, and design thinking.",
    impact: "Launch a student IT taskforce that builds useful tools, teaches others, and improves technology across the school.",
  },
  {
    key: "access to transportation",
    title: "Who has A.A.Access to Transportation? Visual Storytelling",
    teacher: "Dustin Harrison-Atlas",
    blocks: ["A"],
    area: "media",
    labels: ["digital_tech"],
    challenge: "Who can move easily around Annapolis to reach school, work, health care, and food, and who gets left waiting?",
    learn: "Documentary research, local government and equity, interviewing, camera and sound, and video editing.",
    impact: "A short documentary or photo story that makes transportation barriers visible to residents and decision-makers.",
  },
  {
    key: "access to the water",
    title: "Who has A.A.Access to the Water? Visual Storytelling",
    teacher: "Dustin Harrison-Atlas",
    blocks: ["B", "C"],
    area: "media",
    labels: ["digital_tech"],
    challenge: "Not everyone has the same access to Annapolis's waterfront, boating, recreation, or decisions about the water.",
    learn: "Public access, history, policy, environmental justice, interviewing, cinematography, sound, and editing.",
    impact: "A video or photo story about who enjoys the water, who faces barriers, and what a more open waterfront could look like.",
  },
  {
    key: "independent projects",
    title: "Independent Projects (Mondays only)",
    teacher: "Jacob Stoner",
    blocks: ["A"],
    area: "independent",
    labels: [],
    challenge: "For 11th and 12th graders with two internship days a week: connect the internship to a substantial project.",
    learn: "Setting a question and timeline, fieldwork, working with a mentor, documenting progress, and revising through feedback.",
    impact: "An authentic project shaped by the internship, presented to a real audience.",
  },
];

/** The CAP topic tags people can be matched on (one per CAP). */
export const CAP_TOPIC_KEYS = SEMESTER_1_CAPS.map((cap) => cap.key);

const BY_KEY = new Map(SEMESTER_1_CAPS.map((cap) => [cap.key, cap]));

export function catalogCap(key: string): CatalogCap | undefined {
  return BY_KEY.get(key);
}

/** A CAP topic tag as people read it: the CAP's title, or the tag itself for older free-text topics. */
export function capTopicLabel(tag: string): string {
  return BY_KEY.get(tag)?.title ?? tag;
}

/** The short form of a title (before the colon), for chips and pickers. */
export function capTopicShort(tag: string): string {
  const title = BY_KEY.get(tag)?.title;
  return title ? title.split(/:\s/)[0] : tag;
}
