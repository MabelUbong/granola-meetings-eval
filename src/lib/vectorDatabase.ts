import {buildCorpus, retrieve, selectRetrievedContexts} from './retrieval';
import {containsTemporalIntent, dateToNumber, queryEntityTerms, tokenize} from './text';
import {CorpusDoc, HarnessConfig, Meeting, RetrievedContext} from './types';

const VECTOR_DIMS = 512;

type LocalVectorIndex = {
  docs: CorpusDoc[];
  vectors: number[][];
};

const indexCache = new Map<string, LocalVectorIndex>();

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function addTokens(vector: number[], text: string, weight: number): void {
  for (const token of tokenize(text)) {
    const bucket = hashToken(token) % VECTOR_DIMS;
    vector[bucket] += weight;
  }
}

function normalize(vector: number[]): number[] {
  const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (length === 0) {
    return vector;
  }
  return vector.map(value => value / length);
}

function vectorizeDoc(doc: CorpusDoc): number[] {
  const vector = Array.from({length: VECTOR_DIMS}, () => 0);
  addTokens(vector, doc.text, 1);
  addTokens(vector, doc.title, 2.4);
  addTokens(vector, doc.listTitles.join(' '), 0.9);
  if (doc.kind === 'notes') {
    addTokens(vector, 'meeting notes summary action items decisions', 0.25);
  }
  return normalize(vector);
}

function vectorizeQuery(query: string): number[] {
  const vector = Array.from({length: VECTOR_DIMS}, () => 0);
  addTokens(vector, query, 1);
  addTokens(vector, queryEntityTerms(query).join(' '), 2.2);
  return normalize(vector);
}

function dot(left: number[], right: number[]): number {
  let score = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    score += left[index] * right[index];
  }
  return score;
}

function cacheKey(meetings: Meeting[], config: HarnessConfig): string {
  const firstMeeting = meetings[0];
  const lastMeeting = meetings[meetings.length - 1];
  return [
    config.id,
    meetings.length,
    firstMeeting?.id || '',
    lastMeeting?.id || '',
    config.source,
    config.transcriptChunkWords,
    config.transcriptChunkOverlap,
  ].join(':');
}

function buildLocalVectorIndex(meetings: Meeting[], config: HarnessConfig): LocalVectorIndex {
  const key = cacheKey(meetings, config);
  const cached = indexCache.get(key);
  if (cached) {
    return cached;
  }

  const docs = buildCorpus(meetings, config);
  const index = {
    docs,
    vectors: docs.map(vectorizeDoc),
  };
  indexCache.set(key, index);
  return index;
}

export function retrieveWithLocalVectorDatabase(
  query: string,
  meetings: Meeting[],
  config: HarnessConfig,
): RetrievedContext[] {
  const index = buildLocalVectorIndex(meetings, config);
  const queryVector = vectorizeQuery(query);
  const bm25CandidateConfig: HarnessConfig = {
    ...config,
    retrievalStrategy: 'bm25',
    topK: config.candidatePool || 80,
    maxDocsPerMeeting: Math.max(config.maxDocsPerMeeting, 3),
    contextCharBudget: Math.max(config.contextCharBudget, 120000),
  };
  const bm25Candidates = retrieve(query, meetings, bm25CandidateConfig);
  const maxBm25 = Math.max(...bm25Candidates.map(candidate => candidate.score), 1);
  const bm25Scores = new Map(
    bm25Candidates.map(candidate => [candidate.docId, candidate.score / maxBm25]),
  );
  const dates = index.docs.map(doc => dateToNumber(doc.createdAt)).filter(Boolean);
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const range = Math.max(maxDate - minDate, 1);
  const temporalIntent = containsTemporalIntent(query);
  const entities = queryEntityTerms(query);

  const candidates = index.docs
    .map((doc, docIndex) => {
      const title = doc.title.toLowerCase();
      const listTitles = doc.listTitles.join(' ').toLowerCase();
      const entityBoost = entities.reduce((sum, entity) => {
        if (title.includes(entity)) {
          return sum + 0.08;
        }
        if (listTitles.includes(entity)) {
          return sum + 0.04;
        }
        return sum;
      }, 0);
      const recencyBoost = temporalIntent
        ? ((dateToNumber(doc.createdAt) - minDate) / range) * config.recencyBoost * 0.08
        : 0;
      const notesBoost = doc.kind === 'notes' ? 0.01 : 0;
      const vectorScore = dot(queryVector, index.vectors[docIndex]);
      const lexicalScore = bm25Scores.get(doc.docId) || 0;
      return {
        doc,
        score: vectorScore * 0.62 + lexicalScore * 0.5 + entityBoost + recencyBoost + notesBoost,
      };
    })
    .filter(candidate => candidate.score > 0);

  return selectRetrievedContexts(candidates, query, config, 700);
}
