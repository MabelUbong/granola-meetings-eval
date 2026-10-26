import {
  AgentAnswer,
  BenchmarkRun,
  CaseGrade,
  EvalCase,
  LlmJudgeResult,
  TraceStep,
} from './types';

type PublicIdMaps = {
  caseIds: Map<string, string>;
};

const REDACTED_TEXT =
  'Redacted in the public dashboard. The private run keeps the exact meeting evidence, answer text, citations, and trace payloads.';

function redactedItems(count: number, label: string): string[] {
  return count > 0 ? [`${count} ${label}${count === 1 ? '' : 's'} redacted`] : [];
}

function makePublicIdMaps(run: BenchmarkRun): PublicIdMaps {
  return {
    caseIds: new Map(run.cases.map((testCase, index) => [testCase.id, `case_${index + 1}`])),
  };
}

function publicCaseId(maps: PublicIdMaps, caseId: string): string {
  return maps.caseIds.get(caseId) || caseId;
}

function redactCase(testCase: EvalCase, index: number): EvalCase {
  return {
    ...testCase,
    id: `case_${index + 1}`,
    query: `Public eval case ${index + 1}: ${testCase.category} / ${testCase.difficulty}`,
    expectedBehavior: REDACTED_TEXT,
    requiredEvidence: testCase.requiredEvidence.map((_, evidenceIndex) => ({
      meetingId: `redacted_evidence_${evidenceIndex + 1}`,
      title: `Required evidence ${evidenceIndex + 1}`,
      snippet: REDACTED_TEXT,
    })),
    expectedTerms: [],
    rationale: REDACTED_TEXT,
  };
}

function safeStepOutput(step: TraceStep): Record<string, unknown> {
  const output = step.output;
  return {
    redacted: true,
    contextCount: output.contextCount,
    topScores: output.topScores,
    kinds: output.kinds,
    embeddingTokensEstimate: output.embeddingTokensEstimate,
    answerChars: output.answerChars,
    citationCount: Array.isArray(output.citationIds) ? output.citationIds.length : undefined,
    usedLlm: output.usedLlm,
    model: output.model,
  };
}

function redactStep(step: TraceStep, maps: PublicIdMaps): TraceStep {
  const [, configId = 'config', stepName = step.name] = step.stepId.split(':');
  return {
    ...step,
    stepId: `${publicCaseId(maps, step.stepId.split(':')[0] || '')}:${configId}:${stepName}`,
    input: {
      redacted: true,
      configId: step.input.configId,
      source: step.input.source,
      retrievalStrategy: step.input.retrievalStrategy,
      topK: step.input.topK,
      maxDocsPerMeeting: step.input.maxDocsPerMeeting,
      contextCharBudget: step.input.contextCharBudget,
      systemPrompt: step.input.systemPrompt,
      promptPolicy: step.input.promptPolicy,
      orchestrationPolicy: step.input.orchestrationPolicy,
      contextPolicy: step.input.contextPolicy,
      memoryPolicy: step.input.memoryPolicy,
      sandboxPolicy: step.input.sandboxPolicy,
      approvalPolicy: step.input.approvalPolicy,
      loggingPolicy: step.input.loggingPolicy,
      toolDefinitions: step.input.toolDefinitions,
      toolPolicy: step.input.toolPolicy,
    },
    output: safeStepOutput(step),
    error: step.error ? 'Redacted public error payload' : undefined,
  };
}

function redactJudge(judge: LlmJudgeResult | undefined): LlmJudgeResult | undefined {
  if (!judge) {
    return undefined;
  }

  return {
    ...judge,
    rationale: judge.error ? 'Judge call failed; error details redacted.' : REDACTED_TEXT,
    missingEvidence: redactedItems(judge.missingEvidence.length, 'missing evidence item'),
    unsupportedClaims: redactedItems(judge.unsupportedClaims.length, 'unsupported claim'),
    error: judge.error ? 'Redacted public judge error' : undefined,
  };
}

function redactAnswer(answer: AgentAnswer, maps: PublicIdMaps): AgentAnswer {
  return {
    ...answer,
    caseId: publicCaseId(maps, answer.caseId),
    query: REDACTED_TEXT,
    answer: REDACTED_TEXT,
    citations: [],
    contexts: [],
    steps: answer.steps.map(step => redactStep(step, maps)),
  };
}

function redactGrade(grade: CaseGrade, maps: PublicIdMaps): CaseGrade {
  return {
    ...grade,
    caseId: publicCaseId(maps, grade.caseId),
    missingEvidenceIds: redactedItems(grade.missingEvidenceIds.length, 'missing evidence id'),
    poorCitationSpanIds: redactedItems(grade.poorCitationSpanIds.length, 'weak citation span'),
    missingTerms: redactedItems(grade.missingTerms.length, 'missing expected term'),
    llmJudge: redactJudge(grade.llmJudge),
  };
}

export function redactRunForPublic(run: BenchmarkRun): BenchmarkRun {
  const maps = makePublicIdMaps(run);
  return {
    ...run,
    publicView: {
      redacted: true,
      note:
        'This public dashboard keeps aggregate eval metrics and harness comparisons while removing private meeting text, citations, meeting IDs, and raw trace payloads.',
      sourceReport: 'reports/benchmark-report.md',
    },
    cases: run.cases.map(redactCase),
    answers: run.answers.map(answer => redactAnswer(answer, maps)),
    grades: run.grades.map(grade => redactGrade(grade, maps)),
  };
}
