/**
 * A tiny, safe reader for the assistant's markdown-ish answers. It knows only
 * paragraphs, bullet lists ("- ", "* ", "1. "), **bold** and links to our own
 * pages ([text](/app/...)). Everything else stays plain text, and the result
 * is data rendered by React (never HTML strings), so nothing in an answer can
 * inject markup or script.
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "link"; href: string; text: string };

export type Block = { type: "paragraph"; inlines: Inline[] } | { type: "list"; items: Inline[][] };

/**
 * Only same-site paths inside the staff app. No scheme, no protocol-relative
 * "//", no backslashes, no "..", and a conservative character set.
 */
export function isSafeHref(href: string): boolean {
  if (href !== "/app" && !href.startsWith("/app/") && !href.startsWith("/app?")) return false;
  if (href.includes("//") || href.includes("\\") || href.includes("..")) return false;
  return /^[A-Za-z0-9\-._~/?=&%#+]+$/.test(href);
}

const LINK = /\[([^\]\n]{1,200})\]\(([^)\s]{1,500})\)/g;
const BOLD = /\*\*([^*\n]+?)\*\*/g;

function pushText(out: Inline[], text: string) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last?.type === "text") last.text += text;
  else out.push({ type: "text", text });
}

/** Bold runs inside a stretch of text (markers that don't pair up stay as typed). */
function parseBold(text: string, out: Inline[]) {
  let at = 0;
  for (const match of text.matchAll(BOLD)) {
    pushText(out, text.slice(at, match.index));
    out.push({ type: "bold", text: match[1] });
    at = match.index + match[0].length;
  }
  pushText(out, text.slice(at));
}

const stripBold = (text: string) => text.replace(/\*\*/g, "");

export function parseInline(line: string): Inline[] {
  const out: Inline[] = [];
  let at = 0;
  for (const match of line.matchAll(LINK)) {
    parseBold(line.slice(at, match.index), out);
    const label = stripBold(match[1]);
    const href = match[2];
    // Anything that isn't one of our pages is shown as its label only, never as a link.
    if (isSafeHref(href)) out.push({ type: "link", href, text: label });
    else pushText(out, label);
    at = match.index + match[0].length;
  }
  parseBold(line.slice(at), out);
  return out;
}

const BULLET = /^\s*(?:[-*•]|\d{1,2}[.)])\s+(.*)$/;

export function parseMarkup(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: Inline[][] | null = null;

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", inlines: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };
  const flushList = () => {
    if (list?.length) blocks.push({ type: "list", items: list });
    list = null;
  };

  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    // Headings aren't part of the format; keep their words as a bold line.
    const line = raw.replace(/^\s*#{1,6}\s+(.*)$/, "**$1**").trimEnd();
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      flushParagraph();
      list ??= [];
      list.push(parseInline(bullet[1]));
    } else if (list && /^\s{2,}\S/.test(raw)) {
      // An indented line continues the bullet above it.
      const last = list[list.length - 1];
      last.push({ type: "text", text: " " }, ...parseInline(line.trim()));
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}
