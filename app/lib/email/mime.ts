/**
 * Small, pure helpers for email text: building a plain-text message for the
 * Gmail API, reading addresses out of headers, and cleaning snippets.
 */

/** No CR or LF in a header value (blocks header injection). */
export const headerSafe = (value: string): string => value.replace(/[\r\n]+/g, " ").trim();

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;
export const isEmailAddress = (value: string): boolean => value.length <= 320 && EMAIL_RE.test(value);

/** RFC 2047 encoding for headers that aren't plain ASCII. */
function encodeHeader(value: string): string {
  const safe = headerSafe(value);
  return /^[\x20-\x7e]*$/.test(safe) ? safe : `=?UTF-8?B?${Buffer.from(safe, "utf8").toString("base64")}?=`;
}

function wrap76(text: string): string {
  return text.replace(/.{1,76}/g, (line) => `${line}\r\n`).trimEnd();
}

export type OutgoingEmail = { from: string; to: string[]; subject: string; body: string };

/** A plain-text UTF-8 message (RFC 5322), for Gmail's users.messages.send. */
export function buildMime(email: OutgoingEmail): string {
  const to = email.to.map(headerSafe).filter(isEmailAddress);
  if (!to.length) throw new Error("No valid recipient");
  const body = email.body.replace(/\r?\n/g, "\r\n");
  return [
    `From: ${headerSafe(email.from)}`,
    `To: ${to.join(", ")}`,
    `Subject: ${encodeHeader(email.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(Buffer.from(body, "utf8").toString("base64")),
  ].join("\r\n");
}

/** Every email address in a header like `Ana <ana@x.org>, bo@y.org`, lowercased. */
export function parseAddresses(header: string | null | undefined): string[] {
  if (!header) return [];
  const found = header.match(/[^\s<>,;:"'()]+@[^\s<>,;:"'()]+/g) ?? [];
  return [...new Set(found.map((a) => a.toLowerCase().replace(/[.]+$/, "")))];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Snippets arrive HTML-escaped (Gmail) or with extra whitespace: decode, collapse, cap at 200 characters. */
export function cleanSnippet(text: string | null | undefined, max = 200): string | null {
  if (!text) return null;
  const decoded = text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
  if (!decoded) return null;
  return decoded.length > max ? `${decoded.slice(0, max - 1).trimEnd()}…` : decoded;
}
