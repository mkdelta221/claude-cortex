import { pipeline, env } from '@xenova/transformers';

// Configure for local-only operation
env.allowRemoteModels = true;
env.allowLocalModels = true;

/**
 * Type for the embedding pipeline function returned by transformers.js
 * The pipeline extracts feature embeddings from text
 */
interface EmbeddingOutput {
  data: ArrayLike<number>;
}

type EmbeddingPipeline = (
  text: string,
  options: { pooling: string; normalize: boolean }
) => Promise<EmbeddingOutput>;

let embeddingPipeline: EmbeddingPipeline | null = null;
let isLoading = false;
let loadPromise: Promise<EmbeddingPipeline> | null = null;

/**
 * Lazy-load the embedding model
 * Model: all-MiniLM-L6-v2 (22MB, 384 dimensions)
 */
async function getEmbeddingPipeline(): Promise<EmbeddingPipeline> {
  if (embeddingPipeline) return embeddingPipeline;

  if (isLoading && loadPromise) {
    return loadPromise;
  }

  isLoading = true;
  // Cast the pipeline to our typed interface
  loadPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2') as Promise<EmbeddingPipeline>;

  try {
    embeddingPipeline = await loadPromise;
    return embeddingPipeline;
  } finally {
    isLoading = false;
    loadPromise = null;
  }
}

/**
 * Generate embedding vector for text
 * @param text - Text to embed (title + content recommended)
 * @returns Float32Array of 384 dimensions
 */
export async function generateEmbedding(text: string): Promise<Float32Array> {
  const extractor = await getEmbeddingPipeline();

  // Truncate to ~512 tokens worth (~2000 chars) for model limits
  const truncated = text.slice(0, 2000);

  const output = await extractor(truncated, {
    pooling: 'mean',
    normalize: true,
  });

  return new Float32Array(output.data);
}

/**
 * Calculate cosine similarity between two embeddings
 * @returns Similarity score 0-1 (1 = identical)
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Embedding dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * Check if embedding model is loaded
 */
export function isModelLoaded(): boolean {
  return embeddingPipeline !== null;
}

/**
 * Preload the model (call during startup if desired)
 */
export async function preloadModel(): Promise<void> {
  await getEmbeddingPipeline();
}
