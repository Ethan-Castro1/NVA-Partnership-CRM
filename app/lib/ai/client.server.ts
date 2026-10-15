/**
 * The one place the app talks to Claude.
 *
 * - OPENROUTER_API_KEY (NVA's setup): Claude through OpenRouter's
 *   Anthropic-compatible endpoint, so the official Anthropic SDK and the same
 *   tool loops work unchanged. Model "anthropic/claude-opus-5.5".
 * - ANTHROPIC_API_KEY: Claude directly from Anthropic.
 * - Neither: AI features say so and plain search keeps working.
 *
 * AI_MODEL overrides the model for either provider.
 */
import Anthropic from "@anthropic-ai/sdk";

export type AiProvider = "openrouter" | "anthropic";

export function aiProvider(): AiProvider | null {
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

export function isAiConfigured(): boolean {
  return aiProvider() !== null;
}

export function aiModel(): string {
  if (process.env.AI_MODEL) return process.env.AI_MODEL;
  return aiProvider() === "openrouter" ? "anthropic/claude-opus-5.5" : "claude-opus-5-5";
}

/** Anthropic-only request features (beta headers such as refusal fallbacks, strict tools). */
export function usesAnthropicDirectly(): boolean {
  return aiProvider() === "anthropic";
}

let client: { provider: AiProvider; sdk: Anthropic } | undefined;

export function getAnthropic(): Anthropic {
  const provider = aiProvider();
  if (!provider) throw new Error("No AI key is set (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)");
  if (client?.provider !== provider) {
    const sdk =
      provider === "openrouter"
        ? new Anthropic({
            baseURL: "https://openrouter.ai/api",
            // OpenRouter takes its key as a bearer token; send no x-api-key.
            apiKey: null,
            authToken: process.env.OPENROUTER_API_KEY,
            defaultHeaders: {
              "HTTP-Referer": process.env.APP_URL || "https://nva-village-partners.vercel.app",
              "X-OpenRouter-Title": "NVA Village Partners",
            },
          })
        : new Anthropic();
    client = { provider, sdk };
  }
  return client.sdk;
}
