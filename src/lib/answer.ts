import {callOpenAI} from './openaiClient';
import {estimateModelCostUsd, estimateTokens, roundUsd} from './metrics';
import {bestPassage, clip, queryEntityTerms, tokenize} from './text';
import {AgentAnswer, Citation, EvalCase, HarnessConfig, RetrievedContext, TraceStep} from './types';

function evidenceBody(context: RetrievedContext): string {
  const body = context.text
    .split(/\n+/g)
    .slice(3)
    .join('\n')
    .trim();
  return body || context.text;
}

function makeCitations(contexts: RetrievedContext[], query: string): Citation[] {
  const seen = new Set<string>();
  const citations: Citation[] = [];
  for (const context of contexts) {
    if (seen.has(context.meetingId)) {
      continue;
    }
    seen.add(context.meetingId);
    citations.push({
      meetingId: context.meetingId,
      title: context.title,
      createdAt: context.createdAt,
      snippet: bestPassage(evidenceBody(context), query, 700),
    });
  }
  return citations.slice(0, 6);
}

function rankContextForAnswer(testCase: EvalCase, context: RetrievedContext): number {
  const queryTerms = new Set(tokenize(testCase.query));
  const titleTerms = new Set(tokenize(context.title));
  const listTerms = new Set(tokenize(context.listTitles.join(' ')));
  const passageTerms = tokenize(bestPassage(evidenceBody(context), testCase.query, 700));
  const passageOverlap = passageTerms.filter(term => queryTerms.has(term)).length;
  const titleOverlap = Array.from(queryTerms).filter(term => titleTerms.has(term)).length;
  const listOverlap = Array.from(queryTerms).filter(term => listTerms.has(term)).length;
  const entityTitleOverlap = queryEntityTerms(testCase.query).filter(term => titleTerms.has(term)).length;
  return context.score + passageOverlap + titleOverlap * 4 + listOverlap + entityTitleOverlap * 10;
}

function rankedContexts(testCase: EvalCase, contexts: RetrievedContext[]): RetrievedContext[] {
  return contexts
    .map(context => ({context, rank: rankContextForAnswer(testCase, context)}))
    .sort((a, b) => b.rank - a.rank)
    .map(item => item.context);
}

function contextHasEntity(context: RetrievedContext, entity: string): boolean {
  const titleTerms = new Set(tokenize(context.title));
  const bodyTerms = new Set(tokenize(evidenceBody(context)));
  return titleTerms.has(entity) || bodyTerms.has(entity);
}

function extractiveAnswer(testCase: EvalCase, contexts: RetrievedContext[]): string {
  if (contexts.length === 0) {
    return 'I could not find supporting meetings for this question in the indexed corpus.';
  }

  const entityTerms = queryEntityTerms(testCase.query);
  const strictEntityContexts =
    entityTerms.length > 1
      ? contexts.filter(context => entityTerms.every(entity => contextHasEntity(context, entity)))
      : [];
  const entityContexts =
    strictEntityContexts.length > 0
      ? strictEntityContexts
      : contexts.filter(context => entityTerms.some(entity => contextHasEntity(context, entity)));
  const priceEvidenceContexts = entityContexts.length > 0 ? entityContexts : contexts;
  const priceEvidenceText = priceEvidenceContexts.map(context => context.text).join('\n').toLowerCase();
  const asksForAgreedPrice = /\b(agree|agreed|pay|price|pricing|cost)\b/i.test(testCase.query);
  const hasPriceEvidence = /(\$[0-9]|per user|per seat|pricing|price point|cost)/i.test(priceEvidenceText);
  const insufficiencyPrefix =
    asksForAgreedPrice && !hasPriceEvidence
      ? 'I found related meeting evidence, but it does not establish an agreed price. The safest answer is that there is not enough evidence for the requested pricing claim.\n\n'
      : '';

  const seenMeetings = new Set<string>();
  const bullets = rankedContexts(testCase, contexts)
    .filter(context => {
      if (seenMeetings.has(context.meetingId)) {
        return false;
      }
      seenMeetings.add(context.meetingId);
      return true;
    })
    .slice(0, 6)
    .map(context => {
      const snippet = bestPassage(evidenceBody(context), testCase.query, 700);
      return `- ${context.title} (${context.createdAt}): ${clip(snippet, 700)} [${context.meetingId}]`;
    });

  return [
    `${insufficiencyPrefix}Based on the retrieved meeting evidence:`,
    ...bullets,
    '',
    `Grounding note: this deterministic baseline is extractive; all factual claims above are tied to retrieved meeting IDs.`,
  ].join('\n');
}

function promptFor(testCase: EvalCase, contexts: RetrievedContext[]): string {
  const packedContexts = contexts
    .map(
      (context, index) =>
        `[${index + 1}] ${context.title} (${context.createdAt}, ${context.meetingId})\n${clip(
          context.text,
          1800,
        )}`,
    )
    .join('\n\n');

  return `You answer questions over a user's Granola meeting corpus.

Use only the supplied evidence. If the evidence does not answer the question, say that clearly.
Include bracket citations with meeting ids for important claims.

Question: ${testCase.query}

Evidence:
${packedContexts}

Answer:`;
}

export async function answerCase(
  testCase: EvalCase,
  config: HarnessConfig,
  contexts: RetrievedContext[],
  useLlm: boolean,
  traceSteps: TraceStep[],
): Promise<AgentAnswer> {
  const started = Date.now();
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const promptText = promptFor(testCase, contexts);
  const contextChars = contexts.reduce((sum, context) => sum + context.text.length, 0);
  let answer: string;
  let usedLlm = false;
  let success = true;
  let errorMessage: string | undefined;

  try {
    if (useLlm && process.env.OPENAI_API_KEY) {
      answer = await callOpenAI(model, promptText);
      usedLlm = true;
    } else {
      answer = extractiveAnswer(testCase, contexts);
    }
  } catch (error) {
    success = false;
    errorMessage = error instanceof Error ? error.message : String(error);
    answer = extractiveAnswer(testCase, contexts);
  }

  const allCitations = makeCitations(rankedContexts(testCase, contexts), testCase.query);
  const citationIdsInAnswer = new Set(
    allCitations.filter(citation => answer.includes(citation.meetingId)).map(citation => citation.meetingId),
  );
  const citations = allCitations.filter(
    citation => citationIdsInAnswer.size === 0 || citationIdsInAnswer.has(citation.meetingId),
  );
  const generationLatencyMs = Date.now() - started;
  const promptTokensEstimate = estimateTokens(promptText);
  const completionTokensEstimate = estimateTokens(answer);
  const modelCost = usedLlm ? estimateModelCostUsd(promptTokensEstimate, completionTokensEstimate) : 0;

  return {
    caseId: testCase.id,
    configId: config.id,
    query: testCase.query,
    answer,
    citations: citations.length > 0 ? citations : allCitations,
    contexts,
    steps: [
      ...traceSteps,
      {
        stepId: `${testCase.id}:${config.id}:generate`,
        name: usedLlm ? 'generate_answer_with_model' : 'generate_answer_extractively',
        kind: 'generation',
        timestamp: new Date().toISOString(),
        latencyMs: generationLatencyMs,
        success,
        model: usedLlm ? model : undefined,
        input: {
          contextCount: contexts.length,
          contextMeetingIds: contexts.map(context => context.meetingId),
          requestedLlm: useLlm,
        },
        output: {
          answerChars: answer.length,
          promptTokensEstimate,
          completionTokensEstimate,
          citationMeetingIds: (citations.length > 0 ? citations : allCitations).map(citation => citation.meetingId),
          usedLlm,
          fallbackReason: errorMessage,
        },
        error: errorMessage,
      },
    ],
    metrics: {
      retrievalLatencyMs: 0,
      generationLatencyMs,
      contextChars,
      promptTokensEstimate,
      completionTokensEstimate,
      embeddingTokensEstimate: 0,
      totalTokensEstimate: promptTokensEstimate + completionTokensEstimate,
      estimatedCostUsd: roundUsd(modelCost),
    },
    latencyMs: generationLatencyMs,
    usedLlm,
    model: usedLlm ? model : undefined,
  };
}
