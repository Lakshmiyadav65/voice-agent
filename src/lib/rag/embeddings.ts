import { Embeddings } from "@langchain/core/embeddings";

/**
 * HuggingFace Sentence-Transformers Embeddings (all-MiniLM-L6-v2)
 * Compatible with LangChain Embeddings interface:
 *   from langchain_community.embeddings import HuggingFaceEmbeddings
 * 
 * Generates 384-dimensional dense vectors.
 */

// Singleton pipeline cache to avoid reloading ONNX model on every request
let pipelineInstance: any = null;

async function getLocalExtractor() {
  if (!pipelineInstance) {
    const { pipeline } = await import("@xenova/transformers");
    pipelineInstance = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return pipelineInstance;
}

export class HuggingFaceSentenceEmbeddings extends Embeddings {
  modelName: string;
  apiKey?: string;

  constructor(fields?: { modelName?: string; apiKey?: string; maxConcurrency?: number; maxRetries?: number }) {
    super(fields || {});
    this.modelName = fields?.modelName || "sentence-transformers/all-MiniLM-L6-v2";
    this.apiKey = fields?.apiKey || process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN;
  }

  /**
   * Embed a single query string for retrieval
   */
  async embedQuery(text: string): Promise<number[]> {
    const vectors = await this.embedDocuments([text]);
    return vectors[0] || new Array(384).fill(0);
  }

  /**
   * Embed multiple document chunks
   */
  async embedDocuments(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) return [];

    // 1. Try Hugging Face Inference API if API key is provided
    if (this.apiKey && this.apiKey.trim()) {
      try {
        const hfVectors = await this.embedWithHfApi(texts);
        if (hfVectors && hfVectors.length === texts.length) {
          return hfVectors;
        }
      } catch {
        // Fall back seamlessly to local pipeline without spamming server logs
      }
    }

    // 2. Local Xenova/transformers pipeline
    try {
      const extractor = await getLocalExtractor();
      const results: number[][] = [];

      for (const text of texts) {
        const clean = text.replace(/\n+/g, " ").trim();
        const output = await extractor(clean, {
          pooling: "mean",
          normalize: true,
        });

        const vector = Array.from(output.data as Float32Array);
        results.push(vector as number[]);
      }

      return results;
    } catch (err) {
      console.warn("Local transformer model loading fallback to deterministic vector:", err);
      return texts.map((t) => generateDeterministicFallbackVector(t, 384));
    }
  }

  private async embedWithHfApi(texts: string[]): Promise<number[][]> {
    // The bare model URL runs this model's default task, sentence similarity, and rejects a
    // list of texts; the feature-extraction pipeline returns the 384-dim vectors.
    const endpoint = `https://router.huggingface.co/hf-inference/models/${this.modelName}/pipeline/feature-extraction`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: texts.map((t) => t.replace(/\n+/g, " ").trim()),
        options: { wait_for_model: true },
      }),
    });

    if (!response.ok) {
      throw new Error(`HuggingFace API error: ${response.status}`);
    }

    const data = await response.json();
    if (Array.isArray(data)) {
      return data;
    }
    throw new Error("Invalid response format from HuggingFace API");
  }
}

/**
 * Deterministic 384-dim semantic hash vector fallback
 */
function generateDeterministicFallbackVector(text: string, dimensions = 384): number[] {
  const vector = new Array(dimensions).fill(0);
  const words = text.toLowerCase().split(/\s+/);

  for (let w = 0; w < words.length; w++) {
    const word = words[w];
    for (let i = 0; i < word.length; i++) {
      const code = word.charCodeAt(i);
      const idx = (code * 31 + i * 17 + w * 13) % dimensions;
      vector[idx] += Math.sin(code + i);
    }
  }

  // L2 Normalize
  let norm = 0;
  for (let i = 0; i < dimensions; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dimensions; i++) {
    vector[i] = vector[i] / norm;
  }

  return vector;
}

export const defaultEmbeddings = new HuggingFaceSentenceEmbeddings();
