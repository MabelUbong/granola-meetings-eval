import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {loadJsonFile} from './data';
import {callOpenAIEmbeddings} from './openaiClient';
import {retrieve, selectRetrievedContexts} from './retrieval';
import {clip, containsTemporalIntent, dateToNumber} from './text';
import {HarnessConfig, Meeting, RetrievedContext} from './types';

type EmbeddingCache = Record<string, number[]>;

function cachePath(): string {
  return path.resolve(process.env.EMBEDDING_CACHE_PATH || 'data/processed/openai-embedding-cache.json');
}

function cacheKey(model: string, text: string): string {
  return crypto.createHash('sha1').update(`${model}\n${text}`).digest('hex');
}

function loadCache(): EmbeddingCache {
  const filePath = cachePath();
  if (!fs.existsSync(filePath)) {
    return {};
  }
  return loadJsonFile<EmbeddingCache>(filePath);
}

function saveCache(cache: EmbeddingCache): void {
  const filePath = cachePath();
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(cache)}\n`);
}

function dot(a: number[], b: number[]): number {
  let total = 0;
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    total += a[index] * b[index];
  }
  return total;
}

function norm(a: number[]): number {
  return Math.sqrt(dot(a, a));
}

function cosine(a: number[], b: number[]): number {
  return dot(a, b) / Math.max(norm(a) * norm(b), 1e-9);
}

async function embedTexts(texts: string[], model: string): Promise<number[][]> {
  const cache = loadCache();
  const keys = texts.map(text => cacheKey(model, text));
  const missingTexts: string[] = [];
  const missingIndexes: number[] = [];

  keys.forEach((key, index) => {
    if (!cache[key]) {
      missingTexts.push(texts[index]);
      missingIndexes.push(index);
    }
  });

  for (let start = 0; start < missingTexts.length; start += 64) {
    const batch = missingTexts.slice(start, start + 64);
    const embeddings = await callOpenAIEmbeddings(batch, model);
    embeddings.forEach((embedding, batchIndex) => {
      const originalIndex = missingIndexes[start + batchIndex];
      cache[keys[originalIndex]] = embedding;
    });
  }

  if (missingTexts.length > 0) {
    saveCache(cache);
  }

  return keys.map(key => cache[key]);
}

export async function retrieveWithOpenAIEmbeddings(
  query: string,
  meetings: Meeting[],
  config: HarnessConfig,
): Promise<RetrievedContext[]> {
  const model = process.env.OPENAI_EMBEDDING_MODEL || config.embeddingModel || 'text-embedding-3-small';
  const candidateConfig: HarnessConfig = {
    ...config,
    topK: config.candidatePool || 80,
    maxDocsPerMeeting: Math.max(config.maxDocsPerMeeting, 3),
    contextCharBudget: Math.max(config.contextCharBudget, 100000),
  };

  const candidates = retrieve(query, meetings, candidateConfig);
  if (candidates.length === 0) {
    return [];
  }

  const embeddingTexts = [
    query,
    ...candidates.map(candidate => clip(candidate.text, 7000)),
  ];
  const [queryEmbedding, ...candidateEmbeddings] = await embedTexts(embeddingTexts, model);
  const dates = candidates.map(candidate => dateToNumber(candidate.createdAt)).filter(Boolean);
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const recencyRange = Math.max(maxDate - minDate, 1);
  const temporalIntent = containsTemporalIntent(query);

  const scored = candidates
    .map((candidate, index) => {
      const semanticScore = cosine(queryEmbedding, candidateEmbeddings[index]);
      const normalizedRecency = (dateToNumber(candidate.createdAt) - minDate) / recencyRange;
      const recencyBoost = temporalIntent ? normalizedRecency * 0.12 : 0;
      const lexicalTieBreaker = Math.min(candidate.score / 100, 0.08);
      return {
        candidate,
        score: semanticScore + recencyBoost + lexicalTieBreaker,
      };
    })
    .sort((a, b) => b.score - a.score);

  return selectRetrievedContexts(
    scored.map(item => ({doc: item.candidate, score: item.score})),
    query,
    config,
    700,
  );
}
