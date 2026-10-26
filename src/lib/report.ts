import {BenchmarkRun} from './types';

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function renderMarkdownReport(run: BenchmarkRun): string {
  const best = [...run.summaries].sort((a, b) => b.averageScore - a.averageScore)[0];
  const summaryRows = run.summaries
    .map(
      summary =>
        `| ${summary.label} | ${summary.averageScore.toFixed(3)} | ${pct(
          summary.retrievalRecallAtK,
        )} | ${pct(summary.expectedTermCoverage)} | ${pct(summary.citationRecall)} | ${pct(
          summary.citationSupport,
        )} | ${pct(
          summary.hallucinationRate,
        )} | ${pct(
          summary.toolSuccess,
        )} | ${summary.avgTokens.toFixed(0)} | $${summary.estimatedCostUsd.toFixed(4)} | ${summary.latencyMs.toFixed(
          0,
        )} ms |`,
    )
    .join('\n');

  const caseRows = run.cases
    .map(testCase => {
      const grades = run.grades
        .filter(grade => grade.caseId === testCase.id)
        .map(grade => `${grade.configId}: ${grade.score.toFixed(3)}`)
        .join('; ');
      return `| ${testCase.id} | ${testCase.category} | ${testCase.difficulty} | ${testCase.query.replace(
        /\|/g,
        '/',
      )} | ${grades} |`;
    })
    .join('\n');

  const notableFailures = run.grades
    .filter(grade => grade.score < 0.72)
    .slice(0, 8)
    .map(grade => {
      const testCase = run.cases.find(item => item.id === grade.caseId);
      return `- ${grade.configId} on ${grade.caseId}: score ${grade.score.toFixed(3)}. Missing evidence: ${
        grade.missingEvidenceIds.join(', ') || 'none'
      }. Weak citation spans: ${grade.poorCitationSpanIds.join(', ') || 'none'}. Missing terms: ${
        grade.missingTerms.join(', ') || 'none'
      }. Query: ${testCase?.query || ''}`;
    })
    .join('\n');

  return `# Granola Meetings Agent Benchmark Report

Generated: ${run.generatedAt}

## Abstract

This benchmark evaluates whether a meeting-corpus agent can retrieve the right meetings, select grounded evidence, and produce an answer that covers the expected facts. I built a compact, high-signal set of ${run.cases.length} realistic queries over ${run.dataset.meetingCount} Granola meetings (${run.dataset.transcriptCount} with raw transcripts), spanning single-meeting lookup, temporal lookup, cross-meeting synthesis, compliance/security asks, product feedback synthesis, and unsupported-specific handling.

The methodology is informed by stepwise tool-use evaluation patterns from ComplexFuncBench / ToolEval-style benchmarks and practical eval/observability tooling such as DeepEval and Evidently: log the trajectory, grade tool/retrieval behavior separately from final semantic grounding, and keep enough structured metadata to debug failures over time. In this implementation every answer records JSON trace steps for query interpretation, retrieval, and generation.

The grader intentionally separates evidence recall, answer coverage, citation behavior, tool-step success, and latency. That makes the result actionable: a low score can point to retrieval/context selection, answer synthesis, citation behavior, trace/tool behavior, or grading/rubric issues.

## Harnesses Tested

${run.configs
  .map(config => `- ${config.label} (\`${config.id}\`): ${config.description}`)
  .join('\n')}

## Results

| Harness | Avg score | Retrieval recall@k | Answer correctness proxy | Citation recall | Citation support | Hallucination rate | Tool success | Avg tokens | Est. run cost | Avg latency |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${summaryRows}

Best overall: ${best ? `${best.label} at ${best.averageScore.toFixed(3)}` : 'n/a'}.

## Case-Level Scores

| Case | Category | Difficulty | Query | Scores |
| --- | --- | --- | --- | --- |
${caseRows}

## Discussion

The benchmark is deliberately small, but the cases stress different failure modes. Notes-only retrieval should do well when Granola's generated notes already contain the answer, while transcript search should recover details that were omitted or phrased differently in notes. Temporal cases test whether a harness recognizes "latest" as an ordering constraint instead of a lexical keyword. Cross-meeting cases test diversification: returning six chunks from one meeting is usually worse than returning one strong chunk from each relevant meeting.

The current default run uses deterministic extractive answering so the benchmark is repeatable without an API key. When \`OPENAI_API_KEY\` is set, the same harness can run model-backed answering; the deterministic grader remains the same so retrieval and model changes are comparable.

Each result row includes a trace with:

- \`interpret_query\`: query category, difficulty, temporal intent, and expected retrieval shape.
- \`retrieve_context\`: retrieval strategy, context budget, returned meeting IDs, chunk types, and scores.
- \`generate_answer_*\`: whether the answer used an LLM or the deterministic extractive fallback, citation IDs, and fallback errors if any.

## Observability and Evaluation

The harness records structured traces for every case: query interpretation, retrieval/tool parameters, returned meeting IDs, chunk types, scores, answer generation mode, citation IDs, success/failure flags, and per-step latency. These traces support offline debugging and can be emitted unchanged in an online system.

Offline evaluation is covered by the golden JSON eval set and deterministic grader. It reports answer correctness proxy, citation recall, citation span support, hallucination rate, retrieval recall@k, tool-call success rate, latency, token estimates, and cost estimates. Human review is supported by the generated review CSV, where reviewers can score helpfulness, grounding, citation quality, hallucination risk, and whether missing/ambiguous evidence was handled correctly.

For online evaluation, the same cases map naturally to A/B experiments: route a cohort to a candidate harness, monitor user feedback, citation click-through, reformulation rate, thumbs up/down, task completion, human-review sampling, latency percentiles, and estimated cost per successful answer.

## Quality Bar

Good answers must be grounded in retrieved meeting evidence, cite source meeting IDs, avoid unsupported specifics, and explicitly say when the corpus does not answer the question. The grader separates retrieval recall@k from final-answer correctness and citation accuracy so retrieval failures and synthesis failures can be debugged independently.

## Cost Efficiency

Each result includes estimated prompt tokens, completion tokens, embedding tokens, context size, latency, and estimated third-party API cost. The estimates are configurable through environment variables, which lets the benchmark model routing and pricing changes without changing code. The \`check-regressions\` command enforces latency, cost, retrieval-recall, citation-support, and hallucination thresholds before a new run is accepted. Cost controls to extend next are cache hit-rate tracking, model routing by case difficulty, max-context budgets, embedding-cache warmup, and per-query spend caps.

## A/B Experiment Plan

- Control: \`notes_bm25\`, cheap notes-only retrieval.
- Treatment A: \`hybrid_transcript_bm25\`, higher-recall transcript retrieval with no model dependency.
- Treatment B: \`openai_semantic_hybrid\`, semantic RAG with embedding rerank and model synthesis.
- Primary metrics: grounded correctness, evidence recall, human-review pass rate.
- Guardrails: p95 latency, estimated cost per successful answer, no-answer correctness, citation precision, user thumbs-down rate.
- Ramp: internal dogfood, then 5% traffic, then 25%, with rollback on latency/cost or hallucination regressions.

## Notable Failures

${notableFailures || '- No cases scored below the review threshold.'}

## Extensions

- Expand sampled human review for borderline cases where the deterministic expected-term grader is too brittle.
- Add semantic claim-to-citation judging on top of the current lexical citation-span support proxy.
- Add a judge model with strict evidence IDs as a secondary faithfulness / answer-relevance score, but keep retrieval recall as a non-LLM metric.
- Add multi-turn cases, especially follow-ups that require carrying a resolved entity like "Deepgram" or "the latest standup".
- Add budget alerts and cache hit-rate tracking for cost regressions.
- Add conflict-specific rubrics for cases where newer meetings supersede older decisions.
`;
}
