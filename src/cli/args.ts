export function parseArgs(argv = process.argv.slice(2)): Map<string, string | boolean> {
  const args = new Map<string, string | boolean>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const withoutPrefix = token.slice(2);
    const eq = withoutPrefix.indexOf('=');
    if (eq !== -1) {
      args.set(withoutPrefix.slice(0, eq), withoutPrefix.slice(eq + 1));
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args.set(withoutPrefix, next);
      index += 1;
    } else {
      args.set(withoutPrefix, true);
    }
  }
  return args;
}

export function argString(args: Map<string, string | boolean>, name: string, fallback: string): string {
  const value = args.get(name);
  return typeof value === 'string' ? value : fallback;
}

export function argBoolean(args: Map<string, string | boolean>, name: string): boolean {
  return args.get(name) === true || args.get(name) === 'true';
}

export function argNumber(args: Map<string, string | boolean>, name: string, fallback: number): number {
  const value = Number(args.get(name));
  return Number.isFinite(value) ? value : fallback;
}
