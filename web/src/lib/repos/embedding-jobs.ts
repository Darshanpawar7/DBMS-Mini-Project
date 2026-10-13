import { query, toVectorLiteral, withTransaction } from "@/lib/db";
import { embedTexts } from "@/lib/embeddings";

// The "embedding worker": fills DOC_CHUNK.embedding for chunks created by the
// re-chunk trigger, then flips DOCUMENT.embedding_status to 'ready'.

export async function embedDocument(docId: number): Promise<number> {
  const chunks = await query<{ chunk_id: number; chunk_text: string }>(
    "SELECT chunk_id, chunk_text FROM DOC_CHUNK WHERE doc_id = $1 AND embedding IS NULL ORDER BY chunk_index",
    [docId],
  );
  const vectors = chunks.length > 0 ? await embedTexts(chunks.map((c) => c.chunk_text)) : [];

  await withTransaction(async (client) => {
    if (chunks.length > 0) {
      // one set-based UPDATE for all chunks (unnest pairs ids with vectors)
      await client.query(
        `UPDATE DOC_CHUNK c
         SET embedding = v.emb::vector, embedded_at = CURRENT_TIMESTAMP
         FROM unnest($1::INT[], $2::TEXT[]) AS v(id, emb)
         WHERE c.chunk_id = v.id`,
        [chunks.map((c) => c.chunk_id), vectors.map(toVectorLiteral)],
      );
    }
    await client.query(
      `UPDATE DOCUMENT SET embedding_status = 'ready'
       WHERE doc_id = $1
         AND NOT EXISTS (SELECT 1 FROM DOC_CHUNK WHERE doc_id = $1 AND embedding IS NULL)`,
      [docId],
    );
  });
  return chunks.length;
}

export async function markEmbeddingFailed(docId: number): Promise<void> {
  await query("UPDATE DOCUMENT SET embedding_status = 'failed' WHERE doc_id = $1", [docId]);
}

export interface EmbeddingRunSummary {
  documents: number;
  chunks: number;
  failed: number;
  searches: number;
}

/** Process every document that is not 'ready' (served by the partial index idx_document_embedding_todo). */
export async function processPendingEmbeddings(limit = 100): Promise<EmbeddingRunSummary> {
  const pending = await query<{ doc_id: number }>(
    "SELECT doc_id FROM DOCUMENT WHERE embedding_status <> 'ready' ORDER BY doc_id LIMIT $1",
    [limit],
  );
  const summary: EmbeddingRunSummary = { documents: 0, chunks: 0, failed: 0, searches: 0 };
  for (const { doc_id } of pending) {
    try {
      summary.chunks += await embedDocument(doc_id);
      summary.documents += 1;
    } catch (error) {
      console.error(`[embeddings] document ${doc_id} failed`, error);
      await markEmbeddingFailed(doc_id);
      summary.failed += 1;
    }
  }
  summary.searches = await embedPendingSearches();
  return summary;
}

/** Search queries logged without a vector (e.g. seed data) get one, for the interest profiles. */
export async function embedPendingSearches(limit = 500): Promise<number> {
  const logs = await query<{ log_id: number; query_text: string }>(
    "SELECT log_id, query_text FROM SEARCH_LOG WHERE query_embedding IS NULL ORDER BY log_id LIMIT $1",
    [limit],
  );
  if (logs.length === 0) return 0;
  const vectors = await embedTexts(logs.map((l) => l.query_text.toLowerCase()));
  await query(
    `UPDATE SEARCH_LOG l SET query_embedding = v.emb::vector
     FROM unnest($1::INT[], $2::TEXT[]) AS v(id, emb)
     WHERE l.log_id = v.id`,
    [logs.map((l) => l.log_id), vectors.map(toVectorLiteral)],
  );
  return logs.length;
}
