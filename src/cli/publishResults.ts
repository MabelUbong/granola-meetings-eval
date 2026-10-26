import path from 'path';
import {argString, parseArgs} from './args';
import {loadJsonFile, writeJsonFile} from '../lib/data';
import {BenchmarkRun} from '../lib/types';

function main(): void {
  const args = parseArgs();
  const inPath = argString(args, 'in', 'reports/latest-results.json');
  const outPath = argString(args, 'out', 'public/results/latest-results.json');
  const run = loadJsonFile<BenchmarkRun>(path.resolve(inPath));
  writeJsonFile(path.resolve(outPath), run);
  console.log(`Wrote full public results to ${path.resolve(outPath)}`);
}

main();
