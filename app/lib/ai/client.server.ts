/**
 * The one place the app talks to Claude. Set ANTHROPIC_API_KEY (a Duplo
 * secret when deployed, .env locally). Without it, AI features say so and
 * plain search keeps working.
 */
import Anthropic from "@anthropic-ai/sdk";

export const AI_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

/** Server-side web search (Anthropic runs it; results come back in the same response). */
export const WEB_SEARCH_TOOL = { type: "web_search_20260209", name: "web_search", max_uses: 5 } as const;

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | undefined;
export function getAnthropic(): Anthropic {
  if (!isAiConfigured()) throw new Error("ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic();
  return client;
}
