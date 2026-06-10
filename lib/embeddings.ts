/**
 * Embedding service.
 *
 * Default model: text-embedding-3-small (1536 dims) — matches the pgvector
 * column declared in prisma/schema.prisma.
 *
 * Embedding writes use raw SQL since Prisma can't generate types for the
 * Unsupported() vector column.
 */
import OpenAI from "openai";

const EMBED_MODEL = "text-embedding-3-small";
export const EMBED_DIMS = 1536;

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set.");
  }
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const c = getClient();
  const resp = await c.embeddings.create({
    model: EMBED_MODEL,
    input: text,
  });
  return resp.data[0]?.embedding ?? [];
}

/** Batch helper — OpenAI accepts up to 2048 inputs per call. */
export async function generateEmbeddings(
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const c = getClient();
  const resp = await c.embeddings.create({
    model: EMBED_MODEL,
    input: texts,
  });
  return resp.data.map((d) => d.embedding);
}

/**
 * Walk all segments for an episode that don't have an embedding yet, batch
 * them, and persist via raw SQL into the pgvector column.
 */
export async function generateSegmentEmbeddings(
  episodeId: string,
  batchSize = 64,
): Promise<{ embedded: number }> {
  const { getDb } = await import("./db");
  const db = getDb();

  const segs = await db.transcriptSegment.findMany({
    where: { episodeId },
    select: { id: true, transcriptText: true },
  });

  let embedded = 0;
  for (let i = 0; i < segs.length; i += batchSize) {
    const slice = segs.slice(i, i + batchSize);
    const vectors = await generateEmbeddings(
      slice.map((s) => s.transcriptText),
    );
    for (let j = 0; j < slice.length; j++) {
      await saveSegmentEmbedding(slice[j].id, vectors[j]);
      embedded++;
    }
  }

  await markEpisodeEmbedded(episodeId);
  return { embedded };
}

/**
 * Save a single embedding vector via raw SQL. Vectors are written as
 * `[v1,v2,...]::vector` literals — this is the canonical pgvector format.
 */
export async function saveSegmentEmbedding(
  segmentId: string,
  embedding: number[],
): Promise<void> {
  const { getDb } = await import("./db");
  const db = getDb();
  if (embedding.length === 0) return;
  const vectorLiteral = `[${embedding.join(",")}]`;
  await db.$executeRawUnsafe(
    `UPDATE transcript_segments SET transcript_embedding = $1::vector WHERE id = $2`,
    vectorLiteral,
    segmentId,
  );
}

export async function markEpisodeEmbedded(episodeId: string): Promise<void> {
  const { getDb } = await import("./db");
  const db = getDb();
  await db.episode.update({
    where: { id: episodeId },
    data: {
      isEmbedded: true,
      embeddingStatus: "completed",
    },
  });
}
