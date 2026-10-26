import {HarnessConfig} from './types';

export const HARNESS_CONFIGS: HarnessConfig[] = [
  {
    id: 'notes_bm25',
    label: 'Notes BM25',
    description:
      'Searches only Granola titles, lists, attendees, and generated notes. This is cheap and fast, but misses details only present in raw transcript.',
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
    id: 'hybrid_transcript_bm25',
    label: 'Hybrid Transcript BM25',
    description:
      'Searches metadata/notes plus overlapping transcript chunks, then packs diversified evidence into the answer context.',
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
    id: 'openai_semantic_hybrid',
    label: 'OpenAI Semantic Hybrid',
    description:
      'Uses BM25 as candidate generation, OpenAI embeddings for semantic reranking, and an OpenAI model to synthesize the final answer with citations.',
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
