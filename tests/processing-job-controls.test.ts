import assert from "node:assert/strict";
import { test } from "node:test";
import { processingJobPresentation, requestJobRetry } from "../lib/processingJobPresentation";

for (const [errorMessage, status, retryable] of [
  ["Stopped by user", "stopped", true],
  ["cancelled: transcription failed", "cancelled", false],
  ["superseded: explicit retry", "superseded", false],
] as const) {
  test(`${status} is not presented as successful completion`, () => {
    assert.deepEqual(processingJobPresentation({ status: "failed", errorMessage }), { status, retryable, inactive: true, completed: false });
    assert.equal(processingJobPresentation({ status: "completed", errorMessage }).completed, false);
  });
}
test("ordinary failure remains retryable and success remains completed", () => {
  assert.equal(processingJobPresentation({ status: "failed", errorMessage: "provider error" }).retryable, true);
  assert.equal(processingJobPresentation({ status: "completed", errorMessage: null }).completed, true);
});
test("retry sends one POST to the encoded job ID and confirms real admission", async () => {
  const requests: unknown[] = [];
  const send = (async (url, init) => {
    requests.push([url, init]);
    return Response.json({ ok: true, demo: false, job: { id: "fresh" } });
  }) as typeof fetch;
  assert.deepEqual(await requestJobRetry("a/b", send), { demo: false });
  assert.deepEqual(requests, [["/api/processing-jobs/a%2Fb/retry", { method: "POST", cache: "no-store" }]]);
});
test("demo acknowledgement is not real admission", async () => {
  assert.deepEqual(await requestJobRetry("demo", (async () => Response.json({ ok: true, demo: true })) as typeof fetch), { demo: true });
});
for (const status of [404, 409, 500]) {
  test(`retry surfaces HTTP ${status} without claiming success`, async () => {
    await assert.rejects(requestJobRetry("job", (async () => Response.json({ error: "internal detail" }, { status })) as typeof fetch), (e: unknown) => e instanceof Error && !e.message.includes("internal detail"));
  });
}
test("malformed success and failed connections never confirm retry", async () => {
  for (const body of [{}, { ok: true }, { ok: true, demo: false }]) {
    await assert.rejects(requestJobRetry("job", (async () => Response.json(body)) as typeof fetch), /not confirmed/);
  }
  await assert.rejects(requestJobRetry("job", (async () => { throw new Error("offline"); }) as typeof fetch), /offline/);
});
