import { describe, expect, it } from "vitest";
import { capTopicShort, CAP_TOPIC_KEYS } from "~/lib/cap-catalog";
import { mapOldTopics } from "~/lib/cap-catalog.server";
import { createMcpKey, revokeMcpKey, userForMcpKey, listMcpKeys } from "~/lib/mcp-keys.server";
import { createUser } from "~/lib/auth.server";
import { chatTitle, getChat, saveChat, listChats } from "./assistant-chats.server";
import { absolutizeLinks } from "./mcp.server";
import { buildLeadQueries } from "./web-leads.server";
import type { AskMessage } from "~/components/assistant/chat-types";

describe("CAP catalog", () => {
  it("has this semester's 15 CAPs and maps old demo topics onto them", () => {
    expect(CAP_TOPIC_KEYS).toHaveLength(15);
    expect(capTopicShort("streams in the balance")).toBe("Streams in the Balance");
    expect(mapOldTopics(["the bay", "food access", "oysters"])).toEqual(["streams in the balance", "oysters"]);
  });
});

describe("MCP", () => {
  it("turns app links into full links", () => {
    expect(absolutizeLinks('{"url":"/app/people/1"} see /app/caps/2', "https://x.test")).toBe(
      '{"url":"https://x.test/app/people/1"} see https://x.test/app/caps/2',
    );
  });

  it("finds the staff member for a key, and forgets revoked keys", async () => {
    const id = await createUser({ email: "mcp@nva.test", name: "Mcp Tester", password: "a-long-password-1", role: "teacher", locale: "en" });
    const key = await createMcpKey(id, "My Claude");
    expect(key).toMatch(/^nva_/);
    expect((await userForMcpKey(key!))?.id).toBe(id);
    expect(await userForMcpKey("nva_wrongwrongwrongwrongwrongwrongwrong")).toBeNull();
    const [saved] = await listMcpKeys(id);
    await revokeMcpKey(id, saved.id);
    expect(await userForMcpKey(key!)).toBeNull();
  });
});

describe("saved chats", () => {
  it("titles a chat by its first question and keeps it private", async () => {
    const owner = await createUser({ email: "chat@nva.test", name: "Chat Owner", password: "a-long-password-1", role: "teacher", locale: "en" });
    const other = await createUser({ email: "chat2@nva.test", name: "Someone Else", password: "a-long-password-1", role: "teacher", locale: "en" });
    const messages = [{ id: "u1", role: "user", parts: [{ type: "text", text: "Who can teach sewing?" }] }] as AskMessage[];
    expect(chatTitle(messages)).toBe("Who can teach sewing?");
    await saveChat(owner, "chat-a", messages);
    // Another person can't overwrite or read it.
    await saveChat(other, "chat-a", []);
    expect((await getChat(owner, "chat-a"))?.messages).toHaveLength(1);
    expect(await getChat(other, "chat-a")).toBeNull();
    expect((await listChats(owner)).map((c) => c.id)).toEqual(["chat-a"]);
  });
});

describe("web lead queries", () => {
  it("adds a funders search when the need is about funding", () => {
    expect(buildLeadQueries("grants for STEM programs", null).map((q) => q.category)).toEqual(["people", "company", "company"]);
    expect(buildLeadQueries("sewing", null)[0].query).toMatch(/^professional profiles of/);
  });
});
