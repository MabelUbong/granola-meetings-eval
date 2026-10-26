import fs from 'fs';
import path from 'path';
import {argString, parseArgs} from './args';
import {loadJsonFile} from '../lib/data';
import {BenchmarkRun} from '../lib/types';

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const inPath = argString(args, 'in', 'reports/latest-results.json');
  const outPath = argString(args, 'out', 'reports/human-review.csv');
  const run = loadJsonFile<BenchmarkRun>(path.resolve(inPath));
  const headers = [
    'case_id',
    'config_id',
    'query',
    'expected_behavior',
    'answer',
    'citation_ids',
    'retrieved_ids',
    'automated_score',
    'retrieval_recall_at_k',
    'citation_recall',
    'citation_span_support',
    'weak_citation_span_ids',
    'hallucination_risk',
    'latency_ms',
    'estimated_cost_usd',
    'human_answer_correct_1_5',
    'human_grounded_1_5',
    'human_citation_accuracy_1_5',
    'human_hallucination_yes_no',
    'human_notes',
  ];
  const rows = [headers.map(csvCell).join(',')];
  const casesById = new Map(run.cases.map(testCase => [testCase.id, testCase]));
  const gradesByCaseConfig = new Map(
    run.grades.map(grade => [`${grade.caseId}:${grade.configId}`, grade]),
  );

  for (const answer of run.answers) {
    const testCase = casesById.get(answer.caseId);
    const grade = gradesByCaseConfig.get(`${answer.caseId}:${answer.configId}`);
    rows.push(
      [
        answer.caseId,
        answer.configId,
        answer.query,
        testCase?.expectedBehavior || '',
        answer.answer,
        answer.citations.map(citation => citation.meetingId).join(' '),
        answer.contexts.map(context => context.meetingId).join(' '),
        grade?.score ?? '',
        grade?.retrievalRecallAtK ?? '',
        grade?.citationRecall ?? '',
        grade?.citationSupport ?? '',
        grade?.poorCitationSpanIds.join(' ') ?? '',
        grade?.hallucinationRisk ?? '',
        answer.latencyMs,
        answer.metrics.estimatedCostUsd,
        '',
        '',
        '',
        '',
        '',
      ]
        .map(csvCell)
        .join(','),
    );
  }

  fs.mkdirSync(path.dirname(path.resolve(outPath)), {recursive: true});
  fs.writeFileSync(path.resolve(outPath), `${rows.join('\n')}\n`);
  console.log(`Wrote ${path.resolve(outPath)}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
