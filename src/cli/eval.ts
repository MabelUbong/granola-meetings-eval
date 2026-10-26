import path from 'path';
import {argBoolean, argString, parseArgs} from './args';
import {answerCase} from '../lib/answer';
import {getConfigs} from '../lib/configs';
import {datasetStats, loadJsonFile, loadMeetings, writeJsonFile} from '../lib/data';
import {loadLocalEnv} from '../lib/env';
import {gradeAnswer, summarizeGrades} from '../lib/grade';
import {judgeAnswerWithOpenAI} from '../lib/llmJudge';
import {estimateEmbeddingCostUsd, estimateTokens, roundUsd} from '../lib/metrics';
import {retrieve} from '../lib/retrieval';
import {retrieveWithOpenAIEmbeddings} from '../lib/semanticRetrieval';
import {containsTemporalIntent} from '../lib/text';
import {AgentAnswer, BenchmarkRun, CaseGrade, EvalCase} from '../lib/types';

async function main(): Promise<void> {
  loadLocalEnv();
  const args = parseArgs();
  const meetingsPath = argString(args, 'meetings', 'data/processed/meetings.json');
  const evalsPath = argString(args, 'evals', 'evals/granola_meetings_eval.json');
  const outPath = argString(args, 'out', 'reports/latest-results.json');
  const publicOutPath = argString(args, 'public-out', 'public/results/latest-results.json');
  const selectedConfig = argString(args, 'config', 'all');
  const useLlm = argBoolean(args, 'llm');
  const includeOpenAI = argBoolean(args, 'include-openai');
  const useJudge = argBoolean(args, 'judge');

  const meetings = loadMeetings(path.resolve(meetingsPath));
  const cases = loadJsonFile<EvalCase[]>(path.resolve(evalsPath));
  const configs = getConfigs(selectedConfig, includeOpenAI);
  if (configs.length === 0) {
    throw new Error(`No harness configs matched ${selectedConfig}`);
  }

  const answers: AgentAnswer[] = [];
  const grades: CaseGrade[] = [];

  for (const config of configs) {
    for (const testCase of cases) {
      const interpretationStarted = Date.now();
      const interpretationStep = {
        stepId: `${testCase.id}:${config.id}:interpret`,
        name: 'interpret_query',
        kind: 'interpretation' as const,
        timestamp: new Date().toISOString(),
        latencyMs: Date.now() - interpretationStarted,
        success: true,
        input: {
          query: testCase.query,
          configId: config.id,
        },
        output: {
          category: testCase.category,
          difficulty: testCase.difficulty,
          temporalIntent: containsTemporalIntent(testCase.query),
          expectedRetrievalShape:
            testCase.requiredEvidence.length > 1 ? 'multi_meeting' : 'single_or_latest_meeting',
        },
      };

      const retrievalStarted = Date.now();
      const contexts =
        config.retrievalStrategy === 'openai_embeddings'
          ? await retrieveWithOpenAIEmbeddings(testCase.query, meetings, config)
          : retrieve(testCase.query, meetings, config);
      const retrievalLatencyMs = Date.now() - retrievalStarted;
      const retrievalStep = {
        stepId: `${testCase.id}:${config.id}:retrieve`,
        name: 'retrieve_context',
        kind: 'retrieval' as const,
        timestamp: new Date().toISOString(),
        latencyMs: retrievalLatencyMs,
        success: contexts.length > 0,
        tool:
          config.retrievalStrategy === 'openai_embeddings'
            ? 'bm25_candidates_openai_embedding_rerank'
            : 'local_bm25_retrieve',
        input: {
          source: config.source,
          retrievalStrategy: config.retrievalStrategy,
          embeddingModel: config.embeddingModel,
          candidatePool: config.candidatePool,
          topK: config.topK,
          maxDocsPerMeeting: config.maxDocsPerMeeting,
          contextCharBudget: config.contextCharBudget,
        },
        output: {
          contextCount: contexts.length,
          meetingIds: contexts.map(context => context.meetingId),
          topScores: contexts.slice(0, 5).map(context => context.score),
          kinds: contexts.map(context => context.kind),
          embeddingTokensEstimate:
            config.retrievalStrategy === 'openai_embeddings'
              ? estimateTokens(testCase.query) +
                Math.max(contexts.length, config.candidatePool || 0) * config.transcriptChunkWords
              : 0,
        },
      };

      const shouldUseLlm = useLlm || config.answerStrategy === 'openai';
      const answer = await answerCase(testCase, config, contexts, shouldUseLlm, [
        interpretationStep,
        retrievalStep,
      ]);
      const embeddingTokensEstimate = Number(retrievalStep.output.embeddingTokensEstimate || 0);
      answer.metrics.retrievalLatencyMs = retrievalLatencyMs;
      answer.metrics.embeddingTokensEstimate = embeddingTokensEstimate;
      answer.metrics.totalTokensEstimate += embeddingTokensEstimate;
      answer.metrics.estimatedCostUsd = roundUsd(
        answer.metrics.estimatedCostUsd +
          (config.retrievalStrategy === 'openai_embeddings'
            ? estimateEmbeddingCostUsd(embeddingTokensEstimate)
            : 0),
      );
      answer.latencyMs += retrievalLatencyMs + interpretationStep.latencyMs;
      const judgeResult = useJudge ? await judgeAnswerWithOpenAI(testCase, answer) : undefined;
      if (judgeResult) {
        answer.steps.push(judgeResult.step);
      }
      answers.push(answer);
      grades.push(gradeAnswer(testCase, answer, judgeResult?.judge));
    }
  }

  const labelsByConfig = new Map(configs.map(config => [config.id, config.label]));
  const run: BenchmarkRun = {
    generatedAt: new Date().toISOString(),
    dataset: datasetStats(meetings),
    configs,
    cases,
    answers,
    grades,
    summaries: summarizeGrades(grades, answers, labelsByConfig),
  };

  writeJsonFile(path.resolve(outPath), run);
  writeJsonFile(path.resolve(publicOutPath), run);

  console.log(`Evaluated ${cases.length} cases across ${configs.length} configs.`);
  for (const summary of run.summaries) {
    console.log(
      `${summary.label}: score=${summary.averageScore.toFixed(3)} evidence=${summary.evidenceRecall.toFixed(
        3,
      )} terms=${summary.expectedTermCoverage.toFixed(3)} latency=${summary.latencyMs.toFixed(0)}ms`,
    );
  }
  console.log(`Wrote ${path.resolve(outPath)}`);
  console.log(`Wrote ${path.resolve(publicOutPath)}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
