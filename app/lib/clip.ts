// Browser-side CLIP text encoding using Transformers.js (ONNX/WASM)
// Lazily loaded via dynamic import to avoid Next.js webpack issues with ONNX binaries.

export type ProgressCallback = (progress: number) => void;

let tokenizer: any = null;
let textModel: any = null;
let loadingPromise: Promise<void> | null = null;

async function ensureLoaded(modelName: string, onProgress?: ProgressCallback): Promise<void> {
  if (tokenizer && textModel) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const { AutoTokenizer, CLIPTextModelWithProjection } = await import("@huggingface/transformers");
    const onnxModel = modelName.replace("openai/", "Xenova/");

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
