import { describe, expect, it } from "vitest";
import { isSafeHref, parseInline, parseMarkup } from "./markup";

describe("isSafeHref", () => {
  it("allows only paths inside the staff app", () => {
    expect(isSafeHref("/app/people/123")).toBe(true);
    expect(isSafeHref("/app/people?q=sewing%20class")).toBe(true);
    expect(isSafeHref("/app")).toBe(true);
    for (const bad of [
      "https://evil.example",
      "javascript:alert(1)",
      "//evil.example/app/",
      "/app//evil.example",
      "/app/../login",
      "/application",
      "/app/people/1\\x",
      "/app/\"onmouseover=\"x",
      "mailto:a@b.c",
      "/login",
    ]) {
      expect(isSafeHref(bad), bad).toBe(false);
    }
  });
});

describe("parseInline", () => {
  it("keeps internal links and turns external and javascript: links into plain text", () => {
    expect(parseInline("See [Mei Lin](/app/people/abc).")).toEqual([
      { type: "text", text: "See " },
      { type: "link", href: "/app/people/abc", text: "Mei Lin" },
      { type: "text", text: "." },
    ]);
    expect(parseInline("Click [here](javascript:alert(1)) or [there](https://evil.example)")).toEqual([
      { type: "text", text: "Click here) or there" },
    ]);
    expect(parseInline("[x](//evil.example)")).toEqual([{ type: "text", text: "x" }]);
  });

  it("reads bold and leaves unpaired markers alone", () => {
    expect(parseInline("A **bold** move")).toEqual([
      { type: "text", text: "A " },
      { type: "bold", text: "bold" },
      { type: "text", text: " move" },
    ]);
    expect(parseInline("2 ** 3")).toEqual([{ type: "text", text: "2 ** 3" }]);
  });

  it("never produces HTML: tags stay as text", () => {
    expect(parseInline("<img src=x onerror=alert(1)>")).toEqual([{ type: "text", text: "<img src=x onerror=alert(1)>" }]);
  });
});

describe("parseMarkup", () => {
  it("splits paragraphs and bullet lists", () => {
    const blocks = parseMarkup("Two people fit:\n\n- **Mei** sews\n- Tom welds\n  and hosts interns\n\nThat's all.");
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "list", "paragraph"]);
    const list = blocks[1];
    expect(list.type === "list" && list.items).toHaveLength(2);
    expect(list.type === "list" && list.items[1].map((i) => ("text" in i ? i.text : "")).join("")).toBe(
      "Tom welds and hosts interns",
    );
  });

  it("treats headings as bold lines", () => {
    expect(parseMarkup("## Matches")).toEqual([{ type: "paragraph", inlines: [{ type: "bold", text: "Matches" }] }]);
  });
});
