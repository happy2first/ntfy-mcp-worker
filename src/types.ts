export interface Env {
  NTFY_SERVER: DurableObjectNamespace;
  ATTACHMENTS: R2Bucket;
  BASE_URL?: string;
  UPSTREAM_BASE_URL?: string;
  UPSTREAM_ACCESS_TOKEN?: string;
  NTFY_USERNAME?: string;
  NTFY_PASSWORD?: string;
  NTFY_ACCESS_TOKEN?: string;
  TEAM_DOMAIN?: string;
  POLICY_AUD?: string;
  ADMIN_TOKEN?: string;
  MESSAGE_RETENTION_SECONDS?: string;
  ATTACHMENT_RETENTION_SECONDS?: string;
  MCP_DEFAULT_TOPIC?: string;
}

export type NtfyAction = {
  id?: string;
  action: "view" | "broadcast" | "http" | "copy";
  label: string;
  clear?: boolean;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  intent?: string;
  extras?: Record<string, string>;
  value?: string;
};

export type PublicAttachment = {
  name: string;
  type?: string;
  size?: number;
  expires?: number;
  url: string;
};

export type StoredAttachment = PublicAttachment & {
  key?: string;
};

export type NtfyMessage = {
  id: string;
  sequence_id?: string;
  time: number;
  expires?: number;
  event: "open" | "keepalive" | "message" | "message_delete" | "message_clear" | "poll_request";
  topic: string;
  title?: string;
  message?: string;
  priority?: number;
  tags?: string[];
  click?: string;
  icon?: string;
  actions?: NtfyAction[];
  attachment?: PublicAttachment;
  poll_id?: string;
  content_type?: string;
  encoding?: string;
};

export type StoredMessage = Omit<NtfyMessage, "attachment"> & {
  attachment?: StoredAttachment;
  cache_visible: boolean;
  delivered: boolean;
  scheduled_at?: number;
  admin_delete_at?: number;
  created_at: string;
};

export type PublishInput = {
  message: StoredMessage;
  baseUrl: string;
};
