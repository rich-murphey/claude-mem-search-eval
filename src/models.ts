// Embedding models under evaluation. Entries mirror claude-mem's
// src/services/vector/models.ts, plus what claude-mem's embedder does not yet
// carry: each model's token limit and its query/passage prefixes.
export interface EvalModel {
  key: string;
  repo: string;
  dtype: 'fp32';
  /** mean: average over tokens; cls: the first token's vector. */
  pooling: 'mean' | 'cls';
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
  {
    // IBM's ibm-granite/granite-embedding-97m-multilingual-r2 (ModernBERT,
    // Apache-2.0); its sentence-transformers config pools the [CLS] token and
    // sets no prompts; 8192 tokens.
    key: 'granite-97m-r2',
    repo: 'onnx-community/granite-embedding-97m-multilingual-r2-ONNX',
    dtype: 'fp32', pooling: 'cls', dims: 384, maxTokens: 8192,
    queryPrefix: '', passagePrefix: '',
  },
  {
    // The same model cut at 512 tokens, as claude-mem's models.ts carries it:
    // at 8192 one text takes about 10 s and 8 GB on a CPU.
    key: 'granite-97m-r2-512',
    repo: 'onnx-community/granite-embedding-97m-multilingual-r2-ONNX',
    dtype: 'fp32', pooling: 'cls', dims: 384, maxTokens: 512,
    queryPrefix: '', passagePrefix: '',
  },
  {
    // BAAI/bge-small-en-v1.5 (MIT, English); Xenova's export of it carries
    // the fp32 onnx/model.onnx. Its sentence-transformers config pools the
    // [CLS] token (1_Pooling/config.json), normalises (2_Normalize) and sets
    // max_seq_length 512. The model card's instruction for short-query
    // retrieval goes on queries; passages get none.
    key: 'bge-small-en',
    repo: 'Xenova/bge-small-en-v1.5',
    dtype: 'fp32', pooling: 'cls', dims: 384, maxTokens: 512,
    queryPrefix: 'Represent this sentence for searching relevant passages: ', passagePrefix: '',
  },
];

export function modelByKey(key: string): EvalModel {
  const model = MODELS.find(m => m.key === key);
  if (!model) throw new Error(`unknown model ${key}; known: ${MODELS.map(m => m.key).join(', ')}`);
  return model;
}
