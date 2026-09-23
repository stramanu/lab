/** Minimal `--key value` / `--flag` argument parser shared by the CLI scripts. */
export function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const [key, inline] = a.slice(2).split('=', 2);
    if (inline !== undefined) out[key] = inline;
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) out[key] = argv[++i];
    else out[key] = 'true';
  }
  return out;
}

export function num(args: Record<string, string>, key: string): number | undefined {
  return args[key] === undefined ? undefined : Number(args[key]);
}
