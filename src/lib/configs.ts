import {HarnessConfig} from './types';

const SHARED_AGENT_POLICIES = {
  systemPrompt:
    'You are a grounded meeting-corpus agent. Answer only from supplied Granola meeting evidence, cite meeting IDs for factual claims, and say when evidence is insufficient.',
  memoryPolicy:
    'Stateless per eval case: no cross-case memory; only the query, harness config, retrieved contexts, and expected rubric enter the run.',
  sandboxPolicy:
    'Local TypeScript CLI sandbox over checked-in evals plus private local data; no filesystem writes except reports/public results artifacts.',
  approvalPolicy:
    'Offline harnesses require no external approvals; OpenAI semantic harness runs only when API credentials and network access are explicitly configured.',
  loggingPolicy:
    'Structured trace steps record interpretation, retrieval, generation, grading, latency, token estimates, costs, and tool success for every case.',
};

const extractiveAnswerTool =
  'generate_grounded_answer(contexts, prompt_policy): synthesize only from selected evidence, cite meeting IDs, and surface uncertainty.';

export const HARNESS_CONFIGS: HarnessConfig[] = [
  {
    id: 'notes_bm25',
    label: 'Notes BM25',
    description:
      'Searches only Granola titles, lists, attendees, and generated notes. This is cheap and fast, but misses details only present in raw transcript.',
    ...SHARED_AGENT_POLICIES,
    toolDefinitions: [
      'retrieve_notes_bm25(query, topK, contextBudget): lexical search over titles, lists, people, and generated notes.',
      extractiveAnswerTool,
    ],
    promptPolicy: 'Strict extractive answer with meeting-id citations and explicit uncertainty.',
    orchestrationPolicy: 'Single retrieval pass over notes, then deterministic grounded synthesis.',
    contextPolicy: 'Notes-only context, one document per meeting, small context budget.',
    toolPolicy: 'Local BM25 retrieval only; no network or model dependency.',
    source: 'notes',
    retrievalStrategy: 'bm25',
    answerStrategy: 'extractive',
    topK: 8,
    maxDocsPerMeeting: 1,
    transcriptChunkWords: 260,
    transcriptChunkOverlap: 50,
    contextCharBudget: 9000,
    recencyBoost: 0.9,
  },
  {
    id: 'compact_hybrid_bm25',
    label: 'Compact Hybrid BM25',
    description:
      'Searches notes and transcripts but keeps a tight, diversified context window. This tests whether a compact agent loop can stay grounded without flooding the model/context.',
    ...SHARED_AGENT_POLICIES,
    toolDefinitions: [
      'retrieve_hybrid_bm25(query, topK, contextBudget): lexical search over notes plus transcript chunks.',
      'compact_context_pack(contexts): diversify to one chunk per meeting under a tight context budget.',
      extractiveAnswerTool,
    ],
    promptPolicy: 'Strict extractive answer with short evidence snippets and meeting-id citations.',
    orchestrationPolicy: 'Single retrieval pass with aggressive meeting diversification before synthesis.',
    contextPolicy: 'Hybrid notes/transcript context, top 6 results, one chunk per meeting, 7k character budget.',
    toolPolicy: 'Local BM25 retrieval over notes plus transcript chunks.',
    source: 'hybrid',
    retrievalStrategy: 'bm25',
    answerStrategy: 'extractive',
    topK: 6,
    maxDocsPerMeeting: 1,
    transcriptChunkWords: 260,
    transcriptChunkOverlap: 40,
    contextCharBudget: 7000,
    recencyBoost: 0.7,
  },
  {
    id: 'hybrid_transcript_bm25',
    label: 'Hybrid Transcript BM25',
    description:
      'Searches metadata/notes plus overlapping transcript chunks, then packs diversified evidence into the answer context.',
    ...SHARED_AGENT_POLICIES,
    toolDefinitions: [
      'retrieve_hybrid_bm25(query, topK, contextBudget): lexical search over notes plus overlapping transcript chunks.',
      'balanced_context_pack(contexts): keep up to two chunks per meeting within the context budget.',
      extractiveAnswerTool,
    ],
    promptPolicy: 'Strict extractive answer with meeting-id citations and explicit uncertainty.',
    orchestrationPolicy: 'Single retrieval pass over notes and transcript chunks, then deterministic grounded synthesis.',
    contextPolicy: 'Balanced hybrid context, top 12 results, up to two chunks per meeting, 14k character budget.',
    toolPolicy: 'Local BM25 retrieval over notes plus transcript chunks.',
    source: 'hybrid',
    retrievalStrategy: 'bm25',
    answerStrategy: 'extractive',
    topK: 12,
    maxDocsPerMeeting: 2,
    transcriptChunkWords: 320,
    transcriptChunkOverlap: 70,
    contextCharBudget: 14000,
    recencyBoost: 0.7,
  },
  {
    id: 'wide_context_hybrid_bm25',
    label: 'Wide Context Hybrid BM25',
    description:
      'Gives the agent a larger transcript window and allows more chunks per meeting. This tests recall gains against longer context, more tokens, and more citation noise.',
    ...SHARED_AGENT_POLICIES,
    toolDefinitions: [
      'retrieve_hybrid_bm25(query, topK, contextBudget): high-recall lexical search over notes plus transcript chunks.',
      'wide_context_pack(contexts): admit more chunks per meeting and a larger evidence budget.',
      extractiveAnswerTool,
    ],
    promptPolicy: 'Strict extractive answer, but with broader evidence available for multi-meeting synthesis.',
    orchestrationPolicy: 'Single retrieval pass with a high-recall context packer.',
    contextPolicy: 'Wide hybrid context, top 18 results, up to three chunks per meeting, 24k character budget.',
    toolPolicy: 'Local BM25 retrieval over notes plus transcript chunks.',
    source: 'hybrid',
    retrievalStrategy: 'bm25',
    answerStrategy: 'extractive',
    topK: 18,
    maxDocsPerMeeting: 3,
    transcriptChunkWords: 380,
    transcriptChunkOverlap: 90,
    contextCharBudget: 24000,
    recencyBoost: 0.7,
  },
  {
    id: 'recency_weighted_hybrid_bm25',
    label: 'Recency Weighted Hybrid BM25',
    description:
      'Uses the same local tools as the balanced hybrid harness, but increases recency weighting for latest/current-style questions.',
    ...SHARED_AGENT_POLICIES,
    toolDefinitions: [
      'detect_temporal_intent(query): identify latest/current/history constraints before retrieval.',
      'retrieve_recency_weighted_hybrid_bm25(query, topK, contextBudget): hybrid lexical retrieval with temporal metadata boost.',
      extractiveAnswerTool,
    ],
    promptPolicy: 'Strict extractive answer with meeting-id citations and explicit uncertainty.',
    orchestrationPolicy: 'Temporal-aware retrieval pass that boosts newer meetings when the query asks for latest/current state.',
    contextPolicy: 'Balanced hybrid context with stronger temporal ranking and a 14k character budget.',
    toolPolicy: 'Local BM25 retrieval over notes plus transcript chunks with temporal metadata boost.',
    source: 'hybrid',
    retrievalStrategy: 'bm25',
    answerStrategy: 'extractive',
    topK: 12,
    maxDocsPerMeeting: 2,
    transcriptChunkWords: 320,
    transcriptChunkOverlap: 70,
    contextCharBudget: 14000,
    recencyBoost: 1.8,
  },
  {
    id: 'local_vector_database_rag',
    label: 'Vector DB + BM25 RAG',
    description:
      'Indexes notes and transcript chunks into a local vector database, fuses cosine similarity with BM25 candidates, and answers with the same deterministic grounded synthesizer.',
    ...SHARED_AGENT_POLICIES,
    toolDefinitions: [
      'local_vector_database.search(queryVector, topK): cosine search over hashed local note/transcript vectors.',
      'retrieve_bm25_candidates(query, candidatePool): lexical grounding candidate generator.',
      'fuse_vector_and_bm25(vectorHits, bm25Hits): combine semantic and lexical scores before context packing.',
      extractiveAnswerTool,
    ],
    promptPolicy: 'Strict extractive answer with meeting-id citations and explicit uncertainty.',
    orchestrationPolicy: 'Hybrid retrieval pass that fuses local vector database search with BM25, then deterministic grounded synthesis.',
    contextPolicy: 'Hybrid notes/transcript vector index, top 12 results, up to two chunks per meeting, 14k character budget.',
    toolPolicy: 'Local vector database retrieval plus BM25 candidate fusion; no external vector service required.',
    source: 'hybrid',
    retrievalStrategy: 'local_vector_database',
    answerStrategy: 'extractive',
    topK: 12,
    maxDocsPerMeeting: 2,
    transcriptChunkWords: 320,
    transcriptChunkOverlap: 70,
    contextCharBudget: 14000,
    recencyBoost: 0.7,
  },
  {
    id: 'openai_semantic_hybrid',
    label: 'OpenAI Semantic Hybrid',
    description:
      'Uses BM25 as candidate generation, OpenAI embeddings for semantic reranking, and an OpenAI model to synthesize the final answer with citations.',
    ...SHARED_AGENT_POLICIES,
    toolDefinitions: [
      'retrieve_bm25_candidates(query, candidatePool): local lexical candidate generation over notes plus transcripts.',
      'openai_embed(text): external embedding call for query and candidate reranking.',
      'semantic_rerank(queryEmbedding, candidateEmbeddings): cosine rerank before context packing.',
      'openai_answer(prompt, contexts): model-backed answer synthesis constrained to supplied evidence.',
    ],
    promptPolicy: 'Model-backed synthesis prompt constrained to supplied evidence and bracketed meeting-id citations.',
    orchestrationPolicy: 'Two-stage retrieval loop: BM25 candidate generation, embedding rerank, then model synthesis.',
    contextPolicy: 'Semantic-reranked hybrid context, top 10 results, up to two chunks per meeting, 16k character budget.',
    toolPolicy: 'Local BM25 candidate generation plus OpenAI embeddings and OpenAI answer synthesis.',
    source: 'hybrid',
    retrievalStrategy: 'openai_embeddings',
    answerStrategy: 'openai',
    embeddingModel: 'text-embedding-3-small',
    candidatePool: 80,
    topK: 10,
    maxDocsPerMeeting: 2,
    transcriptChunkWords: 360,
    transcriptChunkOverlap: 80,
    contextCharBudget: 16000,
    recencyBoost: 0.7,
  },
];

export function getConfigs(selected?: string, includeOpenAI = false): HarnessConfig[] {
  if (!selected || selected === 'all') {
    return HARNESS_CONFIGS.filter(config => includeOpenAI || config.answerStrategy !== 'openai');
  }
  const ids = new Set(selected.split(',').map(item => item.trim()));
  return HARNESS_CONFIGS.filter(config => ids.has(config.id));
}
