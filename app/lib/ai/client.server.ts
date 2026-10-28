/**
 * The one place the app chooses its AI provider.
 *
 * - PLAYLAB_API_KEY + PLAYLAB_PROJECT_ID (NVA's setup): the Playlab API
 *   (playlab.server.ts). The model is whichever one the Playlab app is set to.
 * - ANTHROPIC_API_KEY: Claude directly from Anthropic, with the Anthropic SDK.
 * - Neither: AI features say so and plain search keeps working.
 *
 * AI_MODEL overrides the Claude model (Anthropic only; Playlab's is set in the app).
 */
import Anthropic from "@anthropic-ai/sdk";
import { isPlaylabConfigured } from "./playlab.server";

export type AiProvider = "playlab" | "anthropic";

export function aiProvider(): AiProvider | null {
  if (isPlaylabConfigured()) return "playlab";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

export function isAiConfigured(): boolean {
  return aiProvider() !== null;
}

/** The model, for Claude calls and the Settings page. */
export function aiModel(): string {
  if (aiProvider() === "playlab") return "Playlab";
  return process.env.AI_MODEL || "claude-opus-5-5";
}

let client: Anthropic | undefined;

export function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic();
  return client;
}
