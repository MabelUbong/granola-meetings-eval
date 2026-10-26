import path from 'path';
import {argNumber, argString, parseArgs} from './args';
import {loadJsonFile} from '../lib/data';
import {BenchmarkRun} from '../lib/types';

async function main(): Promise<void> {
  const args = parseArgs();
  const inPath = argString(args, 'in', 'reports/latest-results.json');
  const minRecall = argNumber(args, 'min-recall', 0.75);
  const minCitationSupport = argNumber(args, 'min-citation-support', 0.3);
  const minModelCitationSupport = argNumber(args, 'min-model-citation-support', 0.25);
  const maxHallucination = argNumber(args, 'max-hallucination', 0.25);
  const maxLatencyMs = argNumber(args, 'max-latency-ms', 15000);
  const maxRunCostUsd = argNumber(args, 'max-run-cost-usd', 2);
  const run = loadJsonFile<BenchmarkRun>(path.resolve(inPath));
  const configsById = new Map(run.configs.map(config => [config.id, config]));

  const failures: string[] = [];
  for (const summary of run.summaries) {
    if (summary.retrievalRecallAtK < minRecall) {
      failures.push(`${summary.configId} recall@k ${summary.retrievalRecallAtK} < ${minRecall}`);
    }
    const config = configsById.get(summary.configId);
    const citationSupportThreshold =
      config?.answerStrategy === 'openai' ? minModelCitationSupport : minCitationSupport;
    if (summary.citationSupport < citationSupportThreshold) {
      failures.push(
        `${summary.configId} citation support ${summary.citationSupport} < ${citationSupportThreshold}`,
      );
    }
    if (summary.hallucinationRate > maxHallucination) {
      failures.push(`${summary.configId} hallucination ${summary.hallucinationRate} > ${maxHallucination}`);
    }
    if (summary.latencyMs > maxLatencyMs) {
      failures.push(`${summary.configId} latency ${summary.latencyMs}ms > ${maxLatencyMs}ms`);
    }
    if (summary.estimatedCostUsd > maxRunCostUsd) {
      failures.push(`${summary.configId} cost $${summary.estimatedCostUsd} > $${maxRunCostUsd}`);
    }
  }

  if (failures.length > 0) {
    console.error(`Regression check failed:\n${failures.map(failure => `- ${failure}`).join('\n')}`);
    process.exit(1);
  }

  console.log(
    `Regression check passed for ${run.summaries.length} configs: recall>=${minRecall}, citationSupport>=${minCitationSupport} local / >=${minModelCitationSupport} model-backed, hallucination<=${maxHallucination}, latency<=${maxLatencyMs}ms, cost<=${maxRunCostUsd}.`,
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
