# ntfy-mcp-worker

A Cloudflare Workers + Durable Objects rewrite of the core [ntfy](https://github.com/binwiederhier/ntfy) server protocol, with an MCP endpoint and an admin console.

Target deployment: `https://ntfy.mcp.happyfirst.top`

## What it provides

- HTTP publish: `POST/PUT /<topic>` and JSON publish at `/`
- Sequence IDs plus `clear` / `delete` events
- JSON, SSE, raw, WebSocket subscriptions, polling and cache replay
- `since=all|latest|<duration>|<unix>|<message-id>` and `id=<message-id>`
- Delayed delivery backed by Durable Object alarms
- Message cache in Durable Object SQLite
- Local attachments in the same Durable Object SQLite, split into 1 MiB BLOB chunks
- External `X-Attach` URLs without local copying
- Standard ntfy metadata: title, priority, tags, click URL, icon, Markdown, actions and cache flag
- Basic/Bearer auth for ntfy protocol routes
- iOS instant notifications through the official ntfy upstream/APNs path
- Streamable HTTP MCP endpoint at `/mcp`
- `/admin` message history, immediate physical deletion, scheduled deletion and retention settings

The Cloudflare layout and attachment-storage strategy intentionally follow `happy2first/weixin-mcp-worker`: structured records and media stay in one SQLite-backed Durable Object, so no R2 account or R2 billing setup is required.

## Architecture

```text
Publishers / ntfy iOS / MCP client
              |
              v
       Cloudflare Worker
       /       |       \
 ntfy API    /mcp     /admin
     |          |        |
     +----------+--------+
                |
                v
        NtfyServerDO (SQLite)
      /          |           \
 messages   attachment BLOBs  schedules/subscribers
                |
        1 MiB chunk rows

NtfyServerDO ---- poll request ----> ntfy.sh upstream
                                      |
                                   Firebase/APNs
                                      |
                                   ntfy iOS app
                                      |
                              polls original Worker
```

## Attachment storage

Locally uploaded attachments use two SQLite tables:

```text
attachment_objects
├─ attachment_ref
├─ message_id
├─ name / MIME type
├─ size_bytes
├─ chunk_count
├─ expires
└─ created_at

attachment_chunks
├─ attachment_ref
├─ chunk_index
└─ data BLOB
```

Current limits/defaults:

- maximum local attachment: **20 MiB**;
- chunk size: **1 MiB**;
- default attachment lifetime: **3 hours** (`ATTACHMENT_RETENTION_SECONDS=10800`);
- message and its local attachment are physically deleted together in one Durable Object SQLite transaction;
- expired attachments are cleaned by the same Durable Object alarm scheduler;
- `/admin/api/status` and `ntfy_status` report attachment count, bytes and chunk count.

This is intended for notification-sized images, PDFs and small files, not bulk object storage. If the project later needs large or long-lived files, R2 can be added as an optional backend without changing the public ntfy URLs.

## iOS privacy model

Set:

```text
BASE_URL=https://ntfy.mcp.happyfirst.top
UPSTREAM_BASE_URL=https://ntfy.sh
```

For a published message, the Worker sends an empty upstream request to:

```text
https://ntfy.sh/<sha256(BASE_URL + "/" + topic)>
X-Poll-ID: <message-id>
```

The upstream receives the hashed topic URL and message ID, not your notification body. APNs wakes the official iOS app, which fetches the actual message from your Worker.

**Important:** `BASE_URL` must exactly match the Default Server configured in the iOS ntfy app.

## MCP tools

| Tool | Purpose |
| --- | --- |
| `ntfy_publish_message` | Publish/update a notification, including delay and actions |
| `ntfy_fetch_messages` | Poll/replay cached messages from one or more topics |
| `ntfy_manage_message` | Emit `message_clear` / `message_delete` by sequence ID |
| `ntfy_delete_record` | Physical delete or scheduled record deletion; local attachment is removed with the record |
| `ntfy_status` | Inspect message/topic counts, subscribers, SQLite/attachment usage and upstream config |

`/mcp` is protected by the same admin authentication as `/admin`.

## Admin UI

`/admin` provides:

- message/topic/scheduled-operation summary;
- topic filter and text/ID search;
- message metadata and attachment display;
- immediate physical deletion including local SQLite attachment chunks;
- per-message scheduled deletion and cancellation;
- global cache retention setting;
- one-click test notification.

## Cloudflare resources

Only the Worker and one SQLite-backed Durable Object are required. **R2 is not required.**

The first deploy applies the `v1` SQLite Durable Object migration from `wrangler.jsonc` automatically.

### Variables

```text
BASE_URL=https://ntfy.mcp.happyfirst.top
UPSTREAM_BASE_URL=https://ntfy.sh
MESSAGE_RETENTION_SECONDS=43200
ATTACHMENT_RETENTION_SECONDS=10800
MCP_DEFAULT_TOPIC=alerts
```

Optional iOS upstream token:

```bash
npx wrangler secret put UPSTREAM_ACCESS_TOKEN
```

Optional ntfy protocol protection:

```bash
npx wrangler secret put NTFY_ACCESS_TOKEN
npx wrangler secret put NTFY_USERNAME
npx wrangler secret put NTFY_PASSWORD
```

Protect `/admin` and `/mcp` using Cloudflare Access (preferred):

```text
TEAM_DOMAIN=https://<team>.cloudflareaccess.com
POLICY_AUD=<Access application audience tag>
```

or a static token:

```bash
npx wrangler secret put ADMIN_TOKEN
```

With `ADMIN_TOKEN`, bootstrap the browser session once with:

```text
https://ntfy.mcp.happyfirst.top/admin?token=<ADMIN_TOKEN>
```

## Deploy

```bash
npm install
npm run check
npm run deploy
```

Then bind the custom domain:

```text
ntfy.mcp.happyfirst.top
```

No `wrangler r2 bucket create` step is required.

## Quick protocol tests

Publish text:

```bash
curl -d 'hello from worker' \
  -H 'Title: Worker test' \
  -H 'Priority: high' \
  -H 'Tags: white_check_mark' \
  https://ntfy.mcp.happyfirst.top/alerts
```

Upload a local attachment:

```bash
curl -T report.pdf \
  -H 'Filename: report.pdf' \
  -H 'Message: monthly report' \
  https://ntfy.mcp.happyfirst.top/alerts
```

Poll:

```bash
curl 'https://ntfy.mcp.happyfirst.top/alerts/json?poll=1&since=10m'
```

Schedule:

```bash
curl -d '10 minutes later' -H 'Delay: 10m' \
  https://ntfy.mcp.happyfirst.top/alerts
```

## Compatibility boundary

This is a Cloudflare-native implementation, not a line-by-line port of the Go server. It intentionally focuses on personal ntfy clients, iOS self-hosting, MCP and notification history.

Not currently implemented:

- full ntfy multi-user signup/login/reservation/ACL subsystem;
- SMTP email notification and Twilio calls;
- browser Web Push/VAPID fan-out;
- Matrix Push Gateway;
- server-side Go templates;
- ntfy billing/tier/rate-limit accounting;
- full official ntfy React Web App bundle.

## Security notes

- Configure Cloudflare Access or `ADMIN_TOKEN` before exposing `/admin` and `/mcp`.
- Public ntfy topics are effectively capabilities; configure Basic/Bearer protocol auth if topic names alone should not grant access.
- Local attachment downloads pass through the Worker and inherit ntfy protocol authentication.
- Keep `UPSTREAM_ACCESS_TOKEN`, protocol credentials and `ADMIN_TOKEN` as Wrangler secrets.

## Source references

- `binwiederhier/ntfy` — protocol/message model, delayed delivery, sequence lifecycle and iOS upstream design.
- `binwiederhier/ntfy-ios` — iOS poll behavior.
- `cyanheads/ntfy-mcp-server` — MCP lifecycle conventions.
- `happy2first/weixin-mcp-worker` — Worker + Durable Object + MCP + admin console and SQLite media chunking strategy.

## License

This repository contains a clean TypeScript implementation and does not copy the ntfy Go server source. Choose a project license before making the repository public.
