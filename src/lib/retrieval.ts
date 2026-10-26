import {bestPassage, containsTemporalIntent, dateToNumber, normalizeWhitespace, queryEntityTerms, tokenize} from './text';
import {CorpusDoc, HarnessConfig, Meeting, RetrievedContext} from './types';

type IndexedDoc = CorpusDoc & {
  termCounts: Map<string, number>;
  length: number;
};

export type ContextCandidate = {
  doc: CorpusDoc;
  score: number;
};

function buildNotesText(meeting: Meeting): string {
  return [
    meeting.title,
    meeting.createdAt,
    meeting.listTitles.join(' '),
    meeting.notes,
    meeting.people.join(' '),
  ]
    .filter(Boolean)
    .join('\n');
}

function chunkText(meeting: Meeting, config: HarnessConfig): CorpusDoc[] {
  const words = normalizeWhitespace(meeting.transcript).split(/\s+/g).filter(Boolean);
  const docs: CorpusDoc[] = [];
  if (words.length === 0) {
    return docs;
  }

  const step = Math.max(1, config.transcriptChunkWords - config.transcriptChunkOverlap);
  for (let start = 0, chunkIndex = 0; start < words.length; start += step, chunkIndex += 1) {
    const chunk = words.slice(start, start + config.transcriptChunkWords).join(' ');
    if (!chunk.trim()) {
      continue;
    }
    docs.push({
      docId: `${meeting.id}:transcript:${chunkIndex}`,
      meetingId: meeting.id,
      title: meeting.title,
      createdAt: meeting.createdAt,
      listTitles: meeting.listTitles,
      kind: 'transcript',
      chunkIndex,
      text: [
        meeting.title,
        meeting.createdAt,
        meeting.listTitles.join(' '),
        chunk,
      ].join('\n'),
    });
  }

  return docs;
}

export function buildCorpus(meetings: Meeting[], config: HarnessConfig): CorpusDoc[] {
  const docs: CorpusDoc[] = [];
  for (const meeting of meetings) {
    docs.push({
      docId: `${meeting.id}:notes:0`,
      meetingId: meeting.id,
      title: meeting.title,
      createdAt: meeting.createdAt,
      listTitles: meeting.listTitles,
      kind: 'notes',
      chunkIndex: 0,
      text: buildNotesText(meeting),
    });

    if (config.source === 'hybrid') {
      docs.push(...chunkText(meeting, config));
    }
  }
  return docs;
}

function indexDocs(docs: CorpusDoc[]): IndexedDoc[] {
  return docs.map(doc => {
    const termCounts = new Map<string, number>();
    const terms = tokenize(doc.text);
    for (const term of terms) {
      termCounts.set(term, (termCounts.get(term) || 0) + 1);
    }
    return {
      ...doc,
      termCounts,
      length: terms.length,
    };
  });
}

function documentFrequency(indexedDocs: IndexedDoc[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const doc of indexedDocs) {
    for (const term of doc.termCounts.keys()) {
      df.set(term, (df.get(term) || 0) + 1);
    }
  }
  return df;
}

function bm25Score(
  queryTerms: string[],
  doc: IndexedDoc,
  df: Map<string, number>,
  docCount: number,
  averageLength: number,
): number {
  const k1 = 1.2;
  const b = 0.72;
  let score = 0;

  for (const term of queryTerms) {
    const tf = doc.termCounts.get(term) || 0;
    if (tf === 0) {
      continue;
    }
    const termDf = df.get(term) || 0;
    const idf = Math.log(1 + (docCount - termDf + 0.5) / (termDf + 0.5));
    const numerator = tf * (k1 + 1);
    const denominator = tf + k1 * (1 - b + b * (doc.length / Math.max(averageLength, 1)));
    score += idf * (numerator / denominator);
  }

  return score;
}

function metadataBoost(
  doc: CorpusDoc,
  query: string,
  queryTerms: string[],
  config: HarnessConfig,
  minDate: number,
  maxDate: number,
): number {
  const titleTerms = new Set(tokenize(doc.title));
  const listTerms = new Set(tokenize(doc.listTitles.join(' ')));
  const textTerms = new Set(tokenize(doc.text));
  const entities = queryEntityTerms(query);
  let boost = 0;

  for (const term of queryTerms) {
    if (titleTerms.has(term)) {
      boost += 1.5;
    }
    if (listTerms.has(term)) {
      boost += 0.55;
    }
  }

  for (const entity of entities) {
    if (titleTerms.has(entity)) {
      boost += 4;
    } else if (listTerms.has(entity)) {
      boost += 2;
    } else if (textTerms.has(entity)) {
      boost += 0.75;
    }
  }

  if (containsTemporalIntent(query)) {
    const range = Math.max(maxDate - minDate, 1);
    const normalizedRecency = (dateToNumber(doc.createdAt) - minDate) / range;
    boost += Math.max(0, normalizedRecency) * config.recencyBoost * 8;
  }

  if (doc.kind === 'notes') {
    boost += 0.15;
  }

  return boost;
}

export function retrieve(query: string, meetings: Meeting[], config: HarnessConfig): RetrievedContext[] {
  const docs = buildCorpus(meetings, config);
  const indexedDocs = indexDocs(docs);
  const df = documentFrequency(indexedDocs);
  const queryTerms = tokenize(query);
  const dates = docs.map(doc => dateToNumber(doc.createdAt)).filter(Boolean);
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const averageLength =
    indexedDocs.reduce((sum, doc) => sum + doc.length, 0) / Math.max(indexedDocs.length, 1);

  const scored = indexedDocs
    .map(doc => ({
      doc,
      score:
        bm25Score(queryTerms, doc, df, indexedDocs.length, averageLength) +
        metadataBoost(doc, query, queryTerms, config, minDate, maxDate),
    }))
    .filter(item => item.score > 0);

  return selectRetrievedContexts(scored, query, config, 650);
}

export function selectRetrievedContexts(
  candidates: ContextCandidate[],
  query: string,
  config: HarnessConfig,
  snippetChars: number,
): RetrievedContext[] {
  const selected: RetrievedContext[] = [];
  const perMeeting = new Map<string, number>();
  let usedChars = 0;

  for (const item of [...candidates].sort((a, b) => b.score - a.score)) {
    const count = perMeeting.get(item.doc.meetingId) || 0;
    if (count >= config.maxDocsPerMeeting) {
      continue;
    }

    const snippet = bestPassage(item.doc.text, query, snippetChars);
    if (usedChars + snippet.length > config.contextCharBudget && selected.length > 0) {
      break;
    }

    selected.push({
      ...item.doc,
      score: Number(item.score.toFixed(4)),
      snippet,
    });
    perMeeting.set(item.doc.meetingId, count + 1);
    usedChars += snippet.length;

    if (selected.length >= config.topK) {
      break;
    }
  }

  return selected;
}
