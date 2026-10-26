import {termAppears, tokenize} from './text';
import {AgentAnswer, CaseGrade, Citation, ConfigSummary, EvidenceRequirement, EvalCase, LlmJudgeResult} from './types';

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, digits = 3): number {
  return Number(value.toFixed(digits));
}

function hallucinationRiskFor(testCase: EvalCase, answer: AgentAnswer, groundedCitationPrecision: number): number {
  const answerText = answer.answer.toLowerCase();
  const unsupportedSpecificCase =
    testCase.category.toLowerCase().includes('ambiguity') ||
    testCase.expectedBehavior.toLowerCase().includes('does not establish') ||
    testCase.expectedBehavior.toLowerCase().includes('do not hallucinate');
  const flagsUncertainty =
    answerText.includes('not enough evidence') ||
    answerText.includes('does not establish') ||
    answerText.includes('does not answer') ||
    answerText.includes('could not find') ||
    answerText.includes('available evidence does not');
  const unsupportedPenalty = unsupportedSpecificCase && !flagsUncertainty ? 1 : 0;
  const citationPenalty = Math.max(0, 1 - groundedCitationPrecision) * 0.5;
  return Math.min(1, unsupportedPenalty + citationPenalty);
}

function citationSpanScore(requirement: EvidenceRequirement, citations: Citation[]): number {
  const citationTexts = citations
    .filter(citation => citation.meetingId === requirement.meetingId)
    .map(citation => citation.snippet);
  if (citationTexts.length === 0) {
    return 0;
  }

  const requiredTerms = Array.from(new Set(tokenize(requirement.snippet)));
  if (requiredTerms.length === 0) {
    return 1;
  }

  return Math.max(
    ...citationTexts.map(citationText => {
      const citationTerms = new Set(tokenize(citationText));
      const overlap = requiredTerms.filter(term => citationTerms.has(term)).length;
      return overlap / requiredTerms.length;
    }),
  );
}

export function gradeAnswer(testCase: EvalCase, answer: AgentAnswer, llmJudge?: LlmJudgeResult): CaseGrade {
  const requiredIds = testCase.requiredEvidence.map(item => item.meetingId);
  const retrievedIds = new Set(answer.contexts.map(context => context.meetingId));
  const citationIds = new Set(answer.citations.map(citation => citation.meetingId));
  const missingEvidenceIds = requiredIds.filter(id => !retrievedIds.has(id));
  const missingCitationIds = requiredIds.filter(id => !citationIds.has(id));
  const citationSpanScores = testCase.requiredEvidence.map(requirement =>
    citationSpanScore(requirement, answer.citations),
  );
  const poorCitationSpanIds = testCase.requiredEvidence
    .filter((_, index) => citationSpanScores[index] < 0.3)
    .map(requirement => requirement.meetingId);
  const missingTerms = testCase.expectedTerms.filter(term => !termAppears(answer.answer, term));

  const evidenceRecall =
    requiredIds.length === 0 ? 1 : (requiredIds.length - missingEvidenceIds.length) / requiredIds.length;
  const citationRecall =
    requiredIds.length === 0 ? 1 : (requiredIds.length - missingCitationIds.length) / requiredIds.length;
  const citationSupport =
    citationSpanScores.length === 0
      ? 1
      : average(citationSpanScores);
  const expectedTermCoverage =
    testCase.expectedTerms.length === 0
      ? 1
      : (testCase.expectedTerms.length - missingTerms.length) / testCase.expectedTerms.length;
  const groundedCitationPrecision =
    answer.citations.length === 0
      ? 0
      : answer.citations.filter(citation => retrievedIds.has(citation.meetingId)).length /
        answer.citations.length;
  const hallucinationRisk = hallucinationRiskFor(testCase, answer, groundedCitationPrecision);
  const requiredStepNames = new Set(['interpret_query', 'retrieve_context', 'generate_answer_extractively']);
  if (answer.usedLlm) {
    requiredStepNames.delete('generate_answer_extractively');
    requiredStepNames.add('generate_answer_with_model');
  }
  const stepNames = new Set(answer.steps.map(step => step.name));
  const stepCompleteness =
    Array.from(requiredStepNames).filter(stepName => stepNames.has(stepName)).length /
    Math.max(requiredStepNames.size, 1);
  const toolSteps = answer.steps.filter(step => step.kind === 'retrieval');
  const toolSuccess =
    toolSteps.length === 0
      ? 0
      : toolSteps.filter(step => step.success && Number(step.output.contextCount || 0) > 0).length /
        toolSteps.length;
  const latencyScore = answer.latencyMs < 5000 ? 1 : answer.latencyMs < 15000 ? 0.7 : 0.35;
  const score =
    0.32 * evidenceRecall +
    0.26 * expectedTermCoverage +
    0.1 * citationRecall +
    0.08 * citationSupport +
    0.04 * groundedCitationPrecision +
    0.08 * (1 - hallucinationRisk) +
    0.06 * toolSuccess +
    0.03 * stepCompleteness +
    0.03 * latencyScore;

  return {
    caseId: testCase.id,
    configId: answer.configId,
    score: round(score),
    evidenceRecall: round(evidenceRecall),
    retrievalRecallAtK: round(evidenceRecall),
    citationRecall: round(citationRecall),
    citationSupport: round(citationSupport),
    expectedTermCoverage: round(expectedTermCoverage),
    groundedCitationPrecision: round(groundedCitationPrecision),
    hallucinationRisk: round(hallucinationRisk),
    toolSuccess: round(toolSuccess),
    stepCompleteness: round(stepCompleteness),
    latencyScore: round(latencyScore),
    missingEvidenceIds,
    poorCitationSpanIds,
    missingTerms,
    llmJudge,
  };
}

export function summarizeGrades(
  grades: CaseGrade[],
  answers: AgentAnswer[],
  labelsByConfig: Map<string, string>,
): ConfigSummary[] {
  const configIds = Array.from(new Set(grades.map(grade => grade.configId)));
  return configIds.map(configId => {
    const matchingGrades = grades.filter(grade => grade.configId === configId);
    const matchingAnswers = answers.filter(answer => answer.configId === configId);
    const judgedGrades = matchingGrades.filter(grade => grade.llmJudge && !grade.llmJudge.error);
    return {
      configId,
      label: labelsByConfig.get(configId) || configId,
      averageScore: round(average(matchingGrades.map(grade => grade.score))),
      evidenceRecall: round(average(matchingGrades.map(grade => grade.evidenceRecall))),
      retrievalRecallAtK: round(average(matchingGrades.map(grade => grade.retrievalRecallAtK))),
      citationRecall: round(average(matchingGrades.map(grade => grade.citationRecall))),
      citationSupport: round(average(matchingGrades.map(grade => grade.citationSupport))),
      expectedTermCoverage: round(average(matchingGrades.map(grade => grade.expectedTermCoverage))),
      hallucinationRate: round(average(matchingGrades.map(grade => grade.hallucinationRisk))),
      toolSuccess: round(average(matchingGrades.map(grade => grade.toolSuccess))),
      stepCompleteness: round(average(matchingGrades.map(grade => grade.stepCompleteness))),
      avgTokens: Number(average(matchingAnswers.map(answer => answer.metrics.totalTokensEstimate)).toFixed(0)),
      estimatedCostUsd: Number(
        matchingAnswers.reduce((sum, answer) => sum + answer.metrics.estimatedCostUsd, 0).toFixed(6),
      ),
      latencyMs: Number(average(matchingAnswers.map(answer => answer.latencyMs)).toFixed(1)),
      llmJudgeScore:
        judgedGrades.length === 0
          ? undefined
          : round(average(judgedGrades.map(grade => grade.llmJudge?.score || 0))),
      llmJudgeFaithfulness:
        judgedGrades.length === 0
          ? undefined
          : round(average(judgedGrades.map(grade => grade.llmJudge?.citationFaithfulness || 0))),
    };
  });
}
