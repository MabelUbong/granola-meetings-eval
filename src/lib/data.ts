import fs from 'fs';
import path from 'path';
import {Meeting} from './types';
import {normalizeWhitespace} from './text';

type RawTranscript = {
  meeting_id: string;
  transcript?: string;
};

type RawMetadata = {
  id?: string;
  title?: string;
  created_at?: string;
  list_titles?: string[];
  content?: string;
  people?: unknown;
};

function collectNames(value: unknown, names = new Set<string>()): Set<string> {
  if (!value || typeof value !== 'object') {
    return names;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectNames(item, names);
    }
    return names;
  }

  const record = value as Record<string, unknown>;
  for (const key of ['name', 'fullName', 'givenName', 'familyName', 'email']) {
    const maybe = record[key];
    if (typeof maybe === 'string' && maybe.trim()) {
      names.add(maybe.trim());
    }
  }

  for (const child of Object.values(record)) {
    collectNames(child, names);
  }

  return names;
}

export function loadJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

export function writeJsonFile(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

export function mergeMeetings(transcriptsPath: string, metadataPath: string): Meeting[] {
  const transcripts = loadJsonFile<RawTranscript[]>(transcriptsPath);
  const metadataObject = loadJsonFile<Record<string, RawMetadata>>(metadataPath);

  const transcriptById = new Map<string, string>();
  for (const transcript of transcripts) {
    if (transcript.meeting_id) {
      transcriptById.set(transcript.meeting_id, transcript.transcript || '');
    }
  }

  const meetings: Meeting[] = [];
  for (const [key, metadata] of Object.entries(metadataObject)) {
    if (key === '_metadata' || !metadata || !metadata.id) {
      continue;
    }

    const transcript = transcriptById.get(metadata.id) || '';
    meetings.push({
      id: metadata.id,
      title: normalizeWhitespace(metadata.title || 'Untitled meeting'),
      createdAt: metadata.created_at || '',
      listTitles: Array.isArray(metadata.list_titles) ? metadata.list_titles : [],
      people: Array.from(collectNames(metadata.people)).slice(0, 24),
      notes: metadata.content || '',
      transcript,
    });
  }

  return meetings.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function loadMeetings(filePath: string): Meeting[] {
  return loadJsonFile<Meeting[]>(filePath);
}

export function datasetStats(meetings: Meeting[]) {
  const dates = meetings.map(meeting => meeting.createdAt).filter(Boolean).sort();
  return {
    meetingCount: meetings.length,
    transcriptCount: meetings.filter(meeting => meeting.transcript.trim()).length,
    dateRange: {
      min: dates[0] || '',
      max: dates[dates.length - 1] || '',
    },
  };
}
