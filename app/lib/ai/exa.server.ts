/**
 * Web search through Exa (EXA_API_KEY). Used by the connection finder's
 * "Search beyond our network" and the assistant's search_web tool.
 *
 * Exa's `people` category covers public professional profiles (mostly
 * LinkedIn) and `company` covers organization pages, which is what partner
 * research needs. Everything found here is unverified: callers keep it apart
 * from NVA's own records.
 *
 * Search types (Exa docs, Oct 2026): `auto` (default, ~1-2s), `deep` (runs
 * several query variations and checks them, ~10s, more precise for narrow
 * needs; about the same price for 20 results), `lite` (cached only, cheapest).
 * `fast`/`instant` are legacy names for `lite`. Contents come back as
 * highlights: Exa picks about 2,000 characters per result. Exa reports
 * deprecated or ignored options in `warnings`, which are logged here.
 */
export function isWebSearchConfigured(): boolean {
  return Boolean(process.env.EXA_API_KEY);
}

export type ExaCategory = "people" | "company";

export type ExaResult = {
  title: string;
  url: string;
  author: string | null;
  publishedDate: string | null;
  highlights: string[];
};

export class ExaError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "ExaError";
  }
}

const ENDPOINT = "https://api.exa.ai/search";

/** One Exa search. Throws ExaError on HTTP or network failures. */
export async function exaSearch(input: {
  query: string;
  category?: ExaCategory;
  numResults?: number;
  type?: "auto" | "deep" | "lite";
}): Promise<ExaResult[]> {
  const key = process.env.EXA_API_KEY;
  if (!key) throw new ExaError("EXA_API_KEY is not set", null);

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: JSON.stringify({
        query: input.query.slice(0, 500),
        type: input.type ?? "auto",
        ...(input.category ? { category: input.category } : {}),
        numResults: Math.min(Math.max(input.numResults ?? 8, 1), 25),
        userLocation: "US",
        // Exa picks the excerpts that match the query (its recommended default).
        contents: { highlights: true },
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (error) {
    throw new ExaError(error instanceof Error ? error.message : "network error", null);
  }
  if (!response.ok) {
    // Exa's error body can echo the request; keep only the status.
    throw new ExaError(`Exa search failed with HTTP ${response.status}`, response.status);
  }

  const body = (await response.json()) as { results?: unknown[]; warnings?: unknown[] };
  // Deprecated or ignored options show up here first; never log the query itself.
  if (Array.isArray(body.warnings) && body.warnings.length) {
    console.warn("Exa warnings:", JSON.stringify(body.warnings).slice(0, 500));
  }
  const results: ExaResult[] = [];
  for (const raw of body.results ?? []) {
    const r = raw as Record<string, unknown>;
    if (typeof r.url !== "string" || !/^https?:\/\//i.test(r.url)) continue;
    results.push({
      title: typeof r.title === "string" ? r.title.trim() : r.url,
      url: r.url,
      author: typeof r.author === "string" && r.author.trim() ? r.author.trim() : null,
      publishedDate: typeof r.publishedDate === "string" ? r.publishedDate.slice(0, 10) : null,
      highlights: Array.isArray(r.highlights)
        ? r.highlights.filter((h): h is string => typeof h === "string").map((h) => h.replace(/\s+/g, " ").trim())
        : [],
    });
  }
  return results;
}
