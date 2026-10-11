import assert from "node:assert/strict";
import { test } from "node:test";
import { startQueuePolling } from "../lib/queuePolling";

function timers() {
  let id = 0;
  const callbacks = new Map<number, { callback: () => void; delay: number }>();
  return {
    schedule(callback: () => void, delay: number) { callbacks.set(++id, { callback, delay }); return id as unknown as ReturnType<typeof setTimeout>; },
    cancel(timer: ReturnType<typeof setTimeout>) { callbacks.delete(timer as unknown as number); },
    run(delay: number) { const found = [...callbacks].find(([, value]) => value.delay === delay); assert.ok(found); callbacks.delete(found[0]); found[1].callback(); },
    count(delay: number) { return [...callbacks.values()].filter((v) => v.delay === delay).length; },
  };
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test("poll failure preserves last snapshot and subsequent success recovers", async () => {
  const time = timers();
  let snapshot = 1; let failed = false; let calls = 0;
  const stop = startQueuePolling({ ...time,
    read: async () => { if (++calls === 1) throw new Error("offline"); return 2; },
    success: (value) => { snapshot = value; failed = false; }, failure: () => { failed = true; },
  });
  await flush(); assert.equal(snapshot, 1); assert.equal(failed, true);
  time.run(4000); await flush(); assert.equal(snapshot, 2); assert.equal(failed, false); stop();
});
test("slow requests never overlap and disposal suppresses late success", async () => {
  const time = timers(); let resolve!: (value: number) => void; let writes = 0; let signal!: AbortSignal;
  const stop = startQueuePolling({ ...time, read: (s) => { signal = s; return new Promise<number>((r) => { resolve = r; }); }, success: () => writes++, failure: () => writes++ });
  assert.equal(time.count(4000), 0);
  stop(); assert.equal(signal.aborted, true); resolve(5); await flush();
  assert.equal(writes, 0); assert.equal(time.count(4000), 0); assert.equal(time.count(15000), 0);
});
test("deadline abort reports stale state and schedules recovery", async () => {
  const time = timers(); let failures = 0;
  const stop = startQueuePolling({ ...time, read: (signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("timeout")))), success: () => assert.fail(), failure: () => failures++ });
  time.run(15000); await flush(); assert.equal(failures, 1); assert.equal(time.count(4000), 1); stop();
});
test("hidden tabs pause reads and resume on the next visible tick", async () => {
  const time = timers(); let visible = false; let calls = 0;
  const stop = startQueuePolling({ ...time, visible: () => visible, read: async () => ++calls, success: () => {}, failure: () => assert.fail() });
  assert.equal(calls, 0); visible = true; time.run(4000); await flush(); assert.equal(calls, 1); stop();
});
test("disposal suppresses late failure", async () => {
  const time = timers(); let reject!: (error: Error) => void;
  const stop = startQueuePolling({ ...time, read: () => new Promise((_, r) => { reject = r; }), success: () => assert.fail(), failure: () => assert.fail() });
  stop(); reject(new Error("offline")); await flush(); assert.equal(time.count(4000), 0);
});
