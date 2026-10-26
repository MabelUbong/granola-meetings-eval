import path from 'path';
import {argString, parseArgs} from './args';
import {loadJsonFile, writeJsonFile} from '../lib/data';
import {redactRunForPublic} from '../lib/redactResults';
import {BenchmarkRun} from '../lib/types';

function main(): void {
  const args = parseArgs();
  const inPath = argString(args, 'in', 'reports/latest-results.json');
  const outPath = argString(args, 'out', 'public/results/latest-results.json');
  const run = loadJsonFile<BenchmarkRun>(path.resolve(inPath));
  const redactedRun = redactRunForPublic(run);
  writeJsonFile(path.resolve(outPath), redactedRun);
  console.log(`Wrote redacted public results to ${path.resolve(outPath)}`);
}

main();
