import assert from "node:assert/strict";
import { test } from "node:test";
import { loadDownloadSnapshot } from "../lib/downloadSnapshot";
import type { DownloadView, EpisodeView, SourceView } from "../lib/data";
const downloads = [{ id: "old-download", episodeId: "older-episode" }, { id: "retry", episodeId: "older-episode" }] as DownloadView[];
const episodes = [{ id: "older-episode", isSearchable: true }] as EpisodeView[];
const sources = [{ id: "source" }] as SourceView[];
const readers = () => ({ downloads: async () => downloads, sources: async () => sources, episodes: async (_ids: string[]) => episodes });

test("download snapshot retrieves referenced episodes including older catalog entries", async () => {
  const read = readers(); let requested: string[] = [];
  read.episodes = async (ids) => { requested = ids; return episodes; };
  const snapshot = await loadDownloadSnapshot(read, false);
  assert.deepEqual(requested, ["older-episode"]);
  assert.deepEqual(snapshot, { downloads, episodes, sources, demo: false });
});
for (const stage of ["downloads", "sources", "episodes"] as const) {
  test(`${stage} read failure is explicitly unavailable, never a successful empty snapshot`, async () => {
    const read = readers(); read[stage] = async () => { throw new Error("private connection detail"); };
    const snapshot = await loadDownloadSnapshot(read, false);
    assert.equal(snapshot.error, "Download Manager is temporarily unavailable.");
    assert.equal(JSON.stringify(snapshot).includes("private connection detail"), false);
    assert.deepEqual(snapshot.downloads, []);
  });
}
test("a successful empty archive is distinct from unavailable data", async () => {
  const snapshot = await loadDownloadSnapshot({ downloads: async () => [], sources: async () => [], episodes: async () => { assert.fail("No episode read is needed"); } }, false);
  assert.equal(snapshot.error, undefined); assert.deepEqual(snapshot.episodes, []);
});
test("demo snapshots stay explicitly labelled", async () => {
  assert.equal((await loadDownloadSnapshot(readers(), true)).demo, true);
});
