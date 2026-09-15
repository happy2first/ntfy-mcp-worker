import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Use Wrangler's own simulator so the test exercises the deployed entrypoint and DO SQLite.
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve("wrangler"));
const { Miniflare } = wranglerRequire("miniflare");

test("Worker integration: independent webhook auth, persisted sparse rules, native/MCP/Admin regression", { timeout: 120000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "ntfy-webhook-test-"));
  let mf: any;
  try {
    execFileSync(process.execPath, [resolve("node_modules/wrangler/bin/wrangler.js"), "deploy", "--dry-run", "--outdir", dir], { env: { ...process.env, WRANGLER_SEND_METRICS: "false" }, stdio: "pipe", timeout: 60000 });
    // The pinned Wrangler bundles workerd supporting dates through 2026-08-06.
    // Production keeps its existing 2026-09-03 date; the dry-run above builds that configuration.
    mf = new Miniflare({
      modules: true, modulesRoot: dir, scriptPath: join(dir, "ios-compat.js"), compatibilityDate: "2026-08-06", compatibilityFlags: ["nodejs_compat"],
      durableObjects: { NTFY_SERVER: { className: "NtfyServerDO", useSQLite: true } }, resourcePersistencePath: join(dir, "state"),
      bindings: { ADMIN_TOKEN: "admin-test", NTFY_ACCESS_TOKEN: "native-test", WEBHOOK_MASTER_SECRET: "master-test", BASE_URL: "https://ntfy.example" },
      outboundService: () => new Response("ok"),
    });
    const fetch = (path: string, init?: any) => mf.dispatchFetch("https://ntfy.example" + path, init);
    const admin = (path: string, init: any = {}) => fetch("/admin/api/webhook" + path, { ...init, headers: { authorization: "Bearer admin-test", "content-type": "application/json" } });
    for (const path of ["/admin", "/admin/api/webhook/config", "/mcp", "/AITrend/json?poll=1"]) {
      assert.equal((await fetch(path)).status, 401, path);
    }
    assert.equal((await fetch("/admin/api/webhook/url", { method: "POST", body: '{"topic":"AITrend"}', headers: { authorization: "Bearer native-test" } })).status, 401);
    assert.equal((await fetch("/AITrend", { method: "POST", body: "hi" })).status, 401);
    const page = await fetch("/admin?token=admin-test");
    assert.equal(page.status, 200); assert.ok((await page.text()).includes('id="webhookPanel"'));
    const initial = await (await admin("/config")).json();
    assert.deepEqual(initial.global, {}); assert.deepEqual(initial.topic, {}); assert.equal(initial.enabled, true);
    const urlResponse = await admin("/url", { method: "POST", body: '{"topic":"AITrend"}' });
    assert.equal(urlResponse.status, 200); assert.equal(urlResponse.headers.get("cache-control"), "no-store");
    const { url } = await urlResponse.json();
    assert.match(url, /^https:\/\/ntfy\.example\/webhook\/AITrend\/[a-f0-9]{64}$/);
    assert.equal((await (await admin("/url", { method: "POST", body: '{"topic":"AITrend"}' })).json()).url, url);
    const webhookPath = new URL(url).pathname;
    const post = (body: any, type = "application/json") => fetch(webhookPath, { method: "POST", headers: { "content-type": type }, body: typeof body === "string" ? body : JSON.stringify(body) });
    let response = await post({ title: "AI 重置", summary: "今晚重置", url: "https://example.com/reset", probability: 98, topic: "evil" });
    assert.equal(response.status, 200); let message = await response.json();
    assert.equal(message.topic, "AITrend"); assert.equal(message.title, "AI 重置"); assert.equal(message.click, "https://example.com/reset"); assert.ok(message.message.includes('"probability": 98'));
    assert.equal((await fetch(webhookPath.replace("AITrend", "other"), { method: "POST", body: "hi", headers: { authorization: "Bearer native-test" } })).status, 401);
    const save = (scope: string, mapping: any, topic?: string) => admin("/config", { method: "PUT", body: JSON.stringify({ scope, mapping, topic }) });
    assert.equal((await save("global", { title: ["heading"], message: ["data.note"] })).status, 200);
    assert.equal((await save("topic", { message: ["payload.special"] }, "AITrend")).status, 200);
    let rules = await (await admin("/config?topic=AITrend")).json();
    assert.deepEqual(rules.topic, { message: ["payload.special"] });
    assert.deepEqual((await (await admin("/config?topic=other")).json()).topic, {});
    response = await post({ heading: "global title", data: { note: "global text" }, payload: { special: "topic text" } });
    message = await response.json(); assert.equal(message.title, "global title"); assert.ok(message.message.startsWith("topic text"));
    await save("global", { title: ["newHeading"], message: ["data.note"] });
    message = await (await post({ newHeading: "updated global", payload: { special: "topic text" } })).json();
    assert.equal(message.title, "updated global");
    await save("topic", {}, "AITrend");
    rules = await (await admin("/config?topic=AITrend")).json(); assert.deepEqual(rules.topic, {});
    message = await (await post({ data: { note: "inherited text" } })).json(); assert.equal(message.message, "inherited text");
    assert.equal((await save("topic", { title: ["__proto__.x"] }, "AITrend")).status, 400);
    assert.equal((await admin("/config", { method: "PUT", body: "bad JSON" })).status, 400);
    assert.equal((await admin("/config?topic=bad%2Ftopic")).status, 400);
    assert.equal((await post("x".repeat(70001), "text/plain")).status, 413);
    assert.equal((await post("broken {", "application/json")).status, 200);
    for (const body of ["null", "[]", "123"]) assert.equal((await admin("/url", { method: "POST", body })).status, 400);
    assert.equal((await fetch("/webhook", { method: "POST", headers: { authorization: "Bearer native-test" }, body: "native webhook topic" })).status, 200);
    assert.equal((await fetch("/webhook/json?poll=1", { headers: { authorization: "Bearer native-test" } })).status, 200);
    message = await (await post("subject=Form&body=hello", "application/x-www-form-urlencoded")).json(); assert.equal(message.title, "Form"); assert.equal(message.message, "hello");
    message = await (await post("# markdown", "text/markdown")).json(); assert.equal(message.content_type, "text/markdown");
    response = await fetch("/AITrend/json?poll=1", { headers: { authorization: "Bearer native-test" } });
    assert.equal(response.status, 200); assert.ok((await response.text()).includes("inherited text"));
    response = await fetch("/AITrend", { method: "POST", headers: { authorization: "Bearer native-test" }, body: "native still works" });
    assert.equal(response.status, 200); assert.equal((await response.json()).message, "native still works");
    assert.equal((await fetch("/AITrend/auth", { headers: { authorization: "Basic " + Buffer.from(":native-test").toString("base64") } })).status, 200);
    response = await fetch("/mcp", { method: "POST", headers: { authorization: "Bearer admin-test", "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    assert.equal(response.status, 200); assert.ok((await response.text()).includes("ntfy_publish"));
    // Restart the runtime against the same SQLite directory to verify persistence.
    await mf.dispose();
    mf = new Miniflare({ modules: true, modulesRoot: dir, scriptPath: join(dir, "ios-compat.js"), compatibilityDate: "2026-08-06", compatibilityFlags: ["nodejs_compat"], durableObjects: { NTFY_SERVER: { className: "NtfyServerDO", useSQLite: true } }, resourcePersistencePath: join(dir, "state"), bindings: { ADMIN_TOKEN: "admin-test" }, outboundService: () => new Response("ok") });
    rules = await (await admin("/config?topic=AITrend")).json(); assert.deepEqual(rules.global, { title: ["newHeading"], message: ["data.note"] }); assert.equal(rules.enabled, false);
    assert.equal((await admin("/url", { method: "POST", body: '{"topic":"AITrend"}' })).status, 503);
    assert.equal((await post("hi")).status, 503);
  } finally { if (mf) await mf.dispose(); rmSync(dir, { recursive: true, force: true }); }
});
