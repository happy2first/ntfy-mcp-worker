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


## 通用 Webhook

新增 `POST /webhook/:topic/:secret`，用于 AI Trend 等第三方网站。与原生 ntfy 发布接口独立：Webhook 只校验 URL 中的凭证，不要求 `NTFY_ACCESS_TOKEN`。原有 ntfy、iOS、MCP 和 Admin 的认证与功能保持不变；Webhook 消息复用现有持久化、订阅推送和 iOS 唤醒流程。

### 一次启用，默认无需配置映射

1. 在 Cloudflare 控制台进入此 Worker → **设置 → 变量和机密 → 添加**，类型选 **机密（Secret）**，名称填 `WEBHOOK_MASTER_SECRET`，值设为长随机字符串。也可执行 `npx wrangler secret put WEBHOOK_MASTER_SECRET`，按提示输入。可用 `openssl rand -hex 32` 生成随机值。不要把实际值写进仓库或普通前端变量。
2. 打开已有 `/admin` 管理页，在 **Webhook 管理** 输入目标 topic（例如 `AITrend`），点击 **生成 URL**，再点击 **复制**。
3. 将完整 URL 填入第三方网站的 Webhook 地址，方法选择 POST。无需额外请求头凭证，也无需逐个 topic 建立映射配置。

```sh
curl -X POST 'https://你的域名/webhook/AITrend/管理页生成的凭证' \
  -H 'Content-Type: application/json' \
  -d '{"title":"AI 服务重置提醒","summary":"预计今晚完成重置","url":"https://example.com/reset","probability":98}'
```

上述请求的 `title`、`summary`、`url` 分别成为 ntfy 的 `title`、`message`、`click`，`probability` 会保留在正文附加的 JSON 中。最终 topic 只能由 URL 决定；payload 内的 `topic`、`actions`、`delay` 等不会作为发布控制参数执行。

未配置 `WEBHOOK_MASTER_SECRET` 时，Webhook 返回 503，其他功能正常。凭证为 **HMAC-SHA256(master secret, UTF-8 topic)** 的 64 位小写十六进制结果，使用 Web Crypto 验证 MAC，不进行普通字符串比较。服务端不存储各 topic 的凭证，主密钥不会返回给管理页；同一主密钥和 topic 总是生成同一 URL。更换主密钥会使所有旧 Webhook URL 失效，需要重新复制到各来源。目前不支持单独撤销某个 topic 的凭证。

完整 Webhook URL 本身具有向该 topic 发布的权限，应当作为凭证保管。第三方、代理和请求日志可能记录 URL，分享日志前请遮盖凭证。如果在 Worker 外层配置了 Cloudflare Access 路径保护，请确保第三方能够到达 `/webhook/*`，同时保留 `/admin`、`/mcp` 的原有保护。此接口用于第三方服务端调用，不提供跨域浏览器 CORS 授权。

### 字段映射：全局规则 + topic 部分覆盖

| ntfy 字段 | 内置来源候选字段（依次尝试） |
| --- | --- |
| title | title, subject, name |
| message | message, summary, content, description, text, body |
| click | url, link, href, click |

在管理页选择 **全局默认规则** 或 **当前 topic 覆盖规则**，点击 **读取配置** 后编辑。每项用英文逗号分隔来源字段路径，例如 `data.message, payload.summary`。留空表示继承；清空 topic 的所有项并保存即可恢复完全继承。

每个目标字段独立尝试：**topic 自定义候选 → 全局自定义候选 → 内置候选 → 原始 payload 正文兜底**。某条路径缺失、为空或类型不适用时继续尝试后续候选。topic 只保存填写的项，不复制全局配置；修改全局规则后，所有未覆盖项立即继承新规则。例如某 topic 只填写正文 `data.note`，标题和链接仍使用全局及内置规则。

- 点路径是精确路径，例如 `data.message`、`payload.url`。单个字段名先检查根对象，再按广度优先查找嵌套对象；数组不进行字段推断，但原始内容会保留。
- 标题、正文可识别非空字符串、数字和布尔值。对象和数组不会被强制转换成 `[object Object]`；无法识别正文时用整个 JSON 兜底。
- 点击链接只接受绝对 HTTP/HTTPS URL（最长 2048 字符），其他值保留在正文。标题最长 256 字符，超过时完整原始标题也保留在正文中。
- 未映射内容全部附加到正文，避免任意判断哪些字段“不重要”。无法识别正文时保留完整 JSON，包括已识别的标题与链接。JSON 优先格式化；格式化导致正文膨胀超过 70,000 字节时退回紧凑 JSON，不静默截断。
- 配置复用现有 Durable Object SQLite 的 `settings` 表，使用 `webhook:global` 和 `webhook:topic:<topic>`，不新增数据库、绑定或生产依赖。空配置删除对应记录。

### 请求格式与限制

支持 `application/json`（包括 `+json`）、`text/plain`、`text/markdown`、`application/x-www-form-urlencoded`。普通文本保持原样，Markdown 保留内容类型；JSON 即使被标记为 `text/plain` 也会尝试适配。表单重复键保留为数组。不支持的格式按文本尝试解析，不作为二进制附件上传。

无效 JSON（包括“标题文字 + JSON”这种混合内容）原样作为正文接收，不报解析错误，不丢弃内容；这类混合内容不会猜测并拆分成字段。

- topic：1–64 位 ASCII 字母、数字、下划线或短横线，与原生 topic 校验一致。
- 原始请求体：最多 **70,000 字节**，包括 UTF-8 多字节字符。既检查 Content-Length，也限制实际流式读取，超过返回 413。
- 凭证错误：401；topic 不合法：400；路径不匹配：404；非 POST：405；未设置主密钥：503。验证失败不会读取映射或发布消息。
- 每个映射字段最多 20 个候选路径，每条最多 160 字符。配置只支持路径列表，不支持脚本、表达式或复杂规则引擎。

管理 API 均沿用现有 Admin 认证，响应使用 `Cache-Control: no-store`：

| API | 用途 |
| --- | --- |
| `POST /admin/api/webhook/url` | JSON `{ "topic": "AITrend" }`，返回完整 URL |
| `GET /admin/api/webhook/config?topic=AITrend` | 返回全局、该 topic 的稀疏配置、内置规则及是否启用；不返回主密钥 |
| `PUT /admin/api/webhook/config` | JSON `{ "scope": "topic", "topic": "AITrend", "mapping": { "message": ["data.note"] } }`；全局用 `scope: "global"` |

PUT 替换当前作用域的稀疏规则，未提交的字段恢复继承；不会覆盖其他 topic。生产部署继续使用已有 `keep_vars: true` 与 DO 绑定。

### 验证

```sh
npm install --ignore-scripts
npm test
npm run check
```

测试覆盖 HMAC、topic 隔离、字段优先级与继承、嵌套字段、常见请求格式、原始数据兜底、大小限制及非法配置。集成测试使用 Wrangler 自带的 Miniflare 运行实际入口与 Durable Object SQLite，验证配置持久化、发布与读取，以及原生 ntfy、iOS token 登录、MCP、Admin 的认证回归；测试的上游请求由本地模拟响应接管，不向真实 ntfy 服务发送消息。

本地集成测试使用固定 Wrangler 所带模拟器支持的 `2026-08-06` 兼容日期；生产 `wrangler.jsonc` 仍保持原有 `2026-09-03`，并通过 dry-run 构建校验。
