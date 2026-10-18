// Embedding models under evaluation. Entries mirror claude-mem's
// src/services/vector/models.ts, plus what claude-mem's embedder does not yet
// carry: each model's token limit and its query/passage prefixes.
export interface EvalModel {
  key: string;
  repo: string;
  dtype: 'fp32';
  pooling: 'mean';
  dims: number;
  /** Tokens per input, [CLS]/[SEP] included; the length the model was trained at. */
  maxTokens: number;
  queryPrefix: string;
  passagePrefix: string;
}

export const MODELS: EvalModel[] = [
  {
    // claude-mem's default and Chroma's; sentence-transformers max_seq_length 256.
    key: 'minilm-l6',
    repo: 'Xenova/all-MiniLM-L6-v2',
    dtype: 'fp32', pooling: 'mean', dims: 384, maxTokens: 256,
    queryPrefix: '', passagePrefix: '',
  },
  {
    // The multilingual model measured in thedotmack/claude-mem#3422;
    // sentence-transformers max_seq_length 128.
    key: 'multilingual-minilm-l12',
    repo: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
    dtype: 'fp32', pooling: 'mean', dims: 384, maxTokens: 128,
    queryPrefix: '', passagePrefix: '',
  },
  {
    // Trained with "query: " / "passage: " prefixes, which its model card
    // says to keep; 512 tokens.
    key: 'multilingual-e5-small',
    repo: 'Xenova/multilingual-e5-small',
    dtype: 'fp32', pooling: 'mean', dims: 384, maxTokens: 512,
    queryPrefix: 'query: ', passagePrefix: 'passage: ',
  },
];

export function modelByKey(key: string): EvalModel {
  const model = MODELS.find(m => m.key === key);
  if (!model) throw new Error(`unknown model ${key}; known: ${MODELS.map(m => m.key).join(', ')}`);
  return model;
}
