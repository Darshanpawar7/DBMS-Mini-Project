import path from "node:path";
import { env } from "./env";

// Local sentence-embedding model (no API key, no data leaves the machine).
// all-MiniLM-L6-v2: 384 dimensions, mean pooling, L2-normalised, so cosine
// similarity = dot product. The model (~23 MB) downloads once into .cache/.
export const EMBEDDING_DIMENSIONS = 384;
const BATCH_SIZE = 16;
const QUERY_CACHE_LIMIT = 200;

type Extractor = (texts: string[], options: { pooling: "mean"; normalize: boolean }) => Promise<{ tolist(): number[][] }>;

const globalForModel = globalThis as unknown as { scholarmeshExtractor?: Promise<Extractor> };
const queryCache = new Map<string, number[]>();

async function extractor(): Promise<Extractor> {
  if (!globalForModel.scholarmeshExtractor) {
    globalForModel.scholarmeshExtractor = (async () => {
      const transformers = await import("@huggingface/transformers");
      transformers.env.cacheDir = path.join(process.cwd(), ".cache", "models");
      const pipe = await transformers.pipeline("feature-extraction", env().EMBEDDING_MODEL, { dtype: "q8" });
      return pipe as unknown as Extractor;
    })();
    // a failed load must not be cached forever
    globalForModel.scholarmeshExtractor.catch(() => {
      globalForModel.scholarmeshExtractor = undefined;
    });
  }
  return globalForModel.scholarmeshExtractor;
}

/** Embed passages in batches. Returns one 384-d unit vector per input. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const model = await extractor();
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const output = await model(batch, { pooling: "mean", normalize: true });
    vectors.push(...output.tolist());
  }
  return vectors;
}

/** Embed a search query, with a small in-memory cache for repeated queries. */
export async function embedQuery(text: string): Promise<number[]> {
  const key = text.trim().toLowerCase();
  const hit = queryCache.get(key);
  if (hit) return hit;
  const [vector] = await embedTexts([key]);
  if (queryCache.size >= QUERY_CACHE_LIMIT) {
    const oldest = queryCache.keys().next().value;
    if (oldest !== undefined) queryCache.delete(oldest);
  }
  queryCache.set(key, vector);
  return vector;
}
