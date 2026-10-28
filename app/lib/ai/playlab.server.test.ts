import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createPerson } from "~/lib/people.server";
import type { SessionUser } from "~/lib/types";
import { playlabFirstMessage, runAssistant, type ToolStep } from "./assistant.server";
import {
  extractJson,
  parseToolCalls,
  playlabJson,
  readPlaylabStream,
  toolCallFilter,
  withoutToolCalls,
} from "./playlab.server";

const admin: SessionUser = { id: "pa1", email: "a@nva.test", name: "Ada Admin", role: "admin", locale: "en" };
const staff: SessionUser = { id: "ps1", email: "s@nva.test", name: "Sam Staff", role: "staff", locale: "en" };

/** A Playlab message stream with the reply split into pieces, as Playlab sends it. */
function sse(...pieces: string[]): string {
  const head = 'event: user_message\ndata: {"id":"m1","content":"hi","source":"user"}\n\nevent: message\ndata: {"id":"m2","content":""}\n\n';
  return head + pieces.map((delta, i) => `id: x-${i}\nevent: append\ndata: ${JSON.stringify({ delta })}\n\n`).join("");
}

const streamOf = (text: string) => new Response(text).body!;

/** Fakes the Playlab API: one conversation, then each message gets the next reply. Records what was sent. */
function fakePlaylab(replies: string[][]) {
  const sent: string[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    expect(String(new Headers(init.headers).get("authorization"))).toBe("Bearer sk-test");
    if (url.endsWith("/conversations")) return Response.json({ conversation: { id: "c1" } });
    sent.push((JSON.parse(String(init.body)) as { input: { message: string } }).input.message);
    const reply = replies.shift();
    if (!reply) return Response.json({ error: "no more replies" }, { status: 500 });
    return new Response(sse(...reply), { headers: { "content-type": "text/event-stream" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("PLAYLAB_API_KEY", "sk-test");
  vi.stubEnv("PLAYLAB_PROJECT_ID", "proj1");
  return { sent, fetchMock };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("readPlaylabStream", () => {
  it("joins the append deltas and ignores the other events", async () => {
    const seen: string[] = [];
    const full = await readPlaylabStream(streamOf(sse("Hel", "lo", " there")), (d) => seen.push(d));
    expect(full).toBe("Hello there");
    expect(seen).toEqual(["Hel", "lo", " there"]);
  });

  it("throws on an error event", async () => {
    await expect(readPlaylabStream(streamOf('event: error\ndata: {"error":"quota"}\n\n'))).rejects.toThrow(/quota/);
  });
});

describe("the tool protocol", () => {
  it("parses tool calls, fenced or not, and skips broken ones", () => {
    const reply =
      'Looking.\n<tool_call>{"name": "search_people", "input": {"q": "sewing"}}</tool_call>\n' +
      '<tool_call>```json\n{"name":"list_caps"}\n```</tool_call>\n<tool_call>{not json}</tool_call>';
    expect(parseToolCalls(reply)).toEqual([
      { name: "search_people", input: { q: "sewing" } },
      { name: "list_caps", input: {} },
    ]);
    expect(withoutToolCalls(reply)).toBe("Looking.");
  });

  it("never streams the tool-call tag, even split across deltas", () => {
    const out: string[] = [];
    const filter = toolCallFilter((t) => out.push(t));
    for (const d of ["One mom", "ent <", "tool_", 'call>{"name":"x"}', "</tool_call>"]) filter.push(d);
    filter.flush();
    expect(out.join("")).toBe("One moment ");
  });

  it("lets a lone < through once it is clearly not the tag", () => {
    const out: string[] = [];
    const filter = toolCallFilter((t) => out.push(t));
    for (const d of ["3 <", " 5"]) filter.push(d);
    filter.flush();
    expect(out.join("")).toBe("3 < 5");
  });

  it("finds a JSON object inside words or a fence", () => {
    expect(extractJson('Here it is:\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! {"a": {"b": 2}} Hope that helps.')).toEqual({ a: { b: 2 } });
    expect(extractJson("no json")).toBeNull();
  });
});

describe("playlabJson", () => {
  it("asks once more when the reply has no JSON", async () => {
    const { sent } = fakePlaylab([["Sorry, here you go."], ['{"subject": "Hi"}']]);
    expect(await playlabJson({ system: "Write.", prompt: "An email.", shape: { type: "object" } })).toEqual({ subject: "Hi" });
    expect(sent).toHaveLength(2);
    expect(sent[0]).toContain("# Reply format");
  });
});

describe("the assistant on Playlab", () => {
  let mei: string;
  beforeAll(async () => {
    mei = await createPerson(
      { full_name: "Mei Playlab", skills: ["quilting"], contribution_types: ["skills_lesson"], status: "active" },
      null,
    );
  });

  it("runs the tools the model asks for and streams only the answer", async () => {
    const { sent } = fakePlaylab([
      ['<tool_call>{"name": "search_people", "input": {"query": "quilting"}}', "</tool_call>"],
      ["[Mei Playlab](/app/people/", `${mei}) teaches quilting.`],
    ]);
    const streamed: string[] = [];
    const steps: ToolStep[] = [];
    const result = await runAssistant({
      messages: [{ role: "user", content: "Who can teach quilting?" }],
      locale: "en",
      user: admin,
      events: { textDelta: (_id, d) => streamed.push(d), toolStart: (s) => steps.push(s) },
    });
    expect(result).toMatchObject({ ok: true, mode: "ai", personIds: [mei] });
    expect(streamed.join("")).toBe(`[Mei Playlab](/app/people/${mei}) teaches quilting.`);
    expect(steps.map((s) => s.name)).toEqual(["search_people"]);
    expect(sent[0]).toContain("Who can teach quilting?");
    expect(sent[1]).toContain('<tool_result name="search_people">');
    expect(sent[1]).toContain("Mei Playlab");
  });

  it("refuses admin tools to staff, and their first message lists only staff tools", async () => {
    const { sent } = fakePlaylab([['<tool_call>{"name": "list_follow_ups", "input": {}}</tool_call>'], ["Nobody found."]]);
    const result = await runAssistant({ messages: [{ role: "user", content: "What is due?" }], locale: "en", user: staff });
    expect(result).toMatchObject({ ok: true, answer: "Nobody found." });
    expect(sent[0]).not.toContain("list_follow_ups");
    expect(sent[1]).toContain('<tool_result name="list_follow_ups" error="true">');
    expect(sent[1]).toContain("Unknown tool");
  });

  it("puts earlier turns in the first message", () => {
    const message = playlabFirstMessage(
      [
        { role: "user", content: "Who sews?" },
        { role: "assistant", content: "Mei does." },
        { role: "user", content: "Anyone else?" },
      ],
      "en",
      admin,
    );
    expect(message).toContain("Staff member: Who sews?\n\nAssistant: Mei does.");
    expect(message.trim().endsWith("Anyone else?")).toBe(true);
  });

  it("maps a bad key to the auth error", async () => {
    vi.stubEnv("PLAYLAB_API_KEY", "sk-test");
    vi.stubEnv("PLAYLAB_PROJECT_ID", "proj1");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Invalid API key." }, { status: 401 })));
    const result = await runAssistant({ messages: [{ role: "user", content: "Who sews?" }], locale: "en", user: admin });
    expect(result).toEqual({ ok: false, error: "assistant.errorAuth" });
  });
});
