// The tokenizer and model are called directly rather than through
// transformers.js's feature-extraction pipeline, for two reasons measured
// against Chroma's vectors (thedotmack/claude-mem#3694): the pipeline
// truncates at the tokenizer's model_max_length (512) rather than the length
// the model was trained at, and transformers.js 4.3.1 drops the closing
// [SEP]/</s> of a truncated input (huggingface/tokenizers.js#41), which is
// restored here.
import { AutoModel, AutoTokenizer } from '@huggingface/transformers';
import type { EvalModel } from './models.ts';

export async function loadEncoder(model: EvalModel, threads?: number) {
  const tokenizer = await AutoTokenizer.from_pretrained(model.repo);
  const encoder = await AutoModel.from_pretrained(model.repo, {
    dtype: model.dtype,
    ...(threads ? { session_options: { intraOpNumThreads: threads, interOpNumThreads: 1 } } : {}),
  });
  const sep = BigInt(tokenizer.sep_token_id);

  return async function encode(texts: string[]): Promise<Float32Array[]> {
    const inputs = tokenizer(texts, { padding: true, truncation: true, max_length: model.maxTokens });
    const [rows, width] = inputs.input_ids.dims as number[];
    const ids = inputs.input_ids.data as BigInt64Array;
    const mask = inputs.attention_mask.data as BigInt64Array;
    for (let r = 0; r < rows; r++) {
      const last = r * width + model.maxTokens - 1;
      if (width === model.maxTokens && mask[last] === 1n && ids[last] !== sep) ids[last] = sep;
    }
    const { last_hidden_state: hidden } = await encoder(inputs);
    const dims = hidden.dims[2] as number;
    if (dims !== model.dims) throw new Error(`${model.repo} produced ${dims} dimensions, expected ${model.dims}`);
    const h = hidden.data as Float32Array;
    return texts.map((_, r) => {
      const v = new Float32Array(dims);
      if (model.pooling === 'cls') {
        v.set(h.subarray(r * width * dims, r * width * dims + dims));
        const norm = Math.hypot(...v);
        for (let d = 0; d < dims; d++) v[d] /= norm;
        return v;
      }
      let n = 0;
      for (let t = 0; t < width; t++) {
        if (mask[r * width + t] !== 1n) continue;
        n++;
        const base = (r * width + t) * dims;
        for (let d = 0; d < dims; d++) v[d] += h[base + d];
      }
      let norm = 0;
      for (let d = 0; d < dims; d++) { v[d] /= n; norm += v[d] * v[d]; }
      norm = Math.sqrt(norm);
      for (let d = 0; d < dims; d++) v[d] /= norm;
      return v;
    });
  };
}
