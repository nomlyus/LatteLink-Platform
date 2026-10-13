import assert from "node:assert/strict";
import test from "node:test";
import {
  createBuildRequest,
  deployHerokuSourceBuild,
  waitForBuild,
} from "./deploy-heroku-source-build.mjs";

const sourceSha = "8aaced688916f63d0ff8cd2c093396959728fe13";

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("build request binds an uploaded archive to the exact source SHA", () => {
  const request = createBuildRequest(
    sourceSha,
    Buffer.from("archive"),
    "https://source.example/archive",
  );
  assert.equal(request.source_blob.version, sourceSha);
  assert.equal(
    request.source_blob.version_description,
    `Deploy ${sourceSha.slice(0, 8)}`,
  );
  assert.match(request.source_blob.checksum, /^SHA256:[0-9a-f]{64}$/);
  assert.equal(request.source_blob.url, "https://source.example/archive");
  assert.throws(
    () => createBuildRequest("not-a-sha", Buffer.from("archive")),
    /SHA is invalid/,
  );
  assert.throws(
    () =>
      createBuildRequest(
        sourceSha,
        Buffer.from("archive"),
        "http://insecure.example",
      ),
    /must use HTTPS/,
  );
});

test("same-source build uploads an archive and waits for its release-producing build", async () => {
  const calls = [];
  const originalInfo = console.info;
  const logs = [];
  console.info = (...values) => logs.push(values.join(" "));
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "https://api.heroku.com/sources") {
      return jsonResponse(
        {
          source_blob: {
            put_url: "https://upload.example/signed",
            get_url: "https://download.example/signed",
          },
        },
        201,
      );
    }
    if (url === "https://upload.example/signed")
      return { ok: true, status: 200 };
    if (url === "https://api.heroku.com/apps/nomly-api-dev/builds") {
      const request = JSON.parse(options.body);
      assert.equal(request.source_blob.version, sourceSha);
      assert.equal(request.source_blob.url, "https://download.example/signed");
      return jsonResponse(
        { id: "build-1", source_blob: { version: sourceSha } },
        201,
      );
    }
    if (url.endsWith("/builds/build-1")) {
      return jsonResponse({
        id: "build-1",
        status: "succeeded",
        source_blob: { version: sourceSha },
        release: { id: "release-1" },
      });
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  try {
    const result = await deployHerokuSourceBuild(
      {
        HEROKU_APP_NAME: "nomly-api-dev",
        HEROKU_API_KEY: "do-not-log",
        DEPLOY_SHA: sourceSha,
      },
      {
        fetch: fetchImpl,
        archive: () => Buffer.from("test archive"),
        sleep: async () => {},
      },
    );
    assert.deepEqual(result, {
      buildId: "build-1",
      releaseId: "release-1",
      sourceSha,
    });
  } finally {
    console.info = originalInfo;
  }

  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[1].options.method, "PUT");
  assert.equal(calls[1].options.body.toString(), "test archive");
  assert.equal(logs.join(" ").includes("do-not-log"), false);
  assert.equal(logs.join(" ").includes("signed"), false);
});

test("build polling refuses a different source SHA and a failed build", async () => {
  await assert.rejects(
    waitForBuild({
      appName: "nomly-api-dev",
      apiKey: "secret",
      buildId: "build-1",
      sourceSha,
      fetchImpl: async () =>
        jsonResponse({
          status: "succeeded",
          source_blob: { version: "0".repeat(40) },
        }),
      sleep: async () => {},
      now: () => 0,
      timeoutMs: 0,
    }),
    /source version does not match/,
  );
  await assert.rejects(
    waitForBuild({
      appName: "nomly-api-dev",
      apiKey: "secret",
      buildId: "build-1",
      sourceSha,
      fetchImpl: async () =>
        jsonResponse({
          id: "build-1",
          status: "failed",
          source_blob: { version: sourceSha },
        }),
      sleep: async () => {},
      now: () => 0,
      timeoutMs: 0,
    }),
    /source build failed/,
  );
});

test("source upload rejects non-HTTPS signed endpoints without exposing URLs", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    jsonResponse(
      {
        source_blob: {
          put_url: "http://bad.example/private-token",
          get_url: "https://safe.example/archive",
        },
      },
      201,
    );
  try {
    await assert.rejects(
      deployHerokuSourceBuild(
        {
          HEROKU_APP_NAME: "nomly-api-dev",
          HEROKU_API_KEY: "secret",
          DEPLOY_SHA: sourceSha,
        },
        { archive: () => Buffer.from("archive") },
      ),
      (error) => {
        assert.match(error.message, /must use HTTPS/);
        assert.equal(error.message.includes("private-token"), false);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
