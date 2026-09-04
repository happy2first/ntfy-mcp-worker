# ntfy-mcp-worker

A Cloudflare-native implementation of the core ntfy server protocol with Durable Objects, SQLite-backed history, MCP tools, and an admin console.

It is designed for personal or small self-hosted deployments that want ntfy-compatible publishing/subscription behavior without running a separate VPS.

## What it provides

- HTTP publish: `POST/PUT /<topic>` and JSON publish at `/`
- JSON, SSE, raw, WebSocket, polling, and cache replay subscriptions
- Sequence IDs plus `message_clear` / `message_delete` lifecycle events
- `since=all|latest|<duration>|<unix>|<message-id>` and `id=<message-id>`
- Delayed delivery backed by Durable Object alarms
- Message history in Durable Object SQLite
- Local attachments stored in SQLite BLOB chunks
- External `X-Attach` URLs without copying the remote object
- Standard ntfy metadata: title, priority, tags, click URL, icon, Markdown, actions, and cache flag
- Optional Basic/Bearer authentication for ntfy protocol routes
- iOS wake-up support through the official ntfy upstream/APNs path
- Streamable HTTP MCP endpoint at `/mcp`
- Admin UI at `/admin`
- Capacity-based automatic history cleanup

## Architecture

```text
Publishers / ntfy clients / MCP client
                |
                v
         Cloudflare Worker
        /       |        \
   ntfy API    /mcp     /admin
        |        |         |
        +--------+---------+
                 |
                 v
         NtfyServerDO
       SQLite-backed storage
        /       |        \
 messages  attachments  schedules
                 |
          1 MiB BLOB chunks

NtfyServerDO ---- poll request ----> ntfy.sh upstream
                                      |
                                   APNs/Firebase
                                      |
                                  ntfy client
                                      |
                              fetches your Worker
```

This is a Cloudflare-native implementation, not a line-by-line port of the upstream Go server.

## Storage model

### Message history

History is controlled by **logical storage capacity**, not by a fixed retention period.

Current behavior:

- default logical history limit: **700 MB**;
- configurable range: **50–700 MB**;
- when the limit is exceeded, the oldest already-delivered records are physically deleted;
- cleanup targets roughly 90% of the configured limit to reduce churn;
- scheduled messages that have not yet been delivered are protected from automatic cleanup;
- deleting a message also deletes its locally stored attachment chunks in the same Durable Object transaction.

### Local attachments

Uploaded attachments are stored in SQLite tables using 1 MiB chunks.

Current limits:

- maximum local attachment: **20 MiB**;
- chunk size: **1 MiB**;
- attachment metadata and BLOB chunks stay with the corresponding message;
- this storage model is intended for notification-sized images, PDFs, and small files, not bulk object storage.

R2 is not required.

## iOS wake-up model

For the official ntfy iOS app, set a public base URL for your deployment and use the official ntfy service as the wake-up upstream:

```text
BASE_URL=https://ntfy.example.com
UPSTREAM_BASE_URL=https://ntfy.sh
```

For each published message, the Worker sends an empty poll request to a hashed upstream topic derived from your public server URL and topic. The notification body remains on your Worker; the upstream is used to wake the iOS client, which then fetches the actual message from your server.

`BASE_URL` must exactly match the **Default Server** configured in the ntfy iOS app.

## MCP tools

| Tool | Purpose |
| --- | --- |
| `ntfy_publish_message` | Publish or update a notification, including delay and actions |
| `ntfy_fetch_messages` | Poll/replay cached messages from one or more topics |
| `ntfy_manage_message` | Emit `message_clear` / `message_delete` by sequence ID |
| `ntfy_delete_record` | Physically delete one stored record and its local attachment |
| `ntfy_status` | Inspect message/topic counts, schedules, SQLite/attachment usage, and upstream config |

The `/mcp` endpoint uses the same admin-authentication model as `/admin`.

## Admin UI

`/admin` provides:

- message/topic/scheduled-delivery summary;
- history-storage usage;
- topic filter and search;
- message metadata and attachment display;
- immediate physical deletion;
- configurable 50–700 MB history-storage limit;
- automatic cleanup status;
- test notification support through the protected admin API.

## Cloudflare resources

The project requires:

- one Cloudflare Worker;
- one SQLite-backed Durable Object binding named `NTFY_SERVER`.

The first deployment applies the SQLite Durable Object migration already defined in `wrangler.jsonc`.

No R2 bucket is required.

## Configuration

### Public/runtime variables

Configure these in Cloudflare rather than hard-coding deployment-specific values into source files:

```text
BASE_URL=https://ntfy.example.com
UPSTREAM_BASE_URL=https://ntfy.sh
MCP_DEFAULT_TOPIC=alerts
```

### Optional upstream token

```bash
npx wrangler secret put UPSTREAM_ACCESS_TOKEN
```

### Optional ntfy protocol authentication

```bash
npx wrangler secret put NTFY_ACCESS_TOKEN
npx wrangler secret put NTFY_USERNAME
npx wrangler secret put NTFY_PASSWORD
```

### Admin/MCP authentication

Preferred: protect `/admin` and `/mcp` using path-scoped Cloudflare Access and configure:

```text
TEAM_DOMAIN=https://<your-team>.cloudflareaccess.com
POLICY_AUD=<your-access-application-audience>
```

Do **not** protect the entire Worker with Cloudflare Access if official ntfy clients need to access normal protocol routes directly.

Alternatively, configure a static admin token:

```bash
npx wrangler secret put ADMIN_TOKEN
```

Then bootstrap a browser session with:

```text
https://ntfy.example.com/admin?token=<ADMIN_TOKEN>
```

Treat URLs containing an admin token as secrets and avoid putting them in logs, screenshots, documentation, or shell history.

## Deploy

```bash
npm install
npm run check
npm run deploy
```

Bind your own custom hostname, for example:

```text
ntfy.example.com
```

## Quick protocol examples

If protocol authentication is enabled, add the appropriate Basic or Bearer credentials.

Publish text:

```bash
curl -d 'hello from worker' \
  -H 'Title: Worker test' \
  -H 'Priority: high' \
  -H 'Tags: white_check_mark' \
  https://ntfy.example.com/alerts
```

Upload a local attachment:

```bash
curl -T report.pdf \
  -H 'Filename: report.pdf' \
  -H 'Message: monthly report' \
  https://ntfy.example.com/alerts
```

Poll:

```bash
curl 'https://ntfy.example.com/alerts/json?poll=1&since=10m'
```

Schedule:

```bash
curl -d '10 minutes later' -H 'Delay: 10m' \
  https://ntfy.example.com/alerts
```

## Compatibility boundary

The project focuses on personal ntfy clients, iOS self-hosting, MCP integration, and compact notification history.

Not currently implemented:

- full multi-user signup/login/reservation/ACL behavior;
- SMTP email delivery and Twilio calls;
- browser Web Push/VAPID fan-out;
- Matrix Push Gateway;
- the upstream React web application;
- upstream billing/tier/rate-limit accounting.

## Security notes

- Keep all tokens, passwords, Access configuration, and `.dev.vars`/`.env` files out of source control.
- Public ntfy topic names act like capabilities unless protocol authentication is enabled.
- Local attachment downloads pass through the Worker and inherit ntfy protocol authentication.
- `/admin` and `/mcp` should never be exposed without Cloudflare Access or `ADMIN_TOKEN`.
- The repository intentionally contains placeholders such as `ntfy.example.com`; use your own hostname at deployment time.

## Upstream references

- `binwiederhier/ntfy` — protocol behavior, delayed delivery, sequence lifecycle, and iOS upstream model
- `binwiederhier/ntfy-ios` — iOS client polling behavior
- `cyanheads/ntfy-mcp-server` — MCP integration conventions

## License

MIT
