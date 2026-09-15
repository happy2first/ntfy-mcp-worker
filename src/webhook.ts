import { validateTopic } from "./protocol.ts";

export const WEBHOOK_MAX_BYTES = 70_000;
export const WEBHOOK_DEFAULTS = {
  title: ["title", "subject", "name"],
  message: ["message", "summary", "content", "description", "text", "body"],
  click: ["url", "link", "href", "click"],
};
export type Mapping = Partial<Record<keyof typeof WEBHOOK_DEFAULTS, string[]>>;
export type WebhookConfig = { global: Mapping; topic: Mapping };
const fields = Object.keys(WEBHOOK_DEFAULTS) as (keyof Mapping)[];
const own = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const encoder = new TextEncoder();

export class WebhookError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export function webhookTopic(value: string): string {
  if (typeof value !== "string") throw new WebhookError("invalid_topic");
  try { return validateTopic(value); } catch { throw new WebhookError("invalid_topic"); }
}
export function validateMapping(value: unknown): Mapping {
  if (!object(value) || Object.keys(value).some(key => !fields.includes(key as keyof Mapping))) throw new WebhookError("invalid_mapping");
  const result: Mapping = {};
  for (const field of fields) {
    if (!own(value, field)) continue;
    const paths = value[field];
    if (!Array.isArray(paths) || paths.length > 20 || paths.some(path => typeof path !== "string" || path.length > 160 || !/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(path) || path.split(".").some((p: string) => ["__proto__", "prototype", "constructor"].includes(p)))) throw new WebhookError("invalid_mapping_paths");
    if (paths.length) result[field] = [...new Set(paths)];
  }
  return result;
}

async function hmacKey(master: string) {
  if (!master) throw new WebhookError("webhook_master_secret_not_configured", 503);
  return crypto.subtle.importKey("raw", encoder.encode(master), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function generateWebhookSecret(topic: string, master: string): Promise<string> {
  const key = await hmacKey(master);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(webhookTopic(topic)));
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function verifyWebhookSecret(topic: string, secret: string, master: string): Promise<boolean> {
  const key = await hmacKey(master);
  if (!/^[a-f0-9]{64}$/.test(secret)) return false;
  const signature = Uint8Array.from(secret.match(/../g)!, hex => parseInt(hex, 16));
  // Web Crypto verifies the MAC without a JavaScript string comparison.
  return crypto.subtle.verify("HMAC", key, signature, encoder.encode(webhookTopic(topic)));
}
export async function readWebhookBody(request: Request, limit = WEBHOOK_MAX_BYTES): Promise<string> {
  if (Number(request.headers.get("content-length")) > limit) throw new WebhookError("payload_too_large", 413);
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new WebhookError("payload_too_large", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

type Candidate = { parts: string[]; value: unknown };
function candidates(payload: Record<string, unknown>, path: string): Candidate[] {
  const parts = path.split(".");
  let current: unknown = payload;
  for (const part of parts) {
    if (!object(current) || !own(current, part)) { current = undefined; break; }
    current = current[part];
  }
  const found: Candidate[] = current === undefined ? [] : [{ parts, value: current }];
  // Bare aliases also search nested objects breadth-first. Explicit dotted paths are exact.
  if (parts.length === 1) {
    const queue: { value: Record<string, unknown>; parts: string[] }[] = [{ value: payload, parts: [] }];
    for (let i = 0; i < queue.length; i++) {
      const parent = queue[i];
      if (parent.parts.length && own(parent.value, path)) found.push({ parts: [...parent.parts, path], value: parent.value[path] });
      for (const [key, value] of Object.entries(parent.value)) if (object(value)) queue.push({ value, parts: [...parent.parts, key] });
    }
  }
  return found;
}
function mappedText(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() ? value : undefined;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}
function safeClick(value: string): boolean {
  if (value.length > 2048) return false;
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}
function removePath(payload: Record<string, unknown>, parts: string[]) {
  const parents: Record<string, unknown>[] = [payload];
  for (const part of parts.slice(0, -1)) {
    const next = parents[parents.length - 1][part];
    if (!object(next)) return;
    parents.push(next);
  }
  delete parents[parents.length - 1][parts[parts.length - 1]];
  for (let i = parents.length - 1; i > 0 && !Object.keys(parents[i]).length; i--) delete parents[i - 1][parts[i - 1]];
}
function adaptWebhookUnchecked(raw: string, contentType: string, config: WebhookConfig = { global: {}, topic: {} }): { title?: string; message: string; click?: string; content_type?: string } {
  const type = contentType.split(";", 1)[0].trim().toLowerCase();
  if (type === "text/markdown") return { message: raw, content_type: "text/markdown" };
  let payload: unknown;
  try {
    if (type === "application/x-www-form-urlencoded") {
      const form: Record<string, unknown> = Object.create(null);
      for (const [key, value] of new URLSearchParams(raw)) {
        form[key] = own(form, key) ? [...(Array.isArray(form[key]) ? form[key] as unknown[] : [form[key]]), value] : value;
      }
      payload = form;
    } else payload = JSON.parse(raw); // Also accepts JSON sent with text/plain or no Content-Type.
  } catch { return { message: raw }; }
  // Pretty printing may be much larger than the received payload; never truncate it.
  const format = (value: unknown) => {
    const pretty = JSON.stringify(value, null, 2);
    return encoder.encode(pretty).byteLength <= WEBHOOK_MAX_BYTES ? pretty : JSON.stringify(value);
  };
  if (!object(payload)) return { message: typeof payload === "string" ? payload : format(payload) };
  const remaining = structuredClone(payload);
  const mapped: { title?: string; message?: string; click?: string } = {};
  for (const field of fields) {
    const paths = [...(config.topic[field] || []), ...(config.global[field] || []), ...WEBHOOK_DEFAULTS[field]];
    search: for (const path of new Set(paths)) {
      for (const candidate of candidates(payload, path)) {
        const text = mappedText(candidate.value);
        if (text === undefined || (field === "click" && !safeClick(text))) continue;
        mapped[field] = field === "title" ? text.slice(0, 256) : text;
        // Keep the complete original value if the title had to be shortened.
        if (mapped[field] === text) removePath(remaining, candidate.parts);
        break search;
      }
    }
  }
  let message = mapped.message === undefined ? format(payload) : mapped.message;
  if (mapped.message !== undefined && Object.keys(remaining).length) message += "\n\n" + format(remaining);
  if (encoder.encode(message).byteLength > WEBHOOK_MAX_BYTES) message = JSON.stringify(payload);
  return { ...mapped, message };
}

// Extremely deep but valid JSON may exceed the runtime's clone/stringify stack.
// The bounded original request remains a lossless fallback in that case.
export function adaptWebhook(raw: string, contentType: string, config: WebhookConfig = { global: {}, topic: {} }): ReturnType<typeof adaptWebhookUnchecked> {
  try { return adaptWebhookUnchecked(raw, contentType, config); }
  catch (error) { if (error instanceof RangeError) return { message: raw }; throw error; }
}

export type WebhookDependencies = {
  master: string;
  config: (topic: string) => Promise<WebhookConfig>;
  publish: (topic: string, message: ReturnType<typeof adaptWebhook>) => Promise<unknown>;
};
export function webhookErrorResponse(error: unknown): Response {
  return Response.json({ error: error instanceof WebhookError ? error.message : "webhook_internal_error" }, { status: error instanceof WebhookError ? error.status : 500, headers: { "cache-control": "no-store" } });
}
export async function handleWebhook(request: Request, deps: WebhookDependencies): Promise<Response> {
  try {
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
    const match = new URL(request.url).pathname.match(/^\/webhook\/([^/]+)\/([^/]+)$/);
    if (!match) throw new WebhookError("invalid_webhook_path", 404);
    let topic: string;
    try { topic = webhookTopic(decodeURIComponent(match[1])); } catch { throw new WebhookError("invalid_topic"); }
    if (!await verifyWebhookSecret(topic, match[2], deps.master)) throw new WebhookError("webhook_unauthorized", 401);
    const raw = await readWebhookBody(request);
    const message = adaptWebhook(raw, request.headers.get("content-type") || "text/plain", await deps.config(topic));
    return Response.json(await deps.publish(topic, message), { headers: { "cache-control": "no-store" } });
  } catch (error) { return webhookErrorResponse(error); }
}
