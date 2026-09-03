import type { NtfyAction } from "./types.js";

const TOPIC_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SEQUENCE_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function randomId(length = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const byte of bytes) out += ID_ALPHABET[byte % ID_ALPHABET.length];
  return out;
}

export function normalizeBaseUrl(input: string): string {
  return input.trim().replace(/\/+$/, "");
}

export function validateTopic(topic: string): string {
  if (!TOPIC_RE.test(topic)) throw new Error("invalid_topic");
  return topic;
}

export function validateSequenceId(sequenceId: string): string {
  if (!SEQUENCE_RE.test(sequenceId)) throw new Error("invalid_sequence_id");
  return sequenceId;
}

export function parseTopics(raw: string): string[] {
  const topics = [...new Set(raw.split(",").map((v) => v.trim()).filter(Boolean))];
  if (!topics.length || topics.length > 50) throw new Error("invalid_topics");
  return topics.map(validateTopic);
}

export function headerOrQuery(request: Request, url: URL, names: string[]): string {
  for (const name of names) {
    const value = request.headers.get(name);
    if (value != null && value !== "") return value;
  }
  for (const name of names) {
    const key = name.toLowerCase().replace(/^x-/, "").replace(/-/g, "_");
    const aliases = new Set([key, key.replace(/_/g, "-"), name.toLowerCase()]);
    for (const alias of aliases) {
      const value = url.searchParams.get(alias);
      if (value != null && value !== "") return value;
    }
  }
  return "";
}

export function boolParam(value: string | null | undefined, fallback = false): boolean {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function parsePriority(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const text = String(value).trim().toLowerCase();
  const aliases: Record<string, number> = { min: 1, low: 2, default: 3, high: 4, max: 5, urgent: 5 };
  const n = aliases[text] ?? Number(text);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new Error("invalid_priority");
  return n;
}

export function parseTags(value: unknown): string[] | undefined {
  if (value == null || value === "") return undefined;
  const values = Array.isArray(value) ? value.map(String) : String(value).split(",");
  const tags = values.map((v) => v.trim()).filter(Boolean);
  return tags.length ? tags.slice(0, 20) : undefined;
}

function splitActionFields(input: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      fields.push(current.trim());
      current = "";
    } else current += ch;
  }
  if (current.trim()) fields.push(current.trim());
  return fields;
}

export function parseActions(value: unknown): NtfyAction[] | undefined {
  if (value == null || value === "") return undefined;
  if (Array.isArray(value)) return value as NtfyAction[];
  if (typeof value === "object") return [value as NtfyAction];
  const text = String(value).trim();
  if (!text) return undefined;
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed as NtfyAction[];
    if (parsed && typeof parsed === "object") return [parsed as NtfyAction];
  } catch {
    // Fall through to ntfy short syntax.
  }
  return text.split(";").map((segment, index) => {
    const fields = splitActionFields(segment);
    if (fields.length < 2) throw new Error("invalid_actions");
    const action = fields[0] as NtfyAction["action"];
    if (!["view", "broadcast", "http", "copy"].includes(action)) throw new Error("invalid_actions");
    const out: NtfyAction = { id: `action${index + 1}`, action, label: fields[1].replace(/^"|"$/g, "") };
    for (const field of fields.slice(2)) {
      const eq = field.indexOf("=");
      if (eq < 0) continue;
      const key = field.slice(0, eq).trim().toLowerCase();
      const raw = field.slice(eq + 1).trim().replace(/^"|"$/g, "");
      if (key === "url") out.url = raw;
      else if (key === "method") out.method = raw.toUpperCase();
      else if (key === "body") out.body = raw;
      else if (key === "clear") out.clear = boolParam(raw);
      else if (key === "intent") out.intent = raw;
      else if (key === "value") out.value = raw;
    }
    return out;
  });
}

export function parseFutureTime(value: string, nowMs = Date.now()): number {
  const text = value.trim().toLowerCase();
  if (!text) throw new Error("invalid_delay");
  if (/^\d{10}$/.test(text)) return Number(text);
  if (/^\d{13}$/.test(text)) return Math.floor(Number(text) / 1000);
  const compact = text.match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/);
  if (compact) {
    const amount = Number(compact[1]);
    const unit = compact[2];
    const factor = unit.startsWith("s") ? 1 : unit.startsWith("m") ? 60 : unit.startsWith("h") ? 3600 : 86400;
    return Math.floor(nowMs / 1000 + amount * factor);
  }
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return Math.floor(parsed / 1000);
  throw new Error("invalid_delay");
}

export function sanitizeFilename(input: string): string {
  const safe = input.trim().replace(/[\\/\0\r\n]/g, "_").replace(/[^\p{L}\p{N}._ ()\-]/gu, "_");
  return (safe || "attachment.bin").slice(0, 180);
}

export function parseSince(value: string | null, now = Math.floor(Date.now() / 1000)): { mode: "all" | "latest" | "time" | "id"; value?: string | number } {
  if (!value || value === "all") return { mode: "all" };
  if (value === "latest") return { mode: "latest" };
  if (/^\d{10}$/.test(value)) return { mode: "time", value: Number(value) };
  const duration = value.match(/^(\d+)\s*(s|m|h|d)$/i);
  if (duration) {
    const factor = duration[2].toLowerCase() === "s" ? 1 : duration[2].toLowerCase() === "m" ? 60 : duration[2].toLowerCase() === "h" ? 3600 : 86400;
    return { mode: "time", value: now - Number(duration[1]) * factor };
  }
  return { mode: "id", value };
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
