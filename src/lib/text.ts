const STOPWORDS = new Set([
  'a',
  'about',
  'after',
  'all',
  'also',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'been',
  'but',
  'by',
  'can',
  'did',
  'do',
  'does',
  'for',
  'from',
  'granola',
  'had',
  'has',
  'have',
  'how',
  'i',
  'in',
  'into',
  'is',
  'it',
  'its',
  'last',
  'latest',
  'meeting',
  'meetings',
  'of',
  'on',
  'or',
  'our',
  'over',
  'please',
  'say',
  'said',
  'should',
  'summarize',
  'summary',
  'tell',
  'that',
  'the',
  'their',
  'there',
  'these',
  'they',
  'this',
  'to',
  'up',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'who',
  'with',
  'would',
]);

export function stripHtml(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h[1-6]|ul|ol|div)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function normalizeWhitespace(input: string): string {
  return stripHtml(input).replace(/\s+/g, ' ').trim();
}

export function tokenize(input: string): string[] {
  const normalized = normalizeWhitespace(input).toLowerCase();
  return normalized
    .split(/[^a-z0-9$%.]+/g)
    .map(token => token.trim())
    .filter(token => token.length > 1 && !STOPWORDS.has(token));
}

export function containsTemporalIntent(query: string): boolean {
  return /\b(latest|last|most recent|recent|newest|current)\b/i.test(query);
}

export function queryEntityTerms(query: string): string[] {
  const rawTerms = query.match(/\b[A-Z][A-Za-z0-9&<>.-]{2,}\b/g) || [];
  const genericTerms = new Set(['Granola', 'How', 'What', 'When', 'Where', 'Which', 'Who']);
  return Array.from(new Set(rawTerms.filter(term => !genericTerms.has(term)).map(term => term.toLowerCase())));
}

export function splitSentences(input: string): string[] {
  const text = normalizeWhitespace(input);
  return text
    .split(/(?<=[.!?])\s+|(?:\s+-\s+)/g)
    .map(sentence => sentence.trim())
    .filter(Boolean);
}

export function bestSnippet(text: string, query: string, maxChars = 420): string {
  const queryTerms = new Set(tokenize(query));
  const sentences = splitSentences(text);
  let best = sentences[0] || normalizeWhitespace(text);
  let bestScore = -1;

  for (const sentence of sentences) {
    const terms = tokenize(sentence);
    const overlap = terms.filter(term => queryTerms.has(term)).length;
    const density = overlap / Math.max(terms.length, 1);
    const score = overlap + density;
    if (score > bestScore) {
      best = sentence;
      bestScore = score;
    }
  }

  return clip(best, maxChars);
}

export function bestPassage(text: string, query: string, maxChars = 700): string {
  const queryTerms = new Set(tokenize(query));
  const stripped = stripHtml(text)
    .replace(/\r/g, '\n')
    .split(/\n+/g)
    .flatMap(line => line.split(/\s+-\s+/g))
    .map(line => line.replace(/^#+\s*/, '').replace(/^[-*]\s*/, '').trim())
    .filter(line => line.length > 2);

  if (stripped.length === 0) {
    return bestSnippet(text, query, maxChars);
  }

  let bestIndex = 0;
  let bestScore = -1;
  for (let index = 0; index < stripped.length; index += 1) {
    const line = stripped[index];
    const terms = tokenize(line);
    const overlap = terms.filter(term => queryTerms.has(term)).length;
    const hasNumbers = /[$0-9]/.test(line) ? 0.35 : 0;
    const hasActionLanguage = /\b(need|must|should|will|next|blocker|limit|pricing|cost|request|require)\b/i.test(
      line,
    )
      ? 0.35
      : 0;
    const footerPenalty = /(chat with meeting transcript|https?:\/\/|notes\.granola|[a-z0-9._%+-]+@[a-z0-9.-]+)/i.test(
      line,
    )
      ? 4
      : 0;
    const score = overlap + overlap / Math.max(terms.length, 1) + hasNumbers + hasActionLanguage - footerPenalty;
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  }

  const start = Math.max(0, bestIndex - 1);
  const passageLines = stripped.slice(start, Math.min(stripped.length, bestIndex + 6));
  return clip(passageLines.join(' '), maxChars);
}

export function clip(input: string, maxChars: number): string {
  const text = normalizeWhitespace(input);
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}...`;
}

export function termAppears(haystack: string, term: string): boolean {
  const normalizedHaystack = normalizeWhitespace(haystack).toLowerCase();
  const normalizedTerm = normalizeWhitespace(term).toLowerCase();
  return normalizedHaystack.includes(normalizedTerm);
}

export function dateToNumber(date: string): number {
  const parsed = Date.parse(date);
  return Number.isFinite(parsed) ? parsed : 0;
}
