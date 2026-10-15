/**
 * Web search through Exa (EXA_API_KEY). Used by the connection finder's
 * "Search beyond our network" and the assistant's search_web tool.
 *
 * Exa's `people` and `company` categories return profile and company pages,
 * which is what partner research needs. Everything found here is unverified:
 * callers keep it apart from NVA's own records.
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
  type?: "auto" | "fast";
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
        contents: { highlights: { query: input.query.slice(0, 200) } },
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

  const body = (await response.json()) as { results?: unknown[] };
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
