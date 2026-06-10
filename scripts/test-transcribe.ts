import { getDb } from "../lib/db";
import { transcribeAudio } from "../lib/transcription";

async function main() {
  getDb();
  const path =
    process.argv[2] ??
    "./storage/audio/cmq4jdo39001711ysp7muvlvl.mp3";
  console.log("Transcribing:", path);
  const t0 = Date.now();
  const result = await transcribeAudio(path);
  console.log(
    `Done in ${Math.round((Date.now() - t0) / 1000)}s — ${result.segments.length} segments, ${result.fullText.length} chars`,
  );
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
