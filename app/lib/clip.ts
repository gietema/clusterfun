// Browser-side CLIP text encoding using Transformers.js (ONNX/WASM)
// Lazily loaded via dynamic import to avoid Next.js webpack issues with ONNX binaries.
//
// Only works with models that have ONNX text encoder exports on HuggingFace
// (currently: OpenAI CLIP models via the Xenova/ mirror).

export type ProgressCallback = (progress: number) => void;

/** Models that support browser-side text search (have ONNX text encoders). */
const TEXT_SEARCH_MODELS: Record<string, string> = {
  "openai/clip-vit-base-patch32": "Xenova/clip-vit-base-patch32",
  "openai/clip-vit-base-patch16": "Xenova/clip-vit-base-patch16",
  "openai/clip-vit-large-patch14": "Xenova/clip-vit-large-patch14",
};

/** Check if a model supports text search in the browser. */
export function supportsTextSearch(modelName: string | undefined): boolean {
  return !!modelName && modelName in TEXT_SEARCH_MODELS;
}

let tokenizer: any = null;
let textModel: any = null;
let loadingPromise: Promise<void> | null = null;

async function ensureLoaded(modelName: string, onProgress?: ProgressCallback): Promise<void> {
  if (tokenizer && textModel) return;
  if (loadingPromise) return loadingPromise;

  const onnxModel = TEXT_SEARCH_MODELS[modelName];
  if (!onnxModel) {
    throw new Error(`Text search not available for ${modelName}. Use a CLIP model for text search.`);
  }

  loadingPromise = (async () => {
    const { AutoTokenizer, CLIPTextModelWithProjection } = await import("@huggingface/transformers");

    const progress_callback = onProgress
      ? (event: { status: string; progress?: number }) => {
          if (event.status === "progress" && typeof event.progress === "number") {
            onProgress(event.progress);
          }
        }
      : undefined;

    tokenizer = await AutoTokenizer.from_pretrained(onnxModel, { progress_callback });
    textModel = await CLIPTextModelWithProjection.from_pretrained(onnxModel, { progress_callback });
  })();

  return loadingPromise;
}

export async function encodeText(
  modelName: string,
  text: string,
  onProgress?: ProgressCallback,
): Promise<number[]> {
  await ensureLoaded(modelName, onProgress);
  const inputs = tokenizer(text, { padding: true, truncation: true });
  const output = await textModel(inputs);
  const embeds = output.text_embeds;
  const data: Float32Array = embeds.data as Float32Array;
  const norm = Math.sqrt(data.reduce((sum: number, v: number) => sum + v * v, 0));
  return Array.from(data, (v: number) => v / norm);
}
