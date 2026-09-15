import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { adaptWebhook, generateWebhookSecret, verifyWebhookSecret, handleWebhook, readWebhookBody, validateMapping, webhookTopic, WEBHOOK_MAX_BYTES } from "../src/webhook.ts";

const config = { global: {}, topic: {} };
test("HMAC matches SHA-256 reference, isolates topics, rotates with master", async () => {
  const secret = await generateWebhookSecret("AITrend", "test-master");
  assert.equal(secret, createHmac("sha256", "test-master").update("AITrend").digest("hex"));
  assert.equal(await verifyWebhookSecret("AITrend", secret, "test-master"), true);
  for (const [topic, value, master] of [["other", secret, "test-master"], ["AITrend", secret, "rotated"], ["AITrend", "z".repeat(64), "test-master"], ["AITrend", "a", "test-master"]]) assert.equal(await verifyWebhookSecret(topic, value, master), false);
  await assert.rejects(generateWebhookSecret("AITrend", ""), /not_configured/);
});
test("validates topic and sparse mappings", () => {
  for (const topic of ["", "a/b", "a,b", "中", "a".repeat(65), undefined, 123]) assert.throws(() => webhookTopic(topic as string), /invalid_topic/);
  assert.deepEqual(validateMapping({ title: [], message: ["data.message", "data.message"] }), { message: ["data.message"] });
  for (const mapping of [null, [], { unknown: [] }, { title: "title" }, { title: ["__proto__.x"] }, { title: ["constructor"] }, { title: Array(21).fill("x") }, { title: ["a..b"] }]) assert.throws(() => validateMapping(mapping));
});
test("AI Trend maps title + summary + url with no configuration", () => {
  assert.deepEqual(adaptWebhook(JSON.stringify({ title: "重置提醒", summary: "预计今晚重置", url: "https://example.com/reset" }), "application/json"), { title: "重置提醒", message: "预计今晚重置", click: "https://example.com/reset" });
});
test("all default aliases and nested aliases work", () => {
  for (const key of ["title", "subject", "name"]) assert.equal(adaptWebhook(JSON.stringify({ [key]: "标题", message: "正文" }), "application/json").title, "标题");
  for (const key of ["message", "summary", "content", "description", "text", "body"]) assert.equal(adaptWebhook(JSON.stringify({ data: { [key]: "正文" } }), "application/json").message, "正文");
  for (const key of ["url", "link", "href", "click"]) assert.equal(adaptWebhook(JSON.stringify({ payload: { [key]: "https://example.com" }, message: "正文" }), "application/json").click, "https://example.com");
});
test("topic > global > built-in, per-field inheritance and missing-path fallback", () => {
  const raw = JSON.stringify({ a: "topic", b: "global", message: "builtin", globalTitle: "global title", title: "builtin title" });
  const rules = { global: { message: ["b"], title: ["globalTitle"] }, topic: { message: ["a"] } };
  const result = adaptWebhook(raw, "application/json", rules);
  assert.equal(result.title, "global title"); assert.ok(result.message.startsWith("topic\n\n"));
  assert.ok(adaptWebhook(raw, "application/json", { ...rules, topic: { message: ["missing"] } }).message.startsWith("global\n\n"));
  assert.ok(adaptWebhook(raw, "application/json", { global: { message: ["absent"] }, topic: {} }).message.startsWith("builtin\n\n"));
});
test("explicit dot paths, remaining nested fields, numeric and boolean values", () => {
  const result = adaptWebhook(JSON.stringify({ data: { msg: "hello", probability: 98 }, count: 0, flag: false }), "application/json", { global: { message: ["data.msg"], title: ["count"] }, topic: {} });
  assert.equal(result.title, "0"); assert.ok(result.message.startsWith("hello\n\n"));
  assert.deepEqual(JSON.parse(result.message.split("\n\n")[1]), { data: { probability: 98 }, flag: false });
  assert.equal(adaptWebhook('{"message":false}', "application/json").message, "false");
});
test("unknown JSON, arrays, primitives and malformed JSON preserve payload", () => {
  for (const raw of ['{"event":"reset","data":{"x":3}}', '[1,{"x":2}]', 'null', '42', 'true']) assert.deepEqual(JSON.parse(adaptWebhook(raw, "application/json").message), JSON.parse(raw));
  assert.equal(adaptWebhook('"hello"', "application/json").message, "hello");
  for (const raw of ['broken {', 'AI 服务重置提醒\n{"summary":"hi"}', '']) assert.equal(adaptWebhook(raw, "application/json").message, raw);
  assert.equal(adaptWebhook('{"message":{"x":1}}', "application/json").message, '{\n  "message": {\n    "x": 1\n  }\n}');
});
test("form, plain text, markdown and JSON sent as text/plain", () => {
  assert.deepEqual(adaptWebhook('subject=Hi&body=hello&url=https%3A%2F%2Fexample.com', "application/x-www-form-urlencoded; charset=UTF-8"), { title: "Hi", message: "hello", click: "https://example.com" });
  const duplicated = adaptWebhook('message=hi&tag=a&tag=b', "application/x-www-form-urlencoded");
  assert.deepEqual(JSON.parse(duplicated.message.split("\n\n")[1]), { tag: ["a", "b"] });
  assert.equal(adaptWebhook("plain\ntext", "text/plain").message, "plain\ntext");
  assert.deepEqual(adaptWebhook("# Title\ncontent", "text/markdown"), { message: "# Title\ncontent", content_type: "text/markdown" });
  assert.equal(adaptWebhook('{"summary":"hi"}', "text/plain").message, "hi");
});
test("unsafe link preserved in body, untrusted payload cannot control topic or actions", () => {
  const result = adaptWebhook('{"summary":"hi","url":"javascript:alert(1)","topic":"other","actions":[{}]}', "application/json");
  assert.equal(result.click, undefined);
  assert.deepEqual(Object.keys(result), ["message"]);
  assert.ok(result.message.includes('"topic": "other"')); assert.ok(result.message.includes("javascript:"));
});
test("prototype keys remain data, no inherited-property mapping", () => {
  const result = adaptWebhook('{"__proto__":{"polluted":true},"message":"hello"}', "application/json");
  assert.equal(({} as any).polluted, undefined);
  assert.ok(result.message.includes('"__proto__"'));
});
test("bounded stream counts UTF-8 bytes, rejects content-length and streaming overflow", async () => {
  assert.equal(await readWebhookBody(new Request("https://test", { method: "POST", body: "中文" }), 6), "中文");
  await assert.rejects(readWebhookBody(new Request("https://test", { method: "POST", body: "中文" }), 5), /payload_too_large/);
  await assert.rejects(readWebhookBody(new Request("https://test", { method: "POST", headers: { "content-length": "100" }, body: "x" }), 10), /payload_too_large/);
  let cancelled = false;
  const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(11)); }, cancel() { cancelled = true; } });
  await assert.rejects(readWebhookBody(new Request("https://test", { method: "POST", body, duplex: "half" } as any), 10));
  assert.equal(cancelled, true);
});
test("format expansion falls back to compact JSON without truncating data", () => {
  const payload = { message: "x".repeat(69000), rest: [1, 2, 3] };
  const output = adaptWebhook(JSON.stringify(payload), "application/json");
  assert.ok(output.message.includes("rest")); assert.ok(output.message.includes("x".repeat(69000)));
  const unknown = Array.from({ length: 5000 }, () => ({ a: 1 }));
  const result = adaptWebhook(JSON.stringify(unknown), "application/json");
  assert.ok(new TextEncoder().encode(result.message).length <= WEBHOOK_MAX_BYTES);
  assert.deepEqual(JSON.parse(result.message), unknown);
});
test("handler authenticates before reading/config/publish and fixes destination topic", async () => {
  const secret = await generateWebhookSecret("AITrend", "master");
  const published: any[] = []; let configReads = 0;
  const deps = { master: "master", baseUrl: "https://test", config: async () => { configReads++; return config; }, publish: async (topic: string, message: any) => { published.push({ topic, message }); return { id: "message-id" }; } };
  const request = (path: string, body = '{"topic":"evil","summary":"hi"}', method = "POST") => new Request(`https://test${path}`, { method, ...(method === "GET" ? {} : { body }) });
  assert.equal((await handleWebhook(request(`/webhook/AITrend/${secret}`), deps)).status, 200);
  assert.equal(published[0].topic, "AITrend");
  for (const [path, status] of [["/webhook/other/"+secret, 401], ["/webhook/AITrend/bad", 401], ["/webhook/%2F/"+secret, 400], ["/webhook/%XX/"+secret, 400], ["/webhook/AITrend", 404]] as const) assert.equal((await handleWebhook(request(path), deps)).status, status);
  assert.equal(configReads, 1); assert.equal(published.length, 1);
  assert.equal((await handleWebhook(request(`/webhook/AITrend/${secret}`, "", "GET"), deps)).status, 405);
  assert.equal((await handleWebhook(request(`/webhook/AITrend/${secret}`), { ...deps, master: "" })).status, 503);
  assert.equal((await handleWebhook(request(`/webhook/AITrend/${secret}`, "x".repeat(WEBHOOK_MAX_BYTES+1)), deps)).status, 413);
});

test("deep valid JSON falls back to original body if runtime stack is exceeded", () => {
  const raw = '{"data":'.repeat(4000) + '1' + '}'.repeat(4000);
  assert.equal(adaptWebhook(raw, "application/json").message, raw);
});
