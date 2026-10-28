/**
 * The Playlab API (https://www.playlab.ai/api/v1): the app's model runs as a
 * Playlab app, chosen by PLAYLAB_PROJECT_ID and called with an organization
 * key (PLAYLAB_API_KEY).
 *
 * The API talks to an app, not to a raw model: there is no system prompt and
 * no tool calling. So each request is one Playlab conversation whose first
 * message carries the task's instructions (the Playlab app's own instructions
 * just say to follow them, see docs/playlab-app.md). Structured answers come
 * back as JSON in the reply (playlabJson), and the assistant's lookups use a
 * small text protocol (TOOL_PROTOCOL in assistant.server.ts) parsed here by
 * parseToolCalls.
 */

const DEFAULT_URL = "https://www.playlab.ai/api/v1";

export function isPlaylabConfigured(): boolean {
  return Boolean(process.env.PLAYLAB_API_KEY && process.env.PLAYLAB_PROJECT_ID);
}

/** A failed Playlab call, with the HTTP status when there was one (0 for network errors). */
export class PlaylabError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PlaylabError";
  }
}

function base(): string {
  const url = (process.env.PLAYLAB_API_URL || DEFAULT_URL).replace(/\/$/, "");
  return `${url}/projects/${encodeURIComponent(process.env.PLAYLAB_PROJECT_ID ?? "")}/conversations`;
}

async function request(url: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.PLAYLAB_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new PlaylabError("Could not reach Playlab", 0);
  }
  if (!response.ok) {
    // Playlab answers errors as {"error": "..."}; keep the text short and never echo the key.
    let detail = "";
    try {
      const json = (await response.json()) as { error?: unknown };
      detail = typeof json.error === "string" ? json.error.slice(0, 200) : "";
    } catch {
      // Not JSON.
    }
    throw new PlaylabError(`Playlab ${response.status}${detail ? `: ${detail}` : ""}`, response.status);
  }
  return response;
}

/** Reads a Playlab message stream (server-sent events), calling onDelta for each piece of text. Returns the full reply. */
export async function readPlaylabStream(body: ReadableStream<Uint8Array>, onDelta?: (delta: string) => void): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  const handle = (event: string) => {
    let name = "message";
    const data: string[] = [];
    for (const line of event.split(/\r?\n/)) {
      if (line.startsWith("event:")) name = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (!data.length) return;
    let value: unknown;
    try {
      value = JSON.parse(data.join("\n"));
    } catch {
      return;
    }
    const delta = (value as { delta?: unknown } | null)?.delta;
    if (typeof delta === "string") {
      full += delta;
      onDelta?.(delta);
    } else if (name === "error") {
      const message = (value as { error?: unknown; message?: unknown } | null)?.error ?? (value as { message?: unknown })?.message;
      throw new PlaylabError(`Playlab stream error${typeof message === "string" ? `: ${message.slice(0, 200)}` : ""}`, 500);
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut;
    while ((cut = buffer.search(/\r?\n\r?\n/)) >= 0) {
      handle(buffer.slice(0, cut));
      buffer = buffer.slice(cut).replace(/^\r?\n\r?\n/, "");
    }
  }
  if (buffer.trim()) handle(buffer);
  return full;
}

/** One Playlab conversation: send messages in turn, each reply streamed back. */
export class PlaylabConversation {
  private id: string | null = null;

  constructor(private readonly signal?: AbortSignal) {}

  async send(message: string, onDelta?: (delta: string) => void): Promise<string> {
    if (!this.id) {
      const created = await request(base(), {}, this.signal);
      const json = (await created.json()) as { conversation?: { id?: unknown } };
      if (typeof json.conversation?.id !== "string") throw new PlaylabError("Playlab returned no conversation", 502);
      this.id = json.conversation.id;
    }
    const response = await request(`${base()}/${encodeURIComponent(this.id)}/messages`, { input: { message } }, this.signal);
    if (!response.body) throw new PlaylabError("Playlab returned no reply", 502);
    return readPlaylabStream(response.body, onDelta);
  }
}

/**
 * The first JSON object in a reply: bare, or inside a ```json fence, with any
 * words around it ignored. Null when there is none.
 */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  for (const candidate of [fenced, text]) {
    if (!candidate) continue;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) continue;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

/**
 * Asks for one JSON object: instructions and data go in the message, with the
 * shape it must have. Asks once more in the same conversation when the reply
 * has no JSON. Null when it still has none.
 */
export async function playlabJson({ system, prompt, shape }: { system: string; prompt: string; shape: unknown }): Promise<unknown> {
  const conversation = new PlaylabConversation();
  const message = [
    "# Instructions",
    system,
    "# Task",
    prompt,
    "# Reply format",
    `Reply with only one JSON object that matches this JSON Schema, and nothing else (no words before or after it):\n${JSON.stringify(shape)}`,
  ].join("\n\n");
  const first = extractJson(await conversation.send(message));
  if (first !== null) return first;
  return extractJson(
    await conversation.send("Your reply was not a JSON object. Reply again with only the JSON object, in the format above."),
  );
}

export type ParsedToolCall = { name: string; input: unknown };

const TOOL_CALL = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;

/** The <tool_call>{"name": ..., "input": ...}</tool_call> blocks in a reply, in order (invalid ones skipped). */
export function parseToolCalls(text: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];
  for (const match of text.matchAll(TOOL_CALL)) {
    const value = extractJson(match[1]) as { name?: unknown; input?: unknown } | null;
    if (value && typeof value.name === "string") calls.push({ name: value.name, input: value.input ?? {} });
  }
  return calls;
}

/** A reply with any tool-call blocks (and a trailing, unfinished one) taken out. */
export function withoutToolCalls(text: string): string {
  return text.replace(TOOL_CALL, "").replace(/<tool_call>[\s\S]*$/, "").trim();
}

const OPEN = "<tool_call>";

/**
 * Passes streamed text on, but stops at the first "<tool_call>" so the
 * protocol never shows in the chat. Holds back a tail that could be the start
 * of the tag until the next delta settles it.
 */
export function toolCallFilter(emit: (text: string) => void): { push: (delta: string) => void; flush: () => void } {
  let pending = "";
  let stopped = false;
  return {
    push(delta) {
      if (stopped) return;
      pending += delta;
      const at = pending.indexOf(OPEN);
      if (at >= 0) {
        if (at > 0) emit(pending.slice(0, at));
        pending = "";
        stopped = true;
        return;
      }
      // Keep any tail that is a prefix of the tag.
      let keep = 0;
      for (let n = Math.min(OPEN.length - 1, pending.length); n > 0; n--) {
        if (OPEN.startsWith(pending.slice(-n))) {
          keep = n;
          break;
        }
      }
      const out = pending.slice(0, pending.length - keep);
      pending = pending.slice(pending.length - keep);
      if (out) emit(out);
    },
    flush() {
      if (!stopped && pending) emit(pending);
      pending = "";
    },
  };
}
