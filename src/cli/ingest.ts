import path from 'path';
import {argString, parseArgs} from './args';
import {datasetStats, mergeMeetings, writeJsonFile} from '../lib/data';
import {envPath, loadLocalEnv} from '../lib/env';

async function main(): Promise<void> {
  loadLocalEnv();
  const args = parseArgs();
  const transcriptsPath = argString(
    args,
    'transcripts',
    envPath('TRANSCRIPTS_PATH', '/tmp/vscode-paste/2026-10-25T14-15-28_86f275_transcripts.json'),
  );
  const metadataPath = argString(
    args,
    'metadata',
    envPath('METADATA_PATH', '/tmp/vscode-paste/2026-10-25T14-15-38_124e8d_data.json'),
  );
  const outPath = argString(args, 'out', envPath('PROCESSED_MEETINGS_PATH', 'data/processed/meetings.json'));

  const meetings = mergeMeetings(transcriptsPath, metadataPath);
  writeJsonFile(path.resolve(outPath), meetings);
  const stats = datasetStats(meetings);
  console.log(
    `Ingested ${stats.meetingCount} meetings (${stats.transcriptCount} transcripts) from ${stats.dateRange.min} to ${stats.dateRange.max}.`,
  );
  console.log(`Wrote ${path.resolve(outPath)}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
