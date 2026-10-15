/**
 * The one place the app chooses its AI model.
 *
 * - OPENROUTER_API_KEY (NVA's setup): GLM 5.3 Flash ("z-ai/glm-5.3-flash")
 *   through OpenRouter, called with the AI SDK and the OpenRouter provider
 *   (getOpenRouterModel). Fast and inexpensive, with tool calling.
 * - ANTHROPIC_API_KEY: Claude directly from Anthropic, with the Anthropic SDK.
 * - Neither: AI features say so and plain search keeps working.
 *
 * AI_MODEL overrides the model for either provider.
 */
import Anthropic from "@anthropic-ai/sdk";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

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
  return aiProvider() === "openrouter" ? "z-ai/glm-5.3-flash" : "claude-opus-5-5";
}

let openRouter: ReturnType<typeof createOpenRouter> | undefined;

/** The OpenRouter model for AI SDK calls (streamText, generateText). */
export function getOpenRouterModel() {
  openRouter ??= createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
    headers: {
      "HTTP-Referer": process.env.APP_URL || "https://nva-village-partners.vercel.app",
      "X-Title": "NVA Village Partners",
    },
  });
  return openRouter(aiModel());
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
