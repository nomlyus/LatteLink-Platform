import assert from "node:assert/strict";
import test from "node:test";
import {
  failureResult,
  resolveTargetTimeout,
  safeMarkdownText,
  safeRequestId,
  safeTargetKey,
  safeTargetUrl
} from "./uptime-monitor-utils.mjs";

test("uses the cold-wake allowance only for the live dev API hostname", () => {
  const defaults = { timeoutMs: 10000, devApiTimeoutMs: 45000 };
  assert.deepEqual(resolveTargetTimeout({ url: "https://api-dev.nomly.us/ready" }, defaults), { timeoutMs: 45000 });
  assert.deepEqual(resolveTargetTimeout({ url: "https://api.nomly.us/ready" }, defaults), { timeoutMs: 10000 });
  assert.deepEqual(resolveTargetTimeout({ url: "https://api-dev.nomly.us/ready", timeoutMs: 3500 }, defaults), { timeoutMs: 3500 });
});

test("turns malformed URLs and invalid per-target timeouts into alertable failures", () => {
  const defaults = { timeoutMs: 10000, devApiTimeoutMs: 45000 };
  const invalidUrl = resolveTargetTimeout({ url: "not a URL" }, defaults);
  assert.deepEqual(invalidUrl, { error: "Invalid target URL" });
  const invalidProtocol = resolveTargetTimeout({ url: "file:///etc/passwd" }, defaults);
  assert.deepEqual(invalidProtocol, { error: "Invalid target URL" });
  const invalidTimeout = resolveTargetTimeout({ url: "https://api-dev.nomly.us/health", timeoutMs: 500 }, defaults);
  assert.deepEqual(invalidTimeout, { error: "Invalid target timeout" });
  assert.equal(failureResult({ key: "bad", url: "not a URL" }, invalidUrl.error).ok, false);
});

test("sanitizes request IDs before incident issue output", () => {
  assert.equal(safeRequestId("req-123\n|[bad](url)"), "req-123badurl");
  assert.equal(safeRequestId("a".repeat(200))?.length, 128);
  assert.equal(safeRequestId("\n\t"), undefined);
});

test("removes URL credentials, query, and fragment from incident text", () => {
  assert.equal(
    safeTargetUrl("https://user:password@example.test/health?token=secret#invite"),
    "https://example.test/health"
  );
  assert.equal(safeTargetUrl("javascript:alert(1)"), "<invalid target URL>");
});

test("flattens untrusted Markdown fields and issue marker keys", () => {
  assert.equal(safeMarkdownText("alert\n|[injection]"), "alert  [injection]");
  assert.equal(safeTargetKey("dev target -->\n@here"), "devtarget-here");
});
