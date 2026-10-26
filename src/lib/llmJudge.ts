import {callOpenAI} from './openaiClient';
import {estimateModelCostUsd, estimateTokens, roundUsd} from './metrics';
import {AgentAnswer, EvalCase, LlmJudgeResult, TraceStep} from './types';

function clampScore(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, numeric));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
}

function parseJudgeJson(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] || text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Judge response did not contain a JSON object');
  }
  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}

function judgePrompt(testCase: EvalCase, answer: AgentAnswer): string {
  const payload = {
    query: testCase.query,
    expectedBehavior: testCase.expectedBehavior,
    expectedTerms: testCase.expectedTerms,
    requiredEvidence: testCase.requiredEvidence,
    answer: answer.answer,
    citations: answer.citations,
    retrievedContexts: answer.contexts.map(context => ({
      meetingId: context.meetingId,
      title: context.title,
      kind: context.kind,
      snippet: context.snippet,
    })),
  };

  return `You are grading a meeting-corpus QA agent. Use only the required evidence, retrieved contexts, and cited snippets in the JSON payload. Penalize unsupported specifics even if they sound plausible.

Return only valid JSON with these keys:
- answerCorrectness: number from 0 to 1
- citationFaithfulness: number from 0 to 1
- completeness: number from 0 to 1
- hallucinationRisk: number from 0 to 1 where 1 means high risk
- rationale: short string
- missingEvidence: string array of missing meeting IDs or facts
- unsupportedClaims: string array of unsupported answer claims

Overall score should reward correctness, faithful citations, and completeness, and penalize hallucination risk.

Payload:
${JSON.stringify(payload, null, 2)}`;
}

export async function judgeAnswerWithOpenAI(
  testCase: EvalCase,
  answer: AgentAnswer,
): Promise<{judge: LlmJudgeResult; step: TraceStep}> {
  const model = process.env.OPENAI_JUDGE_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const prompt = judgePrompt(testCase, answer);
  const started = Date.now();

  try {
    const responseText = await callOpenAI(model, prompt);
    const latencyMs = Date.now() - started;
    const parsed = parseJudgeJson(responseText);
    const answerCorrectness = clampScore(parsed.answerCorrectness);
    const citationFaithfulness = clampScore(parsed.citationFaithfulness);
    const completeness = clampScore(parsed.completeness);
    const hallucinationRisk = clampScore(parsed.hallucinationRisk);
    const score = clampScore(
      0.36 * answerCorrectness +
        0.28 * citationFaithfulness +
        0.22 * completeness +
        0.14 * (1 - hallucinationRisk),
    );
    const promptTokensEstimate = estimateTokens(prompt);
    const completionTokensEstimate = estimateTokens(responseText);
    const judge: LlmJudgeResult = {
      model,
      score,
      answerCorrectness,
      citationFaithfulness,
      completeness,
      hallucinationRisk,
      rationale: typeof parsed.rationale === 'string' ? parsed.rationale : '',
      missingEvidence: stringArray(parsed.missingEvidence),
      unsupportedClaims: stringArray(parsed.unsupportedClaims),
      latencyMs,
      promptTokensEstimate,
      completionTokensEstimate,
      estimatedCostUsd: roundUsd(estimateModelCostUsd(promptTokensEstimate, completionTokensEstimate)),
    };

    return {
      judge,
      step: {
        stepId: `${testCase.id}:${answer.configId}:judge`,
        name: 'judge_answer_with_model',
        kind: 'grading',
        timestamp: new Date().toISOString(),
        latencyMs,
        success: true,
        tool: 'openai_llm_judge',
        model,
        input: {
          rubric: 'correctness_faithfulness_completeness_hallucination',
        },
        output: {
          score: judge.score,
          answerCorrectness,
          citationFaithfulness,
          completeness,
          hallucinationRisk,
          missingEvidence: judge.missingEvidence,
          unsupportedClaims: judge.unsupportedClaims,
        },
      },
    };
  } catch (error) {
    const latencyMs = Date.now() - started;
    const promptTokensEstimate = estimateTokens(prompt);
    const message = error instanceof Error ? error.message : String(error);
    const judge: LlmJudgeResult = {
      model,
      score: 0,
      answerCorrectness: 0,
      citationFaithfulness: 0,
      completeness: 0,
      hallucinationRisk: 1,
      rationale: 'LLM judge failed.',
      missingEvidence: [],
      unsupportedClaims: [],
      latencyMs,
      promptTokensEstimate,
      completionTokensEstimate: 0,
      estimatedCostUsd: 0,
      error: message,
    };

    return {
      judge,
      step: {
        stepId: `${testCase.id}:${answer.configId}:judge`,
        name: 'judge_answer_with_model',
        kind: 'grading',
        timestamp: new Date().toISOString(),
        latencyMs,
        success: false,
        tool: 'openai_llm_judge',
        model,
        input: {
          rubric: 'correctness_faithfulness_completeness_hallucination',
        },
        output: {},
        error: message,
      },
    };
  }
}
