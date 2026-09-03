# ntfy-mcp-worker

A Cloudflare Workers + Durable Objects rewrite of the core [ntfy](https://github.com/binwiederhier/ntfy) server protocol, with an MCP endpoint and an admin console.

Target deployment: `https://ntfy.mcp.happyfirst.top`

## Why this exists

The official ntfy server is a Go service designed around a normal server process, SQLite/PostgreSQL, local/S3 attachments, and long-lived HTTP/WebSocket connections. This project implements the ntfy-compatible paths needed for a personal Cloudflare-native deployment:

- HTTP publish: `POST/PUT /<topic>` and JSON publish at `/`
- Sequence IDs: update semantics plus `clear` / `delete` events
- Subscribers: JSON stream, SSE, raw stream, WebSocket, polling and cache replay
- `since=all|latest|<duration>|<unix>|<message-id>` and `id=<message-id>`
- Delayed delivery (10 seconds to 3 days) backed by Durable Object alarms
- Message cache in Durable Object SQLite
- Attachments in Cloudflare R2, including `X-Filename` uploads and external `X-Attach`
- Standard ntfy metadata: title, priority, tags, click URL, icon, Markdown, actions, cache flag
- Basic auth and bearer-token authentication for ntfy protocol routes
- iOS instant notifications through the official ntfy upstream/APNs path
- Streamable HTTP MCP endpoint at `/mcp`
- Admin UI at `/admin` for message history, immediate physical deletion, per-message scheduled deletion and retention settings

The MCP tool naming and lifecycle model follow the public `cyanheads/ntfy-mcp-server` project where appropriate, while the Cloudflare layout, Access protection and admin-page approach follow `happy2first/weixin-mcp-worker`.

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
       messages / schedules / subscribers
          |                    |
          v                    v
      R2 attachments       ntfy.sh upstream
                              |
                           Firebase/APNs
                              |
                           ntfy iOS app
                              |
                     polls original Worker
```

### iOS privacy model

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

The upstream receives the hashed topic URL and message ID, not your notification body. APNs wakes the official iOS app, which fetches the real message from:

```text
https://ntfy.mcp.happyfirst.top/<topic>/json?poll=1&id=<message-id>
```

**Important:** `BASE_URL` must exactly match the Default Server configured in the iOS ntfy app.

## MCP tools

| Tool | Purpose |
| --- | --- |
| `ntfy_publish_message` | Publish/update a notification, including delay and actions |
| `ntfy_fetch_messages` | Poll/replay cached messages from one or more topics |
| `ntfy_manage_message` | Emit `message_clear` / `message_delete` by sequence ID |
| `ntfy_delete_record` | Admin-only physical delete or scheduled record deletion |
| `ntfy_status` | Inspect message/topic counts, subscribers, SQLite usage and upstream config |

The MCP endpoint uses Streamable HTTP at `/mcp` and is protected by the same admin authentication as `/admin`.

## Admin UI

`/admin` provides:

- message count, topic count and scheduled-operation summary;
- topic filter and text/ID search;
- message metadata and attachment display;
- immediate physical deletion (including local R2 attachment);
- per-message scheduled deletion;
- cancellation of a scheduled deletion;
- global cache retention setting;
- one-click test notification.

This is intentionally an operator console. It is separate from ntfy's end-user Web App.

## Cloudflare resources

### 1. R2 bucket

Create the bucket referenced by `wrangler.jsonc`:

```bash
npx wrangler r2 bucket create ntfy-mcp-attachments
```

If you choose a different bucket name, edit `r2_buckets[0].bucket_name`.

### 2. Durable Object

The first deploy applies the `v1` SQLite Durable Object migration from `wrangler.jsonc` automatically.

### 3. Variables and secrets

Public/runtime variables:

```text
BASE_URL=https://ntfy.mcp.happyfirst.top
UPSTREAM_BASE_URL=https://ntfy.sh
MESSAGE_RETENTION_SECONDS=43200
ATTACHMENT_RETENTION_SECONDS=10800
MCP_DEFAULT_TOPIC=alerts
```

Optional iOS upstream token, only if needed for upstream rate limits:

```bash
npx wrangler secret put UPSTREAM_ACCESS_TOKEN
```

Optional ntfy protocol protection. Use either bearer token, Basic auth, or both:

```bash
npx wrangler secret put NTFY_ACCESS_TOKEN
npx wrangler secret put NTFY_USERNAME
npx wrangler secret put NTFY_PASSWORD
```

Protect `/admin` and `/mcp` using **one** of these approaches:

**Cloudflare Access (preferred):**

```text
TEAM_DOMAIN=https://<team>.cloudflareaccess.com
POLICY_AUD=<Access application audience tag>
```

**Static admin token:**

```bash
npx wrangler secret put ADMIN_TOKEN
```

With `ADMIN_TOKEN`, bootstrap the browser session once with:

```text
https://ntfy.mcp.happyfirst.top/admin?token=<ADMIN_TOKEN>
```

The Worker stores it in a Secure/HttpOnly/SameSite cookie scoped to `/admin`.

## Deploy

```bash
npm install
npm run check
npm run deploy
```

Then add the custom domain in Cloudflare Workers:

```text
ntfy.mcp.happyfirst.top
```

Do not put a path prefix in `BASE_URL` unless the iOS app is configured with exactly the same value.

## Quick protocol tests

Publish:

```bash
curl -d 'hello from worker' \
  -H 'Title: Worker test' \
  -H 'Priority: high' \
  -H 'Tags: white_check_mark' \
  https://ntfy.mcp.happyfirst.top/alerts
```

Poll:

```bash
curl 'https://ntfy.mcp.happyfirst.top/alerts/json?poll=1&since=10m'
```

SSE:

```bash
curl -N https://ntfy.mcp.happyfirst.top/alerts/sse
```

Schedule:

```bash
curl -d '10 minutes later' -H 'Delay: 10m' \
  https://ntfy.mcp.happyfirst.top/alerts
```

Sequence delete:

```bash
curl -X DELETE \
  https://ntfy.mcp.happyfirst.top/alerts/my-sequence-id
```

## Compatibility boundary

This is a Cloudflare-native implementation, not a line-by-line port of the Go server. The first release intentionally focuses on the features required for ntfy clients, iOS self-hosting, MCP and personal notification history.

Not implemented in v0.1:

- multi-user ntfy account/signup/login/reservation database and per-topic ACL administration;
- SMTP e-mail publishing/notification and Twilio calls;
- browser Web Push/VAPID fan-out;
- Matrix Push Gateway;
- server-side Go template evaluation;
- ntfy billing/tier/rate-limit accounting;
- the full official ntfy React Web App bundle.

These are isolated from the core protocol and can be added without changing the Durable Object message model. For this personal deployment, Cloudflare Access/static protocol credentials replace the full ntfy account subsystem.

## Security notes

- Configure Cloudflare Access or `ADMIN_TOKEN` before exposing `/admin` and `/mcp`; both routes intentionally return 503 when neither admin-auth mode is configured.
- Public ntfy topics are effectively capabilities: anyone who knows a topic can read/write it. Configure Basic/Bearer protocol auth if topic names should not be sufficient authorization.
- R2 attachment URLs pass through the Worker and therefore inherit ntfy protocol authentication.
- `UPSTREAM_ACCESS_TOKEN`, protocol credentials and `ADMIN_TOKEN` should be Wrangler secrets, not committed variables.

## Source references

- `binwiederhier/ntfy` — protocol/message model, delayed delivery, sequence lifecycle and iOS upstream design.
- `binwiederhier/ntfy-ios` — `poll=1&id=<message-id>` behavior used by the Notification Service Extension.
- `cyanheads/ntfy-mcp-server` — MCP tool surface and message lifecycle conventions.
- `happy2first/weixin-mcp-worker` — Cloudflare Worker + Durable Object + MCP + protected admin-console project structure.

## License

This repository contains a clean TypeScript implementation and does not copy the ntfy Go server source. Choose a project license before making the repository public.
