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
  const { vectors } = await generateEmbeddingsWithUsage(texts);
  return vectors;
}

/**
 * Batch embed and report the real token usage billed by OpenAI
 * (`response.usage.total_tokens`) so the Usage page reflects actual spend
 * rather than a character-count estimate.
 */
export async function generateEmbeddingsWithUsage(
  texts: string[],
): Promise<{ vectors: number[][]; tokens: number }> {
  if (texts.length === 0) return { vectors: [], tokens: 0 };
  const c = getClient();
  const resp = await c.embeddings.create({
    model: EMBED_MODEL,
    input: texts,
  });
  return {
    vectors: resp.data.map((d) => d.embedding),
    tokens: resp.usage?.total_tokens ?? 0,
  };
}

/**
 * Walk all segments for an episode that don't have an embedding yet, batch
 * them, and persist via raw SQL into the pgvector column.
 */
export async function generateSegmentEmbeddings(
  episodeId: string,
  batchSize = 64,
): Promise<{ embedded: number; tokens: number }> {
  const { getDb } = await import("./db");
  const db = getDb();

  const segs = await db.transcriptSegment.findMany({
    where: { episodeId },
    select: { id: true, transcriptText: true },
  });

  let embedded = 0;
  let totalTokens = 0;
  for (let i = 0; i < segs.length; i += batchSize) {
    const slice = segs.slice(i, i + batchSize);
    const { vectors, tokens } = await generateEmbeddingsWithUsage(
      slice.map((s) => s.transcriptText),
    );
    totalTokens += tokens;
    for (let j = 0; j < slice.length; j++) {
      await saveSegmentEmbedding(slice[j].id, vectors[j]);
      embedded++;
    }
  }

  await markEpisodeEmbedded(episodeId, totalTokens);
  return { embedded, tokens: totalTokens };
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

export async function markEpisodeEmbedded(
  episodeId: string,
  tokens = 0,
): Promise<void> {
  const { getDb } = await import("./db");
  const db = getDb();
  await db.episode.update({
    where: { id: episodeId },
    data: {
      isEmbedded: true,
      embeddingStatus: "completed",
      ...(tokens > 0 ? { embeddingTokens: tokens } : {}),
    },
  });
}
