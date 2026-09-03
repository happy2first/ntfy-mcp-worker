import { DurableObject } from "cloudflare:workers";
import { normalizeBaseUrl, parseSince, randomId, sanitizeFilename, sha256Hex } from "./protocol.js";
import type { Env, NtfyMessage, PublishInput, StoredAttachment, StoredMessage } from "./runtime-types.js";

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const ATTACHMENT_CHUNK_BYTES = 1024 * 1024;
const nowSeconds = () => Math.floor(Date.now() / 1000);
const encoder = new TextEncoder();
const json = (data: unknown, status = 200, headers?: HeadersInit) => Response.json(data, { status, headers });
const parseJson = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

function binary(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new Error("invalid_blob");
}

type MessageRow = {
  id: string; sequence_id: string | null; time: number; expires: number | null; event: NtfyMessage["event"]; topic: string;
  title: string | null; message: string | null; priority: number | null; tags_json: string | null; click: string | null; icon: string | null;
  actions_json: string | null; attachment_json: string | null; poll_id: string | null; content_type: string | null; encoding: string | null;
  cache_visible: number; delivered: number; scheduled_at: number | null; admin_delete_at: number | null; base_url: string; created_at: string;
};

type AttachmentRow = {
  attachment_ref: string; message_id: string; name: string; mime_type: string; size_bytes: number; chunk_count: number; expires: number; created_at: string;
};

type StreamSubscriber = {
  topics: Set<string>;
  format: "json" | "sse" | "raw";
  controller: ReadableStreamDefaultController<Uint8Array>;
};

function rowToStored(row: MessageRow): StoredMessage {
  return {
    id: row.id,
    ...(row.sequence_id ? { sequence_id: row.sequence_id } : {}),
    time: Number(row.time),
    ...(row.expires ? { expires: Number(row.expires) } : {}),
    event: row.event,
    topic: row.topic,
    ...(row.title ? { title: row.title } : {}),
    ...(row.message != null ? { message: row.message } : {}),
    ...(row.priority ? { priority: Number(row.priority) } : {}),
    ...(row.tags_json ? { tags: parseJson<string[]>(row.tags_json, []) } : {}),
    ...(row.click ? { click: row.click } : {}),
    ...(row.icon ? { icon: row.icon } : {}),
    ...(row.actions_json ? { actions: parseJson(row.actions_json, []) } : {}),
    ...(row.attachment_json ? { attachment: parseJson<StoredAttachment>(row.attachment_json, { name: "attachment", url: "" }) } : {}),
    ...(row.poll_id ? { poll_id: row.poll_id } : {}),
    ...(row.content_type ? { content_type: row.content_type } : {}),
    ...(row.encoding ? { encoding: row.encoding } : {}),
    cache_visible: Boolean(row.cache_visible),
    delivered: Boolean(row.delivered),
    ...(row.scheduled_at ? { scheduled_at: Number(row.scheduled_at) } : {}),
    ...(row.admin_delete_at ? { admin_delete_at: Number(row.admin_delete_at) } : {}),
    created_at: row.created_at,
  };
}

function toPublic(message: StoredMessage): NtfyMessage {
  const attachment = message.attachment ? (() => {
    const { ref: _ref, ...rest } = message.attachment!;
    return rest;
  })() : undefined;
  return {
    id: message.id,
    ...(message.sequence_id && message.sequence_id !== message.id ? { sequence_id: message.sequence_id } : {}),
    time: message.time,
    ...(message.expires ? { expires: message.expires } : {}),
    event: message.event,
    topic: message.topic,
    ...(message.title ? { title: message.title } : {}),
    ...(message.message != null ? { message: message.message } : {}),
    ...(message.priority ? { priority: message.priority } : {}),
    ...(message.tags?.length ? { tags: message.tags } : {}),
    ...(message.click ? { click: message.click } : {}),
    ...(message.icon ? { icon: message.icon } : {}),
    ...(message.actions?.length ? { actions: message.actions } : {}),
    ...(attachment ? { attachment } : {}),
    ...(message.poll_id ? { poll_id: message.poll_id } : {}),
    ...(message.content_type ? { content_type: message.content_type } : {}),
    ...(message.encoding ? { encoding: message.encoding } : {}),
  };
}

export class NtfyServerDO extends DurableObject<Env> {
  private streamSubscribers = new Map<string, StreamSubscriber>();

  private ensureSchema() {
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, sequence_id TEXT, time INTEGER NOT NULL, expires INTEGER, event TEXT NOT NULL, topic TEXT NOT NULL,
      title TEXT, message TEXT, priority INTEGER, tags_json TEXT, click TEXT, icon TEXT, actions_json TEXT, attachment_json TEXT,
      poll_id TEXT, content_type TEXT, encoding TEXT, cache_visible INTEGER NOT NULL DEFAULT 1, delivered INTEGER NOT NULL DEFAULT 1,
      scheduled_at INTEGER, admin_delete_at INTEGER, base_url TEXT NOT NULL, created_at TEXT NOT NULL
    )`);
    this.ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS idx_messages_topic_time ON messages(topic,time DESC)");
    this.ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS idx_messages_delivery ON messages(delivered,scheduled_at)");
    this.ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS idx_messages_expiry ON messages(expires)");
    this.ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS idx_messages_admin_delete ON messages(admin_delete_at)");
    this.ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS idx_messages_sequence ON messages(topic,sequence_id,time DESC)");
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`);
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS attachment_objects (
      attachment_ref TEXT PRIMARY KEY, message_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL, chunk_count INTEGER NOT NULL, expires INTEGER NOT NULL, created_at TEXT NOT NULL
    )`);
    this.ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS idx_attachment_expiry ON attachment_objects(expires)");
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS attachment_chunks (
      attachment_ref TEXT NOT NULL, chunk_index INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY(attachment_ref,chunk_index)
    )`);
  }

  private setting(key: string): string | undefined {
    this.ensureSchema();
    return this.ctx.storage.sql.exec<{ value: string }>("SELECT value FROM settings WHERE key=?", key).toArray()[0]?.value;
  }

  private retentionSeconds(): number {
    const configured = Number(this.setting("message_retention_seconds") || this.env.MESSAGE_RETENTION_SECONDS || 43200);
    return Number.isFinite(configured) ? Math.min(30 * 86400, Math.max(300, Math.trunc(configured))) : 43200;
  }

  private insert(message: StoredMessage, baseUrl: string) {
    this.ensureSchema();
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO messages (
        id,sequence_id,time,expires,event,topic,title,message,priority,tags_json,click,icon,actions_json,attachment_json,
        poll_id,content_type,encoding,cache_visible,delivered,scheduled_at,admin_delete_at,base_url,created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      message.id, message.sequence_id || null, message.time, message.expires || null, message.event, message.topic,
      message.title || null, message.message ?? null, message.priority || null, message.tags?.length ? JSON.stringify(message.tags) : null,
      message.click || null, message.icon || null, message.actions?.length ? JSON.stringify(message.actions) : null,
      message.attachment ? JSON.stringify(message.attachment) : null, message.poll_id || null, message.content_type || null,
      message.encoding || null, message.cache_visible ? 1 : 0, message.delivered ? 1 : 0, message.scheduled_at || null,
      message.admin_delete_at || null, normalizeBaseUrl(baseUrl), message.created_at,
    );
  }

  private formatChunk(format: StreamSubscriber["format"], message: NtfyMessage): Uint8Array | null {
    if (format === "raw") return message.event === "message" ? encoder.encode(`${message.message || ""}\n`) : null;
    if (format === "sse") return encoder.encode(`data: ${JSON.stringify(message)}\n\n`);
    return encoder.encode(`${JSON.stringify(message)}\n`);
  }

  private publishToLocalSubscribers(message: StoredMessage) {
    const publicMessage = toPublic(message);
    for (const [id, subscriber] of this.streamSubscribers) {
      if (!subscriber.topics.has(message.topic)) continue;
      const chunk = this.formatChunk(subscriber.format, publicMessage);
      if (!chunk) continue;
      try { subscriber.controller.enqueue(chunk); } catch { this.streamSubscribers.delete(id); }
    }
    for (const ws of this.ctx.getWebSockets()) {
      try {
        const attachment = ws.deserializeAttachment() as { topics?: string[] } | null;
        if (attachment?.topics?.includes(message.topic)) ws.send(JSON.stringify(publicMessage));
      } catch { try { ws.close(1011, "delivery failed"); } catch { /* ignored */ } }
    }
  }

  private async forwardPollRequest(message: StoredMessage, baseUrl: string) {
    if (message.event === "poll_request") return;
    const upstream = normalizeBaseUrl(this.env.UPSTREAM_BASE_URL || "https://ntfy.sh");
    const exactBaseUrl = normalizeBaseUrl(this.env.BASE_URL || baseUrl);
    const topicHash = await sha256Hex(`${exactBaseUrl}/${message.topic}`);
    const headers = new Headers({ "X-Poll-ID": message.id, "User-Agent": "ntfy-mcp-worker/0.2" });
    if (this.env.UPSTREAM_ACCESS_TOKEN) headers.set("Authorization", `Bearer ${this.env.UPSTREAM_ACCESS_TOKEN}`);
    const response = await fetch(`${upstream}/${topicHash}`, { method: "POST", headers, body: "" });
    if (!response.ok) console.warn("ntfy upstream poll request failed", response.status, await response.text().catch(() => ""));
  }

  private async deliver(message: StoredMessage, baseUrl: string) {
    this.publishToLocalSubscribers(message);
    this.ctx.waitUntil(this.forwardPollRequest(message, baseUrl));
  }

  private deleteAttachmentsByMessageIds(ids: string[]) {
    if (!ids.length) return { attachments: 0, attachmentBytes: 0 };
    const placeholders = ids.map(() => "?").join(",");
    const rows = this.ctx.storage.sql.exec<{ attachment_ref: string; size_bytes: number }>(
      `SELECT attachment_ref,size_bytes FROM attachment_objects WHERE message_id IN (${placeholders})`, ...ids,
    ).toArray();
    const refs = rows.map((row) => row.attachment_ref);
    if (refs.length) {
      const refPlaceholders = refs.map(() => "?").join(",");
      this.ctx.storage.sql.exec(`DELETE FROM attachment_chunks WHERE attachment_ref IN (${refPlaceholders})`, ...refs);
      this.ctx.storage.sql.exec(`DELETE FROM attachment_objects WHERE attachment_ref IN (${refPlaceholders})`, ...refs);
    }
    return { attachments: refs.length, attachmentBytes: rows.reduce((sum, row) => sum + Number(row.size_bytes || 0), 0) };
  }

  private async deletePhysical(ids: string[]) {
    if (!ids.length) return { deleted: 0, attachmentsDeleted: 0, attachmentBytesDeleted: 0 };
    const unique = [...new Set(ids)];
    const placeholders = unique.map(() => "?").join(",");
    let attachmentSummary = { attachments: 0, attachmentBytes: 0 };
    this.ctx.storage.transactionSync(() => {
      attachmentSummary = this.deleteAttachmentsByMessageIds(unique);
      this.ctx.storage.sql.exec(`DELETE FROM messages WHERE id IN (${placeholders})`, ...unique);
    });
    return { deleted: unique.length, attachmentsDeleted: attachmentSummary.attachments, attachmentBytesDeleted: attachmentSummary.attachmentBytes };
  }

  private deleteExpiredAttachments(now: number) {
    const rows = this.ctx.storage.sql.exec<{ attachment_ref: string; message_id: string }>(
      "SELECT attachment_ref,message_id FROM attachment_objects WHERE expires<=? LIMIT 200", now,
    ).toArray();
    if (!rows.length) return 0;
    const refs = rows.map((row) => row.attachment_ref);
    const placeholders = refs.map(() => "?").join(",");
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(`DELETE FROM attachment_chunks WHERE attachment_ref IN (${placeholders})`, ...refs);
      this.ctx.storage.sql.exec(`DELETE FROM attachment_objects WHERE attachment_ref IN (${placeholders})`, ...refs);
    });
    return refs.length;
  }

  private async scheduleNextAlarm() {
    this.ensureSchema();
    const now = nowSeconds();
    const row = this.ctx.storage.sql.exec<{ due: number | null }>(`
      SELECT MIN(due) AS due FROM (
        SELECT MIN(scheduled_at) AS due FROM messages WHERE delivered=0 AND scheduled_at IS NOT NULL
        UNION ALL SELECT MIN(admin_delete_at) AS due FROM messages WHERE admin_delete_at IS NOT NULL
        UNION ALL SELECT MIN(expires) AS due FROM messages WHERE expires IS NOT NULL
        UNION ALL SELECT MIN(expires) AS due FROM attachment_objects
      )
    `).toArray()[0];
    const due = Number(row?.due || 0);
    if (!due) return void await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.setAlarm(Math.max(Date.now() + 1000, Math.max(now, due) * 1000));
  }

  async alarm() {
    this.ensureSchema();
    const now = nowSeconds();
    const due = this.ctx.storage.sql.exec<MessageRow>(
      "SELECT * FROM messages WHERE delivered=0 AND scheduled_at IS NOT NULL AND scheduled_at<=? ORDER BY scheduled_at ASC LIMIT 200", now,
    ).toArray();
    for (const row of due) {
      this.ctx.storage.sql.exec("UPDATE messages SET delivered=1, expires=? WHERE id=?", now + this.retentionSeconds(), row.id);
      const refreshed = this.ctx.storage.sql.exec<MessageRow>("SELECT * FROM messages WHERE id=?", row.id).toArray()[0];
      if (refreshed) await this.deliver(rowToStored(refreshed), row.base_url);
    }
    const expired = this.ctx.storage.sql.exec<{ id: string }>(
      "SELECT id FROM messages WHERE (admin_delete_at IS NOT NULL AND admin_delete_at<=?) OR (expires IS NOT NULL AND expires<=?) LIMIT 500", now, now,
    ).toArray().map((row) => row.id);
    await this.deletePhysical(expired);
    this.deleteExpiredAttachments(now);
    await this.scheduleNextAlarm();
  }

  async webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer) {}
  async webSocketClose(ws: WebSocket, code: number, reason: string) { try { ws.close(code, reason); } catch {} }

  private async handleAttachmentUpload(request: Request, messageId: string) {
    const name = sanitizeFilename(decodeURIComponent(request.headers.get("x-filename") || "attachment.bin"));
    const mimeType = (request.headers.get("content-type") || "application/octet-stream").split(";", 1)[0];
    const expires = Math.trunc(Number(request.headers.get("x-expires") || 0));
    const length = Number(request.headers.get("content-length") || 0);
    if (length > MAX_ATTACHMENT_BYTES) return json({ error: "attachment_too_large" }, 413);
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) return json({ error: "attachment_too_large" }, 413);
    const attachmentRef = `att_${crypto.randomUUID().replace(/-/g, "")}`;
    const chunkCount = Math.ceil(bytes.byteLength / ATTACHMENT_CHUNK_BYTES);
    const createdAt = new Date().toISOString();
    this.ctx.storage.transactionSync(() => {
      this.deleteAttachmentsByMessageIds([messageId]);
      this.ctx.storage.sql.exec(
        "INSERT INTO attachment_objects(attachment_ref,message_id,name,mime_type,size_bytes,chunk_count,expires,created_at) VALUES(?,?,?,?,?,?,?,?)",
        attachmentRef, messageId, name, mimeType, bytes.byteLength, chunkCount, expires || nowSeconds() + 10800, createdAt,
      );
      for (let i = 0; i < chunkCount; i += 1) {
        const start = i * ATTACHMENT_CHUNK_BYTES;
        const chunk = bytes.slice(start, Math.min(start + ATTACHMENT_CHUNK_BYTES, bytes.byteLength));
        this.ctx.storage.sql.exec("INSERT INTO attachment_chunks(attachment_ref,chunk_index,data) VALUES(?,?,?)", attachmentRef, i, chunk.slice().buffer as ArrayBuffer);
      }
    });
    await this.scheduleNextAlarm();
    return json({ attachmentRef, messageId, name, type: mimeType, size: bytes.byteLength, expires: expires || nowSeconds() + 10800 });
  }

  private handleAttachmentRead(request: Request, messageId: string, requestedName: string | null) {
    const row = this.ctx.storage.sql.exec<AttachmentRow>("SELECT * FROM attachment_objects WHERE message_id=?", messageId).toArray()[0];
    if (!row || row.expires <= nowSeconds()) return new Response("Not Found", { status: 404 });
    if (requestedName && sanitizeFilename(requestedName) !== row.name) return new Response("Not Found", { status: 404 });
    const headers = new Headers({
      "content-type": row.mime_type,
      "content-length": String(row.size_bytes),
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`,
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
      "etag": `\"${row.attachment_ref}\"`,
    });
    if (request.method === "HEAD") return new Response(null, { headers });
    const chunks = this.ctx.storage.sql.exec<{ data: ArrayBuffer }>(
      "SELECT data FROM attachment_chunks WHERE attachment_ref=? ORDER BY chunk_index ASC", row.attachment_ref,
    ).toArray();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(binary(chunk.data));
        controller.close();
      },
    });
    return new Response(stream, { headers });
  }

  private handleAttachmentDelete(messageId: string) {
    const summary = this.deleteAttachmentsByMessageIds([messageId]);
    return json({ success: true, ...summary });
  }

  private async handlePublish(request: Request) {
    const input = await request.json<PublishInput>();
    const message = input.message;
    if (!message.expires) message.expires = message.cache_visible ? message.time + this.retentionSeconds() : Math.max(message.time, nowSeconds()) + 300;
    if (message.scheduled_at && message.sequence_id) {
      const old = this.ctx.storage.sql.exec<{ id: string }>(
        "SELECT id FROM messages WHERE topic=? AND sequence_id=? AND delivered=0", message.topic, message.sequence_id,
      ).toArray().map((row) => row.id);
      await this.deletePhysical(old);
    }
    this.insert(message, input.baseUrl);
    if (message.delivered) await this.deliver(message, input.baseUrl);
    await this.scheduleNextAlarm();
    return json(toPublic(message));
  }

  private queryMessages(url: URL): StoredMessage[] {
    this.ensureSchema();
    const topics = (url.searchParams.get("topics") || "").split(",").filter(Boolean);
    const includeScheduled = url.searchParams.get("scheduled") === "1";
    const id = url.searchParams.get("id");
    const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get("limit") || 100)));
    const since = parseSince(url.searchParams.get("since"));
    const clauses: string[] = [];
    const args: unknown[] = [];
    if (topics.length) { clauses.push(`topic IN (${topics.map(() => "?").join(",")})`); args.push(...topics); }
    if (id) { clauses.push("id=?"); args.push(id); }
    else {
      clauses.push("cache_visible=1");
      if (!includeScheduled) clauses.push("delivered=1");
      if (since.mode === "time") { clauses.push("time>=?"); args.push(Number(since.value)); }
      if (since.mode === "id") {
        const cursor = this.ctx.storage.sql.exec<{ time: number }>("SELECT time FROM messages WHERE id=?", String(since.value)).toArray()[0];
        if (cursor) { clauses.push("time>=?"); args.push(Number(cursor.time)); }
      }
    }
    if (url.searchParams.get("event")) { clauses.push("event=?"); args.push(url.searchParams.get("event")!); }
    let sql = `SELECT * FROM messages${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""} ORDER BY time ASC,created_at ASC`;
    if (since.mode === "latest" && !id) sql = `SELECT * FROM (${sql}) ORDER BY time DESC,created_at DESC LIMIT 1`;
    else { sql += " LIMIT ?"; args.push(limit); }
    return this.ctx.storage.sql.exec<MessageRow>(sql, ...args).toArray().map(rowToStored);
  }

  private handleSubscribe(request: Request) {
    const url = new URL(request.url);
    const format = (url.searchParams.get("format") || "json") as "json" | "sse" | "raw" | "ws";
    const poll = url.searchParams.get("poll") === "1";
    const topics = new Set((url.searchParams.get("topics") || "").split(",").filter(Boolean));
    const rows = this.queryMessages(url);
    if (poll) {
      if (format === "json" && url.searchParams.get("id")) return rows[0] ? json(toPublic(rows[0])) : json({ code: 40401, http: 404, error: "message not found" }, 404);
      if (format === "raw") return new Response(rows.map((m) => m.event === "message" ? m.message || "" : "").filter(Boolean).join("\n"), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
      if (format === "sse") return new Response(rows.map((m) => `data: ${JSON.stringify(toPublic(m))}\n\n`).join(""), { headers: { "content-type": "text/event-stream", "cache-control": "no-store" } });
      return new Response(rows.map((m) => JSON.stringify(toPublic(m))).join("\n") + (rows.length ? "\n" : ""), { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
    }
    if (format === "ws") {
      const pair = new WebSocketPair();
      const client = pair[0], server = pair[1];
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ topics: [...topics] });
      server.send(JSON.stringify({ id: randomId(), time: nowSeconds(), event: "open", topic: [...topics].join(",") }));
      for (const row of rows) server.send(JSON.stringify(toPublic(row)));
      return new Response(null, { status: 101, webSocket: client });
    }
    const subscriberId = randomId(16);
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.streamSubscribers.set(subscriberId, { topics, format: format as "json" | "sse" | "raw", controller });
        if (format !== "raw") {
          const open: NtfyMessage = { id: randomId(), time: nowSeconds(), event: "open", topic: [...topics].join(",") };
          const chunk = this.formatChunk(format as "json" | "sse", open);
          if (chunk) controller.enqueue(chunk);
        }
        for (const row of rows) {
          const chunk = this.formatChunk(format as "json" | "sse" | "raw", toPublic(row));
          if (chunk) controller.enqueue(chunk);
        }
      },
      cancel: () => { this.streamSubscribers.delete(subscriberId); },
    });
    const contentType = format === "sse" ? "text/event-stream" : format === "raw" ? "text/plain; charset=utf-8" : "application/x-ndjson";
    return new Response(stream, { headers: { "content-type": contentType, "cache-control": "no-store", "connection": "keep-alive" } });
  }

  private handleAdminMessages(url: URL) {
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 50)));
    const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
    const topic = url.searchParams.get("topic")?.trim();
    const q = url.searchParams.get("q")?.trim();
    const clauses: string[] = [], args: unknown[] = [];
    if (topic) { clauses.push("topic=?"); args.push(topic); }
    if (q) { clauses.push("(message LIKE ? OR title LIKE ? OR id LIKE ? OR sequence_id LIKE ?)"); args.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    const total = Number(this.ctx.storage.sql.exec<{ count: number }>(`SELECT COUNT(*) AS count FROM messages${where}`, ...args).toArray()[0]?.count || 0);
    const rows = this.ctx.storage.sql.exec<MessageRow>(`SELECT * FROM messages${where} ORDER BY time DESC,created_at DESC LIMIT ? OFFSET ?`, ...args, limit, offset).toArray();
    return json({ total, limit, offset, messages: rows.map((row) => {
      const stored = rowToStored(row);
      return { ...toPublic(stored), delivered: stored.delivered, cacheVisible: stored.cache_visible, scheduledAt: stored.scheduled_at || null, deleteAt: stored.admin_delete_at || null, createdAt: stored.created_at };
    }) });
  }

  private handleTopics() {
    return json({ topics: this.ctx.storage.sql.exec<{ topic: string; messages: number; last_time: number }>(
      "SELECT topic,COUNT(*) AS messages,MAX(time) AS last_time FROM messages GROUP BY topic ORDER BY last_time DESC",
    ).toArray() });
  }

  private handleStatus() {
    const counts = this.ctx.storage.sql.exec<{ messages: number; topics: number; scheduled: number; pending_deletes: number }>(`
      SELECT COUNT(*) AS messages,COUNT(DISTINCT topic) AS topics,
        SUM(CASE WHEN delivered=0 THEN 1 ELSE 0 END) AS scheduled,
        SUM(CASE WHEN admin_delete_at IS NOT NULL THEN 1 ELSE 0 END) AS pending_deletes FROM messages
    `).toArray()[0];
    const attachments = this.ctx.storage.sql.exec<{ count: number; bytes: number; chunks: number }>(
      "SELECT COUNT(*) AS count,COALESCE(SUM(size_bytes),0) AS bytes,COALESCE(SUM(chunk_count),0) AS chunks FROM attachment_objects",
    ).toArray()[0];
    return json({
      ok: true, messages: Number(counts?.messages || 0), topics: Number(counts?.topics || 0), scheduled: Number(counts?.scheduled || 0),
      pendingDeletes: Number(counts?.pending_deletes || 0), websocketSubscribers: this.ctx.getWebSockets().length,
      streamSubscribers: this.streamSubscribers.size, databaseBytes: Number(this.ctx.storage.sql.databaseSize || 0), retentionSeconds: this.retentionSeconds(),
      attachmentCount: Number(attachments?.count || 0), attachmentBytes: Number(attachments?.bytes || 0), attachmentChunks: Number(attachments?.chunks || 0),
      attachmentSingleFileLimitBytes: MAX_ATTACHMENT_BYTES, attachmentChunkBytes: ATTACHMENT_CHUNK_BYTES,
      upstreamBaseUrl: this.env.UPSTREAM_BASE_URL || "https://ntfy.sh", baseUrl: this.env.BASE_URL || null,
    });
  }

  private async handleSetRetention(request: Request) {
    const body = await request.json<{ seconds?: number }>();
    const seconds = Math.trunc(Number(body.seconds));
    if (!Number.isFinite(seconds) || seconds < 300 || seconds > 30 * 86400) return json({ error: "retention must be 300..2592000 seconds" }, 400);
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO settings(key,value,updated_at) VALUES('message_retention_seconds',?,?)", String(seconds), new Date().toISOString());
    this.ctx.storage.sql.exec("UPDATE messages SET expires=time+? WHERE cache_visible=1 AND delivered=1", seconds);
    await this.scheduleNextAlarm();
    return json({ success: true, retentionSeconds: seconds });
  }

  private async handleManage(request: Request) {
    const body = await request.json<{ topic?: string; sequenceId?: string; event?: "message_delete" | "message_clear"; baseUrl?: string }>();
    const topic = String(body.topic || ""), sequenceId = String(body.sequenceId || ""), event = body.event;
    const baseUrl = normalizeBaseUrl(String(body.baseUrl || this.env.BASE_URL || ""));
    if (!topic || !sequenceId || !event || !baseUrl) return json({ error: "topic, sequenceId, event and baseUrl are required" }, 400);
    if (event === "message_delete") {
      const scheduled = this.ctx.storage.sql.exec<{ id: string }>("SELECT id FROM messages WHERE topic=? AND sequence_id=? AND delivered=0", topic, sequenceId).toArray().map((row) => row.id);
      await this.deletePhysical(scheduled);
    }
    const now = nowSeconds();
    const message: StoredMessage = { id: randomId(), sequence_id: sequenceId, time: now, expires: now + this.retentionSeconds(), event, topic, cache_visible: true, delivered: true, created_at: new Date().toISOString() };
    this.insert(message, baseUrl); await this.deliver(message, baseUrl); await this.scheduleNextAlarm();
    return json(toPublic(message));
  }

  private async handleAdminDelete(request: Request) {
    const body = await request.json<{ ids?: string[] }>();
    const result = await this.deletePhysical(Array.isArray(body.ids) ? body.ids.filter(Boolean).slice(0, 200) : []);
    await this.scheduleNextAlarm();
    return json({ success: true, ...result });
  }

  private async handleScheduleDelete(request: Request) {
    const body = await request.json<{ id?: string; deleteAt?: number | string | null }>();
    const id = String(body.id || "").trim();
    if (!id) return json({ error: "id required" }, 400);
    if (body.deleteAt == null || body.deleteAt === "") {
      this.ctx.storage.sql.exec("UPDATE messages SET admin_delete_at=NULL WHERE id=?", id); await this.scheduleNextAlarm();
      return json({ success: true, id, deleteAt: null });
    }
    const deleteAt = typeof body.deleteAt === "number" ? Math.trunc(body.deleteAt) : Math.floor(Date.parse(body.deleteAt) / 1000);
    if (!Number.isFinite(deleteAt) || deleteAt <= nowSeconds()) return json({ error: "deleteAt must be in the future" }, 400);
    this.ctx.storage.sql.exec("UPDATE messages SET admin_delete_at=? WHERE id=?", deleteAt, id); await this.scheduleNextAlarm();
    return json({ success: true, id, deleteAt });
  }

  async fetch(request: Request): Promise<Response> {
    try {
      this.ensureSchema();
      const url = new URL(request.url);
      if (url.pathname.startsWith("/attachment/")) {
        const messageId = decodeURIComponent(url.pathname.slice("/attachment/".length));
        if (request.method === "POST") return await this.handleAttachmentUpload(request, messageId);
        if (request.method === "GET" || request.method === "HEAD") return this.handleAttachmentRead(request, messageId, url.searchParams.get("name"));
        if (request.method === "DELETE") return this.handleAttachmentDelete(messageId);
      }
      if (url.pathname === "/publish" && request.method === "POST") return await this.handlePublish(request);
      if (url.pathname === "/subscribe" && request.method === "GET") return this.handleSubscribe(request);
      if (url.pathname === "/admin/messages" && request.method === "GET") return this.handleAdminMessages(url);
      if (url.pathname === "/admin/topics" && request.method === "GET") return this.handleTopics();
      if (url.pathname === "/admin/status" && request.method === "GET") return this.handleStatus();
      if (url.pathname === "/admin/retention" && request.method === "POST") return await this.handleSetRetention(request);
      if (url.pathname === "/manage" && request.method === "POST") return await this.handleManage(request);
      if (url.pathname === "/admin/delete" && request.method === "POST") return await this.handleAdminDelete(request);
      if (url.pathname === "/admin/schedule-delete" && request.method === "POST") return await this.handleScheduleDelete(request);
      return json({ error: "not_found" }, 404);
    } catch (error) {
      console.error("NtfyServerDO error", error);
      return json({ error: "internal_error", message: error instanceof Error ? error.message : String(error) }, 500);
    }
  }
}
