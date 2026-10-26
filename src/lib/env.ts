import fs from 'fs';
import path from 'path';

export function loadLocalEnv(cwd = process.cwd()): void {
  for (const name of ['.env.local', '.env']) {
    const filePath = path.join(cwd, name);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const eq = trimmed.indexOf('=');
      if (eq === -1) {
        continue;
      }

      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

export function envPath(name: string, fallback: string): string {
  return process.env[name] || fallback;
}
