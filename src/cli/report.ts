import fs from 'fs';
import path from 'path';
import {argString, parseArgs} from './args';
import {loadJsonFile} from '../lib/data';
import {renderMarkdownReport} from '../lib/report';
import {BenchmarkRun} from '../lib/types';

async function main(): Promise<void> {
  const args = parseArgs();
  const inPath = argString(args, 'in', 'reports/latest-results.json');
  const outPath = argString(args, 'out', 'reports/benchmark-report.md');
  const run = loadJsonFile<BenchmarkRun>(path.resolve(inPath));
  fs.mkdirSync(path.dirname(path.resolve(outPath)), {recursive: true});
  fs.writeFileSync(path.resolve(outPath), renderMarkdownReport(run));
  console.log(`Wrote ${path.resolve(outPath)}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
