import { Buffer } from "node:buffer";
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { ADMIN_PAGE } from "./admin-page.js";
import {
  boolParam,
  headerOrQuery,
  normalizeBaseUrl,
  parseActions,
  parseFutureTime,
  parsePriority,
  parseTags,
  parseTopics,
  randomId,
  sanitizeFilename,
  validateSequenceId,
  validateTopic,
} from "./protocol.js";
import type { Env, NtfyMessage, PublishInput, StoredAttachment, StoredMessage } from "./types.js";
export { NtfyServerDO } from "./server-do.js";

const VERSION = "0.1.0";
const SERVER_DO_NAME = "__ntfy_server__";
const MAX_TEXT_BYTES = 70_000;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const result = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });

function serverStub(env: Env) {
  return env.NTFY_SERVER.get(env.NTFY_SERVER.idFromName(SERVER_DO_NAME));
}

async function callServer(env: Env, path: string, init?: RequestInit): Promise<Response> {
  return serverStub(env).fetch(`https://ntfy.internal${path}`, init as any);
}

async function callServerJson<T = any>(env: Env, path: string, init?: RequestInit): Promise<T> {
  const response = await callServer(env, path, init);
  const data = await response.json().catch(() => ({ error: "invalid_internal_response" })) as any;
  if (!response.ok) throw new Error(data.message || data.error || `Durable Object HTTP ${response.status}`);
  return data as T;
}

function parseAuthorization(request: Request): string {
  const direct = request.headers.get("authorization");
  if (direct) return direct;
  const encoded = new URL(request.url).searchParams.get("auth");
  if (!encoded) return "";
  try { return Buffer.from(encoded, "base64").toString("utf8"); } catch { return ""; }
}

function topicAuthConfigured(env: Env): boolean {
  return Boolean(env.NTFY_ACCESS_TOKEN || (env.NTFY_USERNAME && env.NTFY_PASSWORD));
}

async function verifyTopicAccess(request: Request, env: Env): Promise<boolean> {
  if (!topicAuthConfigured(env)) return true;
  const auth = parseAuthorization(request);
  if (env.NTFY_ACCESS_TOKEN && auth === `Bearer ${env.NTFY_ACCESS_TOKEN}`) return true;
  if (env.NTFY_USERNAME && env.NTFY_PASSWORD && auth.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
      const idx = decoded.indexOf(":");
      if (idx >= 0 && decoded.slice(0, idx) === env.NTFY_USERNAME && decoded.slice(idx + 1) === env.NTFY_PASSWORD) return true;
    } catch { /* continue to admin auth */ }
  }
  return verifyAdminAccess(request, env);
}

async function verifyAdminAccess(request: Request, env: Env): Promise<boolean> {
  const url = new URL(request.url);
  if (env.ADMIN_TOKEN) {
    const bearer = request.headers.get("authorization") === `Bearer ${env.ADMIN_TOKEN}`;
    const header = request.headers.get("x-admin-token") === env.ADMIN_TOKEN;
    const cookie = (request.headers.get("cookie") || "").split(";").map((v) => v.trim()).find((v) => v.startsWith("ntfy_admin="))?.slice("ntfy_admin=".length);
    const query = url.searchParams.get("token") === env.ADMIN_TOKEN;
    if (bearer || header || cookie === env.ADMIN_TOKEN || query) return true;
  }
  if (env.TEAM_DOMAIN && env.POLICY_AUD) {
    try {
      const team = env.TEAM_DOMAIN.replace(/\/$/, "");
      const token = request.headers.get("cf-access-jwt-assertion");
      if (!token) return false;
      const jwks = createRemoteJWKSet(new URL(`${team}/cdn-cgi/access/certs`));
      await jwtVerify(token, jwks, { issuer: team, audience: env.POLICY_AUD });
      return true;
    } catch { return false; }
  }
  return false;
}

function protocolDenied(): Response {
  return Response.json({ code: 40101, http: 401, error: "unauthorized" }, { status: 401, headers: { "www-authenticate": "Basic realm=\"ntfy\", Bearer" } });
}

function adminDenied(env: Env): Response {
  const configured = Boolean(env.ADMIN_TOKEN || (env.TEAM_DOMAIN && env.POLICY_AUD));
  return Response.json({
    error: configured ? "admin_unauthorized" : "admin_auth_not_configured",
    message: configured ? "需要 Cloudflare Access 或 ADMIN_TOKEN" : "请配置 Cloudflare Access (TEAM_DOMAIN/POLICY_AUD) 或 ADMIN_TOKEN 后使用 /admin 与 /mcp",
  }, { status: configured ? 401 : 503, headers: { "cache-control": "no-store" } });
}

function baseUrl(request: Request, env: Env): string {
  return normalizeBaseUrl(env.BASE_URL || new URL(request.url).origin);
}

function retentionSeconds(env: Env): number {
  const n = Number(env.MESSAGE_RETENTION_SECONDS || 43200);
  return Number.isFinite(n) ? Math.max(300, Math.min(30 * 86400, Math.trunc(n))) : 43200;
}

function attachmentRetentionSeconds(env: Env): number {
  const n = Number(env.ATTACHMENT_RETENTION_SECONDS || 10800);
  return Number.isFinite(n) ? Math.max(300, Math.min(7 * 86400, Math.trunc(n))) : 10800;
}

function boolHeaderOrQuery(request: Request, url: URL, names: string[], fallback: boolean): boolean {
  const value = headerOrQuery(request, url, names);
  return value ? boolParam(value, fallback) : fallback;
}

function messageDefaults(topic: string, env: Env, scheduledAt?: number): StoredMessage {
  const now = Math.floor(Date.now() / 1000);
  const time = scheduledAt || now;
  return {
    id: randomId(),
    time,
    expires: time + retentionSeconds(env),
    event: "message",
    topic,
    message: "",
    cache_visible: true,
    delivered: !scheduledAt,
    ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
    created_at: new Date().toISOString(),
  };
}

function normalizeJsonPublish(input: any, fallbackTopic: string | undefined, env: Env): StoredMessage {
  const topic = validateTopic(String(input.topic || fallbackTopic || ""));
  const delayRaw = input.delay ?? input.at ?? input.in;
  const scheduledAt = delayRaw ? parseFutureTime(String(delayRaw)) : undefined;
  if (scheduledAt) {
    const now = Math.floor(Date.now() / 1000);
    if (scheduledAt < now + 10) throw new Error("delay_too_small");
    if (scheduledAt > now + 3 * 86400) throw new Error("delay_too_large");
  }
  const msg = messageDefaults(topic, env, scheduledAt);
  const cache = input.cache == null ? true : boolParam(String(input.cache), true);
  if (scheduledAt && !cache) throw new Error("delay_requires_cache");
  msg.cache_visible = cache;
  msg.sequence_id = input.sequence_id || input.sequenceId ? validateSequenceId(String(input.sequence_id || input.sequenceId)) : msg.id;
  msg.message = String(input.message ?? "").slice(0, MAX_TEXT_BYTES);
  if (input.title) msg.title = String(input.title).slice(0, 256);
  msg.priority = parsePriority(input.priority);
  msg.tags = parseTags(input.tags);
  if (input.click) msg.click = String(input.click).slice(0, 2048);
  if (input.icon) msg.icon = String(input.icon).slice(0, 2048);
  msg.actions = parseActions(input.actions);
  if (boolParam(String(input.markdown ?? false), false) || input.content_type === "text/markdown") msg.content_type = "text/markdown";
  if (input.poll_id) msg.poll_id = String(input.poll_id).slice(0, 64);
  if (input.attach || input.attachment?.url) {
    const url = String(input.attach || input.attachment.url);
    const name = sanitizeFilename(String(input.filename || input.attachment?.name || url.split("/").pop() || "attachment"));
    msg.attachment = { name, ...(input.attachment?.type ? { type: String(input.attachment.type) } : {}), ...(input.attachment?.size ? { size: Number(input.attachment.size) } : {}), url };
  }
  return msg;
}

async function storeUploadAttachment(request: Request, env: Env, msg: StoredMessage, filename: string, publicBaseUrl: string): Promise<StoredAttachment> {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_ATTACHMENT_BYTES) throw new Error("attachment_too_large");
  if (!request.body) throw new Error("attachment_body_required");
  const safeName = sanitizeFilename(filename);
  const key = `attachments/${msg.id}/${safeName}`;
  const type = (request.headers.get("content-type") || "application/octet-stream").split(";", 1)[0];
  const object = await env.ATTACHMENTS.put(key, request.body, { httpMetadata: { contentType: type, contentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}` } });
  const expires = Math.floor(Date.now() / 1000) + attachmentRetentionSeconds(env);
  return { name: safeName, type, size: object?.size || length || undefined, expires, url: `${publicBaseUrl}/file/${msg.id}/${encodeURIComponent(safeName)}`, key };
}

async function parseHttpPublish(request: Request, env: Env, topic: string, sequenceId?: string): Promise<StoredMessage> {
  const url = new URL(request.url);
  const contentType = (request.headers.get("content-type") || "text/plain").split(";", 1)[0].toLowerCase();
  if (contentType === "application/json") {
    const body = await request.json<any>();
    const msg = normalizeJsonPublish(body, topic, env);
    if (sequenceId) msg.sequence_id = validateSequenceId(sequenceId);
    return msg;
  }

  const delay = headerOrQuery(request, url, ["X-Delay", "Delay", "X-At", "At", "X-In", "In"]);
  const scheduledAt = delay ? parseFutureTime(delay) : undefined;
  if (scheduledAt) {
    const now = Math.floor(Date.now() / 1000);
    if (scheduledAt < now + 10) throw new Error("delay_too_small");
    if (scheduledAt > now + 3 * 86400) throw new Error("delay_too_large");
  }
  const msg = messageDefaults(topic, env, scheduledAt);
  const sequenceHeader = headerOrQuery(request, url, ["X-Sequence-ID", "Sequence-ID", "SID"]);
  msg.sequence_id = sequenceId ? validateSequenceId(sequenceId) : sequenceHeader ? validateSequenceId(sequenceHeader) : msg.id;
  const cache = boolHeaderOrQuery(request, url, ["X-Cache", "Cache"], true);
  if (scheduledAt && !cache) throw new Error("delay_requires_cache");
  msg.cache_visible = cache;
  msg.title = headerOrQuery(request, url, ["X-Title", "Title"]).slice(0, 256) || undefined;
  msg.priority = parsePriority(headerOrQuery(request, url, ["X-Priority", "Priority", "Prio", "P"]));
  msg.tags = parseTags(headerOrQuery(request, url, ["X-Tags", "Tags", "Tag"]));
  msg.click = headerOrQuery(request, url, ["X-Click", "Click"]).slice(0, 2048) || undefined;
  msg.icon = headerOrQuery(request, url, ["X-Icon", "Icon"]).slice(0, 2048) || undefined;
  msg.actions = parseActions(headerOrQuery(request, url, ["X-Actions", "Actions", "Action"]));
  msg.poll_id = headerOrQuery(request, url, ["X-Poll-ID", "Poll-ID"]).slice(0, 64) || undefined;
  const markdown = boolHeaderOrQuery(request, url, ["X-Markdown", "Markdown", "MD"], false) || contentType === "text/markdown";
  if (markdown) msg.content_type = "text/markdown";

  const externalAttach = headerOrQuery(request, url, ["X-Attach", "Attach"]);
  const filename = headerOrQuery(request, url, ["X-Filename", "Filename", "File"]);
  const explicitMessage = headerOrQuery(request, url, ["X-Message", "Message", "M"]);
  if (externalAttach) {
    const name = sanitizeFilename(filename || externalAttach.split("/").pop() || "attachment");
    msg.attachment = { name, url: externalAttach };
    msg.message = explicitMessage || await request.text();
  } else if (filename || (!contentType.startsWith("text/") && contentType !== "application/x-www-form-urlencoded")) {
    msg.attachment = await storeUploadAttachment(request, env, msg, filename || "attachment.bin", baseUrl(request, env));
    msg.message = explicitMessage || filename || "Attachment";
  } else {
    msg.message = explicitMessage || await request.text();
  }
  if (new TextEncoder().encode(msg.message || "").byteLength > MAX_TEXT_BYTES) throw new Error("message_too_large");
  return msg;
}

async function publishStored(env: Env, msg: StoredMessage, publicBaseUrl: string): Promise<NtfyMessage> {
  return callServerJson<NtfyMessage>(env, "/publish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: msg, baseUrl: publicBaseUrl } satisfies PublishInput),
  });
}

async function manageMessage(env: Env, topic: string, sequenceId: string, event: "message_delete" | "message_clear", publicBaseUrl: string) {
  return callServerJson<NtfyMessage>(env, "/manage", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ topic, sequenceId, event, baseUrl: publicBaseUrl }),
  });
}

function ntfyError(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  const status = message.includes("not_found") ? 404 : message.includes("too_large") ? 413 : 400;
  return Response.json({ code: status * 100 + 1, http: status, error: message }, { status, headers: { "cache-control": "no-store" } });
}

async function handleAttachment(request: Request, env: Env, path: string[]): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method Not Allowed", { status: 405 });
  const id = path[1];
  const name = sanitizeFilename(decodeURIComponent(path.slice(2).join("/")));
  if (!id || !name) return new Response("Not Found", { status: 404 });
  const object = await env.ATTACHMENTS.get(`attachments/${id}/${name}`);
  if (!object) return new Response("Not Found", { status: 404 });
  const headers = new Headers({ "etag": object.httpEtag, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" });
  object.writeHttpMetadata(headers);
  if (!headers.has("content-disposition")) headers.set("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
  headers.set("content-length", String(object.size));
  return new Response(request.method === "HEAD" ? null : object.body, { headers });
}

async function proxyAdmin(request: Request, env: Env, internalPath: string): Promise<Response> {
  const init: RequestInit = { method: request.method, headers: { "content-type": request.headers.get("content-type") || "application/json" } };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = await request.text();
  const upstream = await callServer(env, internalPath, init);
  const headers = new Headers(upstream.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(upstream.body, { status: upstream.status, headers });
}

function parseNtfyRoute(pathname: string) {
  const segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (!segments.length) return { kind: "root" as const, segments };
  if (segments[0] === "file") return { kind: "file" as const, segments };
  if (segments.length === 2 && segments[1] === "publish") return { kind: "publish_get" as const, topic: segments[0], segments };
  const format = segments.at(-1);
  if (["json", "sse", "raw", "ws"].includes(format || "")) return { kind: "subscribe" as const, topics: segments[0], format: format as "json" | "sse" | "raw" | "ws", segments };
  if (segments.length >= 3 && ["clear", "read", "delete"].includes(segments[2])) return { kind: "manage_alias" as const, topic: segments[0], sequenceId: segments[1], action: segments[2], segments };
  if (segments.length === 2) return { kind: "topic_sequence" as const, topic: segments[0], sequenceId: segments[1], segments };
  return { kind: "topic" as const, topic: segments[0], segments };
}

async function handleProtocol(request: Request, env: Env): Promise<Response> {
  if (!(await verifyTopicAccess(request, env))) return protocolDenied();
  const url = new URL(request.url);
  const route = parseNtfyRoute(url.pathname);
  try {
    if (route.kind === "file") return handleAttachment(request, env, route.segments);
    if (route.kind === "subscribe") {
      if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
      const topics = parseTopics(route.topics).join(",");
      const params = new URLSearchParams(url.searchParams);
      params.set("topics", topics);
      params.set("format", route.format);
      const upstream = await callServer(env, `/subscribe?${params}`);
      return upstream;
    }
    if (route.kind === "manage_alias") {
      const topic = validateTopic(route.topic);
      const sequenceId = validateSequenceId(route.sequenceId);
      const event = route.action === "delete" ? "message_delete" : "message_clear";
      return Response.json(await manageMessage(env, topic, sequenceId, event, baseUrl(request, env)));
    }
    if (route.kind === "topic_sequence" && request.method === "DELETE") {
      return Response.json(await manageMessage(env, validateTopic(route.topic), validateSequenceId(route.sequenceId), "message_delete", baseUrl(request, env)));
    }
    if (route.kind === "topic_sequence" && (request.method === "POST" || request.method === "PUT")) {
      const msg = await parseHttpPublish(request, env, validateTopic(route.topic), validateSequenceId(route.sequenceId));
      return Response.json(await publishStored(env, msg, baseUrl(request, env)));
    }
    if (route.kind === "publish_get" && request.method === "GET") {
      const msg = await parseHttpPublish(new Request(request.url, { method: "POST", headers: request.headers, body: url.searchParams.get("message") || "" }), env, validateTopic(route.topic));
      return Response.json(await publishStored(env, msg, baseUrl(request, env)));
    }
    if (route.kind === "topic" && (request.method === "POST" || request.method === "PUT")) {
      const msg = await parseHttpPublish(request, env, validateTopic(route.topic));
      return Response.json(await publishStored(env, msg, baseUrl(request, env)));
    }
    if (route.kind === "root" && request.method === "POST" && (request.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
      const msg = normalizeJsonPublish(await request.json<any>(), undefined, env);
      return Response.json(await publishStored(env, msg, baseUrl(request, env)));
    }
    return new Response("Not Found", { status: 404 });
  } catch (error) { return ntfyError(error); }
}

async function pollMessagesForMcp(env: Env, topics: string[], since: string, limit: number, scheduled: boolean) {
  const params = new URLSearchParams({ topics: topics.join(","), format: "json", poll: "1", since, limit: String(limit) });
  if (scheduled) params.set("scheduled", "1");
  const response = await callServer(env, `/subscribe?${params}`);
  if (!response.ok) throw new Error(`poll failed: ${response.status}`);
  const text = await response.text();
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function createServer(env: Env) {
  const server = new McpServer({ name: "ntfy-mcp-worker", version: VERSION });
  server.registerTool("ntfy_publish_message", {
    description: "向本 ntfy Worker 发布或更新通知。支持标题、优先级、标签、点击链接、图标、Markdown、动作按钮、sequence ID 与延迟投递。",
    inputSchema: {
      topic: z.string().min(1).max(64).optional(),
      message: z.string().max(MAX_TEXT_BYTES),
      title: z.string().max(256).optional(),
      priority: z.union([z.number().int().min(1).max(5), z.enum(["min", "low", "default", "high", "max", "urgent"])]).optional(),
      tags: z.array(z.string().max(64)).max(20).optional(),
      click: z.string().url().optional(),
      icon: z.string().url().optional(),
      markdown: z.boolean().optional(),
      actions: z.array(z.any()).max(3).optional(),
      sequenceId: z.string().min(1).max(64).optional(),
      delay: z.string().optional(),
      cache: z.boolean().optional(),
    },
  }, async (args) => {
    const topic = args.topic || env.MCP_DEFAULT_TOPIC;
    if (!topic) throw new Error("topic 未提供，且未配置 MCP_DEFAULT_TOPIC");
    const msg = normalizeJsonPublish({ ...args, topic, sequence_id: args.sequenceId }, topic, env);
    return result(await publishStored(env, msg, normalizeBaseUrl(env.BASE_URL || "https://ntfy.mcp.happyfirst.top")));
  });
  server.registerTool("ntfy_fetch_messages", {
    description: "轮询一个或多个 ntfy topic 的缓存消息，可按 since 获取遗漏消息或查看待投递消息。",
    inputSchema: {
      topics: z.array(z.string().min(1).max(64)).min(1).max(20).optional(),
      since: z.string().default("all"),
      limit: z.number().int().min(1).max(500).default(100),
      scheduled: z.boolean().default(false),
    },
  }, async ({ topics, since, limit, scheduled }) => {
    const resolved = topics?.length ? topics.map(validateTopic) : env.MCP_DEFAULT_TOPIC ? [validateTopic(env.MCP_DEFAULT_TOPIC)] : [];
    if (!resolved.length) throw new Error("topics 未提供，且未配置 MCP_DEFAULT_TOPIC");
    return result(await pollMessagesForMcp(env, resolved, since, limit, scheduled));
  });
  server.registerTool("ntfy_manage_message", {
    description: "按 topic + sequence ID 清除或删除客户端通知。delete 也会取消尚未投递的同 sequence ID 定时消息。",
    inputSchema: { topic: z.string().min(1).max(64), sequenceId: z.string().min(1).max(64), action: z.enum(["clear", "delete"]) },
  }, async ({ topic, sequenceId, action }) => result(await manageMessage(env, validateTopic(topic), validateSequenceId(sequenceId), action === "delete" ? "message_delete" : "message_clear", normalizeBaseUrl(env.BASE_URL || "https://ntfy.mcp.happyfirst.top"))));
  server.registerTool("ntfy_delete_record", {
    description: "管理操作：物理删除服务端消息记录，或为单条记录设置/取消定时删除。与 ntfy 客户端的 message_delete 事件不同。",
    inputSchema: { id: z.string().min(1).max(64), deleteAt: z.string().datetime().nullable().optional(), now: z.boolean().default(false) },
  }, async ({ id, deleteAt, now }) => {
    if (now) return result(await callServerJson(env, "/admin/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: [id] }) }));
    return result(await callServerJson(env, "/admin/schedule-delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, deleteAt: deleteAt ?? null }) }));
  });
  server.registerTool("ntfy_status", { description: "查看消息数量、topic 数、待投递/待删除数量、订阅连接数、DO SQLite 占用及 iOS upstream 配置。", inputSchema: {} }, async () => result(await callServerJson(env, "/admin/status")));
  return server;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health" || url.pathname === "/v1/health") return Response.json({ healthy: true, ok: true, service: "ntfy-mcp-worker", version: VERSION });
    if (url.pathname === "/v1/config") return Response.json({ base_url: baseUrl(request, env), enable_login: false, enable_signup: false, enable_reservations: false, app_root: "/" });

    if (url.pathname === "/admin" || url.pathname.startsWith("/admin/api/") || url.pathname === "/mcp") {
      if (!(await verifyAdminAccess(request, env))) return adminDenied(env);
      if (url.pathname === "/admin") {
        const headers = new Headers({
          "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", "x-content-type-options": "nosniff",
          "referrer-policy": "no-referrer", "content-security-policy": "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; connect-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
        });
        if (env.ADMIN_TOKEN && url.searchParams.get("token") === env.ADMIN_TOKEN) headers.append("set-cookie", `ntfy_admin=${env.ADMIN_TOKEN}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`);
        return new Response(ADMIN_PAGE, { headers });
      }
      if (url.pathname.startsWith("/admin/api/")) {
        const suffix = url.pathname.slice("/admin/api".length);
        const map: Record<string, string> = { "/status": "/admin/status", "/topics": "/admin/topics", "/messages": "/admin/messages", "/delete": "/admin/delete", "/schedule-delete": "/admin/schedule-delete", "/retention": "/admin/retention" };
        const internal = map[suffix];
        if (!internal) return new Response("Not Found", { status: 404 });
        const target = `${internal}${request.method === "GET" ? url.search : ""}`;
        return proxyAdmin(request, env, target);
      }
      return createMcpHandler(() => createServer(env), { route: "/mcp", responseMode: "json" })(request, env, ctx);
    }

    if (url.pathname === "/") {
      if (request.method === "POST" && (request.headers.get("content-type") || "").toLowerCase().includes("application/json")) return handleProtocol(request, env);
      return Response.json({ ok: true, service: "ntfy-mcp-worker", version: VERSION, protocol: "ntfy-compatible", mcp: "/mcp", admin: "/admin", health: "/v1/health", iosUpstream: env.UPSTREAM_BASE_URL || "https://ntfy.sh" });
    }
    return handleProtocol(request, env);
  },
};
