import test from "node:test";
import assert from "node:assert/strict";
import { parseActions, parseFutureTime, parsePriority, parseSince, parseTags } from "../src/protocol.ts";

test("priority aliases", () => {
  assert.equal(parsePriority("high"), 4);
  assert.equal(parsePriority("5"), 5);
});

test("HTTP Priority header is ignored", () => {
  assert.equal(parsePriority("u=1, i"), undefined);
  assert.equal(parsePriority("u=0"), undefined);
  assert.equal(parsePriority("i, u=3"), undefined);
});

test("tags", () => assert.deepEqual(parseTags("warning,skull"), ["warning", "skull"]));

test("delay duration", () => assert.equal(parseFutureTime("30m", 1_000_000), 2800));

test("since duration", () => assert.deepEqual(parseSince("10m", 5000), { mode: "time", value: 4400 }));

test("short actions", () => {
  assert.deepEqual(parseActions("view, Open, url=https://example.com, clear=true")?.[0], {
    id: "action1", action: "view", label: "Open", url: "https://example.com", clear: true,
  });
});
