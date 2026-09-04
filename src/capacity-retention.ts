const MIB = 1024 * 1024;
export const DEFAULT_HISTORY_LIMIT_BYTES = 700 * MIB;
export const MIN_HISTORY_LIMIT_BYTES = 50 * MIB;
export const MAX_HISTORY_LIMIT_BYTES = 700 * MIB;
export const HISTORY_TARGET_RATIO = 0.9;
const STATE_KEY = "capacity_retention_v1";
const CLEANUP_BATCH_SIZE = 20;
const MAX_CLEANUP_BATCHES = 100;

type SqlValue = string | number | ArrayBuffer | null;
type StorageLike = {
  transactionSync<T>(closure: () => T): T;
  sql: {
    exec<T extends Record<string, SqlValue>>(query: string, ...bindings: unknown[]): { toArray(): T[] };
    databaseSize: number;
  };
};

export type CapacityState = {
  limitBytes: number;
  updatedAt?: string;
  lastCleanupAt?: string;
  totalDeletedMessages?: number;
  totalDeletedAttachmentBytes?: number;
};

export type CapacityUsage = {
  messageBytes: number;
  attachmentBytes: number;
  historyBytes: number;
  databaseBytes: number;
  attachmentCount: number;
  attachmentChunks: number;
};

export type CapacityCleanupSummary = {
  pruned: boolean;
  beforeBytes: number;
  afterBytes: number;
  limitBytes: number;
  targetBytes: number;
  deletedMessages: number;
  deletedAttachmentBytes: number;
  scheduledProtected?: boolean;
};

const clampLimit = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_HISTORY_LIMIT_BYTES;
  return Math.min(MAX_HISTORY_LIMIT_BYTES, Math.max(MIN_HISTORY_LIMIT_BYTES, Math.trunc(n)));
};

const targetBytes = (limitBytes: number) => Math.floor(limitBytes * HISTORY_TARGET_RATIO);

function getSetting(storage: StorageLike, key: string): string | undefined {
  return storage.sql.exec<{ value: string }>("SELECT value FROM settings WHERE key=?", key).toArray()[0]?.value;
}

function putSetting(storage: StorageLike, key: string, value: string) {
  storage.sql.exec(
    "INSERT OR REPLACE INTO settings(key,value,updated_at) VALUES(?,?,?)",
    key,
    value,
    new Date().toISOString(),
  );
}

export function loadCapacityState(storage: StorageLike): CapacityState {
  const raw = getSetting(storage, STATE_KEY);
  let parsed: CapacityState | undefined;
  if (raw) {
    try { parsed = JSON.parse(raw) as CapacityState; } catch { parsed = undefined; }
  }
  return { ...(parsed || {}), limitBytes: clampLimit(parsed?.limitBytes) };
}

function saveCapacityState(storage: StorageLike, state: CapacityState) {
  putSetting(storage, STATE_KEY, JSON.stringify({ ...state, limitBytes: clampLimit(state.limitBytes) }));
}

export function capacityUsage(storage: StorageLike): CapacityUsage {
  const message = storage.sql.exec<{ bytes: number }>(`
    SELECT COALESCE(SUM(
      LENGTH(CAST(COALESCE(id,'') AS BLOB)) +
      LENGTH(CAST(COALESCE(sequence_id,'') AS BLOB)) +
      LENGTH(CAST(COALESCE(topic,'') AS BLOB)) +
      LENGTH(CAST(COALESCE(title,'') AS BLOB)) +
      LENGTH(CAST(COALESCE(message,'') AS BLOB)) +
      LENGTH(CAST(COALESCE(tags_json,'') AS BLOB)) +
      LENGTH(CAST(COALESCE(click,'') AS BLOB)) +
      LENGTH(CAST(COALESCE(icon,'') AS BLOB)) +
      LENGTH(CAST(COALESCE(actions_json,'') AS BLOB)) +
      LENGTH(CAST(COALESCE(attachment_json,'') AS BLOB)) +
      LENGTH(CAST(COALESCE(poll_id,'') AS BLOB)) +
      LENGTH(CAST(COALESCE(content_type,'') AS BLOB)) +
      LENGTH(CAST(COALESCE(encoding,'') AS BLOB)) +
      LENGTH(CAST(COALESCE(base_url,'') AS BLOB)) +
      LENGTH(CAST(COALESCE(created_at,'') AS BLOB)) + 512
    ),0) AS bytes FROM messages
  `).toArray()[0];
  const media = storage.sql.exec<{ count: number; bytes: number; chunks: number }>(
    "SELECT COUNT(*) AS count,COALESCE(SUM(size_bytes),0) AS bytes,COALESCE(SUM(chunk_count),0) AS chunks FROM attachment_objects",
  ).toArray()[0];
  const messageBytes = Number(message?.bytes || 0);
  const attachmentBytes = Number(media?.bytes || 0);
  const attachmentCount = Number(media?.count || 0);
  const attachmentChunks = Number(media?.chunks || 0);
  const overhead = attachmentCount * 256 + attachmentChunks * 128;
  return {
    messageBytes,
    attachmentBytes,
    historyBytes: messageBytes + attachmentBytes + overhead,
    databaseBytes: Number(storage.sql.databaseSize || 0),
    attachmentCount,
    attachmentChunks,
  };
}

function deleteBatch(storage: StorageLike, ids: string[]) {
  if (!ids.length) return;
  const placeholders = ids.map(() => "?").join(",");
  storage.transactionSync(() => {
    storage.sql.exec(
      `DELETE FROM attachment_chunks WHERE attachment_ref IN (SELECT attachment_ref FROM attachment_objects WHERE message_id IN (${placeholders}))`,
      ...ids,
    );
    storage.sql.exec(`DELETE FROM attachment_objects WHERE message_id IN (${placeholders})`, ...ids);
    storage.sql.exec(`DELETE FROM messages WHERE id IN (${placeholders})`, ...ids);
  });
}

export function enforceCapacity(storage: StorageLike): CapacityCleanupSummary {
  const state = loadCapacityState(storage);
  let usage = capacityUsage(storage);
  const beforeBytes = usage.historyBytes;
  const target = targetBytes(state.limitBytes);
  let deletedMessages = 0;
  let deletedAttachmentBytes = 0;

  if (beforeBytes <= state.limitBytes) {
    return {
      pruned: false,
      beforeBytes,
      afterBytes: beforeBytes,
      limitBytes: state.limitBytes,
      targetBytes: target,
      deletedMessages,
      deletedAttachmentBytes,
    };
  }

  for (let cycle = 0; cycle < MAX_CLEANUP_BATCHES && usage.historyBytes > target; cycle += 1) {
    const rows = storage.sql.exec<{ id: string; attachment_bytes: number }>(`
      SELECT m.id AS id,COALESCE(SUM(a.size_bytes),0) AS attachment_bytes
      FROM messages m
      LEFT JOIN attachment_objects a ON a.message_id=m.id
      WHERE m.delivered=1
      GROUP BY m.id
      ORDER BY m.time ASC,m.created_at ASC
      LIMIT ?
    `, CLEANUP_BATCH_SIZE).toArray();
    if (!rows.length) break;
    const ids = rows.map((row) => row.id);
    deletedMessages += ids.length;
    deletedAttachmentBytes += rows.reduce((sum, row) => sum + Number(row.attachment_bytes || 0), 0);
    deleteBatch(storage, ids);
    usage = capacityUsage(storage);
    if (rows.length < CLEANUP_BATCH_SIZE) break;
  }

  const summary: CapacityCleanupSummary = {
    pruned: deletedMessages > 0,
    beforeBytes,
    afterBytes: usage.historyBytes,
    limitBytes: state.limitBytes,
    targetBytes: target,
    deletedMessages,
    deletedAttachmentBytes,
    scheduledProtected: usage.historyBytes > state.limitBytes && deletedMessages === 0,
  };

  if (deletedMessages > 0) {
    state.lastCleanupAt = new Date().toISOString();
    state.totalDeletedMessages = Number(state.totalDeletedMessages || 0) + deletedMessages;
    state.totalDeletedAttachmentBytes = Number(state.totalDeletedAttachmentBytes || 0) + deletedAttachmentBytes;
    saveCapacityState(storage, state);
  }
  return summary;
}

export function setCapacityLimit(storage: StorageLike, limitMB: unknown) {
  const numeric = Number(limitMB);
  if (!Number.isFinite(numeric)) throw new Error("历史数据保留上限必须是数字");
  const limitBytes = Math.round(numeric * MIB);
  if (limitBytes < MIN_HISTORY_LIMIT_BYTES || limitBytes > MAX_HISTORY_LIMIT_BYTES) {
    throw new Error("历史数据保留上限范围为 50-700 MB");
  }
  const state = loadCapacityState(storage);
  state.limitBytes = limitBytes;
  state.updatedAt = new Date().toISOString();
  saveCapacityState(storage, state);
  const cleanup = enforceCapacity(storage);
  return { success: true, state: loadCapacityState(storage), usage: capacityUsage(storage), cleanup };
}

export function capacityStatus(storage: StorageLike) {
  const state = loadCapacityState(storage);
  const usage = capacityUsage(storage);
  return { state, usage, targetBytes: targetBytes(state.limitBytes) };
}
