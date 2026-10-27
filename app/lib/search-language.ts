/**
 * Everyday search language. Turns a question like "Find someone to teach
 * students basic carpentry" into what the people search needs:
 *
 * - `terms`: the words that say what the person should know about
 *   ("carpentry"). Filler ("find", "someone", "students") is dropped, and a
 *   known phrase ("financial literacy") stays whole so its words don't match
 *   on their own ("literacy" alone would find a media literacy librarian).
 * - `related`: words from the synonym map (carpentry: woodworking,
 *   construction, cabinet making...). They widen the search and rank a little
 *   lower than the words the person typed.
 * - `contributionTypes` and `categories`: the kind of help asked for
 *   ("teach" is a skills lesson, "guest speaker", "volunteers", "host
 *   students for internships", "community organization"). They boost people
 *   who offer that help; on their own (no terms) they decide who matches.
 * - `hints`: a few words that mark the same kind of help in free text ("can
 *   host 2 interns"). They nudge ranking and never decide who matches.
 *
 * explainMatch() turns a match back into reasons ("banking background;
 * offers practical skills") from the fields it is given. Callers pass only
 * fields the viewer may see. Pure: no database, safe on client and server.
 */
import type { ContactCategory, ContributionType } from "./constants";

export type ParsedSearch = {
  terms: string[];
  related: string[];
  hints: string[];
  contributionTypes: ContributionType[];
  categories: ContactCategory[];
};

export type MatchTier = "core" | "related" | "hint";
export type MatchTerm = { term: string; tier: MatchTier };

export const MATCH_REASON_KINDS = [
  "skill",
  "offers",
  "cap",
  "organization",
  "title",
  "bio",
  "location",
  "availability",
  /** Admin only: the person's private notes, funding focus or origin mention the word. */
  "notes",
] as const;
export type MatchReasonKind = (typeof MATCH_REASON_KINDS)[number];

/**
 * Why a person matched. `value` is the matched skill tag, contribution type key
 * (offers), CAP key (cap), organization name, title, matched word (bio, notes),
 * location or availability text.
 */
export type MatchReason = { kind: MatchReasonKind; value: string };

const MAX_TERMS = 8;
const MAX_MATCH_TERMS = 24;

// ---------- vocabulary ----------

/** Words that carry no meaning in a school search, English and Spanish. */
const STOPWORDS = new Set(
  (
    "a an and are at be by can could for from has have i in is it me my need needs needed needing of on or our " +
    "someone somebody anyone anybody who whom that the their them they this these those to us we with would " +
    "people person partner partners help helps helping find finding looking look search searching about " +
    "want wants wanted like get give provide offer offers do does did how what when where which why will " +
    "should might may just really very also some any more most other into over through than then there " +
    "here up out been being was were am you your he she his her its it's we're i'm one ones " +
    "students student kids kid children teens teenagers youth class classes classroom school schools grade " +
    "basic basics simple intro introductory beginner beginners upcoming next new soon " +
    "works work working worked supports support supporting knows know knowledge expert expertise experience " +
    "experienced background skill skills practical real world education educational learn learning " +
    "community local area topic topics subject something things thing please thanks " +
    "un una unos unas el la los las lo le les se y o de del al en con para por que quien quién quienes alguien " +
    "persona personas necesito necesitamos buscar busco buscamos sobre nuestro nuestra nuestros nuestras ayuda " +
    "ayudar mi mis su sus es son como cómo qué más muy también hay tiene tenga puede pueda podría quiere " +
    "estudiantes alumnos jóvenes chicos niños escuela clase clases básico básica próximo próxima trabaja " +
    "trabajo apoya apoyar comunidad educación aprender algo"
  ).split(" "),
);

type Rule = {
  /** Words or phrases that trigger the rule. A trailing * matches a word prefix ("enseñ*"). */
  triggers: string[];
  /** Keep the matched words as a search term. */
  keep?: boolean;
  related?: string[];
  hints?: string[];
  types?: ContributionType[];
  categories?: ContactCategory[];
};

/** Topics with related words. Related words may be stems ("nurs" finds nurse and nursing). */
const TOPICS: Rule[] = [
  {
    triggers: ["carpentry", "carpenter", "woodworking", "woodwork", "woodshop", "cabinetry", "cabinet making", "furniture making", "carpintería", "carpintero", "carpintera"],
    related: ["carpent", "woodwork", "construction", "cabinet", "furniture", "hand tools", "wood", "carpint"],
  },
  {
    triggers: ["construction", "builder", "building trades", "trades", "contractor", "construcción"],
    related: ["construction", "carpent", "contractor", "builder", "electric", "plumb", "weld"],
  },
  {
    triggers: [
      "healthcare", "health care", "health", "medical", "medicine", "doctor", "nurse", "nursing", "hospital", "clinic",
      "physician", "salud", "médico", "médica", "enfermera", "enfermero", "enfermería",
    ],
    related: ["health", "medic", "nurs", "hospital", "clinic", "doctor", "physician", "pediatric", "first aid", "cpr", "enfermer", "salud"],
  },
  {
    triggers: [
      "financial literacy", "personal finance", "finance", "financial", "money", "banking", "bank", "budget", "budgeting",
      "credit", "accounting", "bookkeeping", "taxes", "educación financiera", "finanzas", "dinero", "presupuesto",
    ],
    related: ["financ", "bank", "budget", "credit", "money", "bookkeep", "accounting", "presupuesto", "finanzas"],
  },
  {
    triggers: [
      "environment", "environmental", "ecology", "nature", "conservation", "climate", "sustainability", "the bay",
      "bay", "chesapeake", "watershed", "oyster", "stream", "creek", "river", "wetland", "recycling", "medio ambiente",
      "ambiental", "ecología", "naturaleza",
    ],
    related: [
      // Not "chesapeake", "bay" or "marine": too many business names use them.
      "environment", "ecolog", "conservation", "climate", "sustainab", "the bay", "watershed", "oyster",
      "restoration", "marine biology", "water", "creek", "stream", "river", "wetland", "garden", "compost", "recycl", "ambient",
    ],
  },
  {
    triggers: ["gardening", "garden", "farming", "farm", "agriculture", "plants", "jardín", "huerto"],
    related: ["garden", "compost", "farm", "plant", "agricultur", "jardin", "huerto"],
  },
  {
    triggers: ["cooking", "cook", "chef", "culinary", "food", "nutrition", "baking", "baker", "cocina", "cocinar", "comida"],
    related: ["cook", "chef", "culinar", "food", "nutrition", "bak", "restaurant", "cocin"],
  },
  {
    triggers: ["sewing", "sew", "tailor", "tailoring", "textile", "quilting", "fashion", "embroidery", "costura", "coser"],
    related: ["sew", "tailor", "textile", "quilt", "embroider", "pattern making", "costume", "costur"],
  },
  {
    triggers: ["coding", "programming", "computer", "computers", "software", "technology", "tech", "web design", "robotics", "programación", "computación"],
    related: ["coding", "programm", "software", "computer", "web design", "data", "robotic", "tech"],
  },
  {
    triggers: ["law", "legal", "lawyer", "attorney", "court", "justice", "abogado", "abogada", "ley"],
    related: ["law", "legal", "attorney", "mock trial", "court", "rights", "abogad"],
  },
  {
    triggers: ["public speaking", "debate", "speech"],
    related: ["public speaking", "debate", "mock trial", "speech"],
  },
  {
    triggers: ["music", "musician", "song", "audio", "música"],
    related: ["music", "audio", "song", "producer", "musica"],
  },
  {
    triggers: ["photography", "photographer", "photo", "video", "film", "filmmaking", "fotografía"],
    related: ["photo", "video", "film", "camera", "drone", "fotograf"],
  },
  {
    triggers: ["journalism", "journalist", "reporter", "news", "writing", "writer", "periodismo"],
    related: ["journalis", "reporter", "news", "writ", "interview", "periodis"],
  },
  {
    triggers: ["auto", "car", "cars", "mechanic", "automotive", "engine", "mecánico", "mecánica"],
    related: ["auto", "mechanic", "engine", "car repair", "mecanic"],
  },
  {
    triggers: ["welding", "welder", "metal", "metalwork", "fabrication", "soldadura"],
    related: ["weld", "metal", "fabrication", "soldad"],
  },
  {
    triggers: ["electrician", "electrical", "electricity", "wiring", "solar", "electricista"],
    related: ["electric", "wiring", "solar"],
  },
  {
    triggers: ["entrepreneurship", "entrepreneur", "small business", "startup", "emprendimiento", "pequeña empresa"],
    related: ["small business", "entrepreneur", "owner", "startup", "emprend"],
  },
  {
    triggers: ["housing", "homes", "urban planning", "city planning", "zoning", "real estate", "vivienda"],
    related: ["housing", "urban planning", "zoning", "real estate", "planner", "vivienda"],
  },
  {
    triggers: ["career", "careers", "jobs", "resume", "résumé", "interviewing", "carrera", "empleo"],
    related: ["career", "resume", "interview", "job", "carrera", "empleo"],
  },
  {
    triggers: ["mental health", "counseling", "counselor", "therapy", "therapist", "wellness", "salud mental"],
    related: ["mental health", "counsel", "therap", "wellness", "social work"],
  },
  {
    triggers: ["immigration", "immigrant", "immigrants", "inmigración", "inmigrante"],
    related: ["immigra", "know your rights", "inmigra"],
  },
  {
    triggers: ["art", "arts", "painting", "drawing", "mural", "arte", "pintura"],
    related: ["art", "paint", "drawing", "mural", "design", "pintur"],
  },
  { triggers: ["grant writing", "fundraising"], related: ["grant writing", "fundrais", "proposal"] },
];

/** The kind of help asked for. Their words are not search terms unless `keep`. */
const INTENTS: Rule[] = [
  {
    triggers: [
      "teach", "teaches", "teaching", "taught", "teacher", "lesson", "workshop", "instructor", "demo", "demonstration",
      "hands on", "practical skill", "practical skills", "skills lesson", "show students how", "show them how",
      "show kids how", "enseñ*", "taller", "talleres", "lección", "lecciones", "instructora", "habilidades prácticas",
    ],
    types: ["skills_lesson"],
    categories: ["skills_instructor"],
    hints: ["teach"],
  },
  {
    triggers: [
      "guest speaker", "speaker", "speak", "speaks", "talk", "talks", "presentation", "presenter", "career day",
      "panel", "panelist", "conferencista", "orador", "oradora", "charla", "charlas", "hablar",
    ],
    types: ["guest_speaker"],
    categories: ["guest_speaker"],
    hints: ["speak", "talk"],
  },
  {
    triggers: [
      "volunteer", "volunteering", "voluntari*", "helper", "chaperone", "event", "festival", "fair", "field trip",
      "field day", "open house", "cleanup", "clean up", "evento", "feria",
    ],
    types: ["classroom_volunteer"],
    categories: ["volunteer"],
    hints: ["volunteer"],
  },
  {
    triggers: ["after school", "afterschool", "club", "extracurricular", "después de clases", "después de la escuela"],
    types: ["after_school"],
    categories: ["volunteer"],
  },
  {
    triggers: ["mentor", "mentoring", "mentorship", "mentoría", "mentora"],
    keep: true,
    types: ["mentoring"],
    categories: ["volunteer"],
  },
  {
    triggers: [
      "internship", "intern", "host students", "host a student", "host", "hosting", "job shadow", "job shadowing",
      "shadow day", "shadow", "shadowing", "apprentice", "apprenticeship", "work experience", "work based learning",
      "pasantía", "pasantías", "pasante", "práctica profesional", "prácticas",
    ],
    types: ["internship"],
    categories: ["internship_host"],
    hints: ["intern"],
  },
  {
    triggers: ["community action project", "cap partner", "cap", "caps"],
    types: ["cap_partner"],
    categories: ["cap_partner"],
  },
  {
    triggers: [
      "community organization", "community group", "organization", "organisation", "org", "nonprofit", "non profit",
      "group", "agency", "agencies", "charity", "charities", "organización", "organizaciones", "asociación", "grupo",
    ],
    categories: ["community_org"],
  },
  {
    triggers: ["business", "businesses", "company", "companies", "employer", "corporate", "empresa", "negocio"],
    categories: ["business"],
  },
  { triggers: ["government", "city", "county", "gobierno", "ciudad"], categories: ["government"] },
  {
    triggers: [
      "funder", "funding", "fund", "grant", "donor", "sponsor", "sponsorship", "foundation", "philanthropy",
      "financiador*", "subvención", "donante", "patrocinador",
    ],
    types: ["funder"],
    categories: ["funder", "prospective_funder"],
    hints: ["fund", "grant"],
  },
];

// ---------- parsing ----------

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "");

/** Light English and Spanish de-pluralizing ("welders" to "welder", "agencies" to "agency"). */
function singular(word: string): string {
  if (word.length > 5 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) return word.slice(0, -1);
  return word;
}

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .normalize("NFC")
    .replace(/['’]s\b/gu, "")
    .split(/[^\p{L}\p{N}&+#']+/u)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

type Phrase = { words: string[]; rule: Rule };

function phrasesOf(rules: Rule[]): Phrase[] {
  return rules.flatMap((rule) => rule.triggers.map((t) => ({ words: fold(t.toLowerCase()).split(" "), rule })));
}

// Longest phrases first, so "financial literacy" wins over "financial" and "public speaking" over "speak".
const PHRASES: Phrase[] = [...phrasesOf(TOPICS), ...phrasesOf(INTENTS)].sort((a, b) => b.words.length - a.words.length);

function wordMatches(pattern: string, word: string): boolean {
  if (pattern.endsWith("*")) return word.startsWith(pattern.slice(0, -1));
  return word === pattern || singular(word) === pattern;
}

const push = <T>(list: T[], values: readonly T[] | undefined) => {
  for (const v of values ?? []) if (!list.includes(v)) list.push(v);
};

/** Parses an everyday question into search terms, related words and the kind of help asked for. */
export function parseSearch(q: string | undefined | null): ParsedSearch {
  const out: ParsedSearch = { terms: [], related: [], hints: [], contributionTypes: [], categories: [] };
  if (!q?.trim()) return out;
  const tokens = tokenize(q);
  const folded = tokens.map(fold);
  const used = tokens.map(() => false);
  const termAt: { at: number; term: string }[] = [];

  for (let i = 0; i < tokens.length; i++) {
    if (used[i]) continue;
    const hit = PHRASES.find(
      ({ words }) =>
        i + words.length <= tokens.length &&
        words.every((w, k) => !used[i + k] && wordMatches(w, folded[i + k])),
    );
    if (!hit) continue;
    const n = hit.words.length;
    for (let k = 0; k < n; k++) used[i + k] = true;
    const { rule } = hit;
    const isTopic = Boolean(rule.related);
    if (isTopic || rule.keep) {
      const words = tokens.slice(i, i + n);
      words[n - 1] = singular(words[n - 1]);
      termAt.push({ at: i, term: words.join(" ") });
    }
    push(out.related, rule.related);
    push(out.hints, rule.hints);
    push(out.contributionTypes, rule.types);
    push(out.categories, rule.categories);
  }

  tokens.forEach((token, i) => {
    if (used[i] || token.length < 2 || STOPWORDS.has(token) || STOPWORDS.has(singular(token))) return;
    if (/^\d+$/.test(token)) return;
    termAt.push({ at: i, term: singular(token) });
  });

  for (const { term } of termAt.sort((a, b) => a.at - b.at)) if (!out.terms.includes(term)) out.terms.push(term);
  out.terms = out.terms.slice(0, MAX_TERMS);
  out.related = out.related.filter((r) => !out.terms.includes(r));
  out.hints = out.hints.filter((h) => !out.terms.includes(h) && !out.related.includes(h));
  return out;
}

/**
 * The words to look for, each once. A word that contains a shorter one is
 * dropped (a search for "budget" already finds "budgeting"); the shorter word
 * keeps the strongest tier of the words it covers.
 */
export function matchTerms(parsed: ParsedSearch): MatchTerm[] {
  const rank: Record<MatchTier, number> = { core: 0, related: 1, hint: 2 };
  const all: MatchTerm[] = [
    ...parsed.terms.map((term) => ({ term, tier: "core" as const })),
    ...parsed.related.map((term) => ({ term, tier: "related" as const })),
    ...parsed.hints.map((term) => ({ term, tier: "hint" as const })),
  ];
  const out: MatchTerm[] = [];
  for (const item of [...all].sort((a, b) => a.term.length - b.term.length || rank[a.tier] - rank[b.tier])) {
    const cover = out.find((o) => item.term.includes(o.term));
    if (cover) {
      if (rank[item.tier] < rank[cover.tier]) cover.tier = item.tier;
      continue;
    }
    out.push({ ...item });
  }
  // Words the person typed first, then related words, then hints; keep the list short.
  return out.sort((a, b) => rank[a.tier] - rank[b.tier]).slice(0, MAX_MATCH_TERMS);
}

/** True when the question asks for anything at all (words or a kind of help). */
export function hasSearchIntent(parsed: ParsedSearch): boolean {
  return parsed.terms.length > 0 || parsed.contributionTypes.length > 0 || parsed.categories.length > 0;
}

// ---------- reasons ----------

/** The person's fields a viewer may see. Pass `private` only for admins. */
export type ExplainInput = {
  skills: readonly string[];
  cap_topics: readonly string[];
  contribution_types: readonly string[];
  categories: readonly string[];
  title: string | null;
  organization_name: string | null;
  bio?: string | null;
  shared_summary?: string | null;
  availability: string | null;
  location: string | null;
  /** Admin only: notes, funding focus and origin, joined. */
  private?: string | null;
};

const CATEGORY_ORG: readonly string[] = ["community_org", "business", "government"];

/** The whole word (or phrase) around a match, so "bank" reads as "banking". */
function wordAround(text: string, start: number, length: number): string {
  const isWord = (ch: string | undefined) => Boolean(ch && /[\p{L}\p{N}'-]/u.test(ch));
  let a = start;
  let b = start + length;
  while (a > 0 && isWord(text[a - 1])) a--;
  while (b < text.length && isWord(text[b])) b++;
  return text.slice(a, b).toLowerCase();
}

function findIn(text: string | null | undefined, terms: MatchTerm[]): { term: string; word: string } | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const { term } of terms) {
    const at = lower.indexOf(term);
    if (at >= 0) return { term, word: wordAround(text, at, term.length) };
  }
  return null;
}

/**
 * Why this person matches the search, strongest first: skills, the help they
 * offer, CAPs, title, organization, about text, availability, location (and
 * for admins, private notes). Uses only the fields it is given.
 * `extraTypes` are ways to help the page filtered on.
 */
export function explainMatch(
  person: ExplainInput,
  parsed: ParsedSearch,
  extraTypes: readonly string[] = [],
): MatchReason[] {
  const terms = matchTerms(parsed);
  // Words the person typed explain best; hints ("intern") only explain free text.
  const strong = terms.filter((t) => t.tier !== "hint");
  const reasons: MatchReason[] = [];
  const usedTerms = new Set<string>();
  const add = (kind: MatchReasonKind, value: string, term?: string) => {
    if (reasons.some((r) => r.kind === kind && r.value.toLowerCase() === value.toLowerCase())) return;
    reasons.push({ kind, value });
    if (term) usedTerms.add(term);
  };
  const fresh = (list: MatchTerm[]) => list.filter((t) => !usedTerms.has(t.term));

  const tagHits = (tags: readonly string[], max: number) => {
    const hits: { tag: string; term: string }[] = [];
    for (const tier of ["core", "related"] as const) {
      for (const tag of tags) {
        const term = strong.find((t) => t.tier === tier && tag.toLowerCase().includes(t.term))?.term;
        if (term && !hits.some((h) => h.tag === tag)) hits.push({ tag, term });
      }
    }
    return hits.slice(0, max);
  };

  for (const { tag, term } of tagHits(person.skills, 3)) add("skill", tag, term);

  const wanted = [...parsed.contributionTypes, ...extraTypes];
  for (const type of person.contribution_types.filter((t) => wanted.includes(t)).slice(0, 2)) add("offers", type);

  for (const { tag, term } of tagHits(person.cap_topics, 2)) add("cap", tag, term);

  const title = person.title ? findIn(person.title, fresh(strong)) : null;
  if (title && person.title) add("title", person.title, title.term);

  const org = person.organization_name ? findIn(person.organization_name, fresh(strong)) : null;
  const orgCategory = person.categories.some((c) => CATEGORY_ORG.includes(c) && parsed.categories.includes(c as ContactCategory));
  if (person.organization_name && (org || orgCategory)) add("organization", person.organization_name, org?.term);

  const about = findIn(person.shared_summary, fresh(terms)) ?? findIn(person.bio, fresh(terms));
  if (about && !reasons.some((r) => r.value.toLowerCase().includes(about.word))) add("bio", about.word, about.term);

  const free = fresh(terms);
  if (person.availability && findIn(person.availability, free)) add("availability", person.availability);
  if (person.location && findIn(person.location, free)) add("location", person.location);

  const priv = findIn(person.private, fresh(terms));
  if (priv) add("notes", priv.word, priv.term);

  return reasons;
}
