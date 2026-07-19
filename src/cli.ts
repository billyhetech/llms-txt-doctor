#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { checkSite } from './check.js';
import { generateLlmsTxt } from './generate.js';
import type { CheckIssue } from './types.js';

const VERSION = '0.1.0';

const HELP = `llms-txt-doctor — check and generate llms.txt files

Usage:
  llms-txt-doctor check <url> [options]      Check a site's existing llms.txt
  llms-txt-doctor generate <url> [options]   Generate llms.txt for a site
  llms-txt-doctor <url>                      Shorthand for check

Generate options:
  --out <file>          Output path (default: llms.txt; "-" for stdout)
  --max-pages <n>       Max pages to include (default: 50)
  --concurrency <n>     Parallel fetches (default: 5)
  --title <text>        Override the site title
  --description <text>  Override the summary line
  --include <prefix>    Only paths with this prefix (repeatable)
  --exclude <prefix>    Skip paths with this prefix (repeatable)
  --all                 Keep auth/pagination pages skipped by default

Check options:
  --max-links <n>       Max links to probe for liveness (default: 20)
  --json                Machine-readable output

Common:
  -q, --quiet           No progress output
  -h, --help            Show this help
  -v, --version         Show version

Examples:
  npx llms-txt-doctor generate example.com
  npx llms-txt-doctor check example.com
`;

const VALUE_FLAGS = new Set([
  'out',
  'max-pages',
  'concurrency',
  'title',
  'description',
  'include',
  'exclude',
  'max-links',
]);
const LIST_FLAGS = new Set(['include', 'exclude']);

interface ParsedArgs {
  positional: string[];
  flags: Map<string, string | boolean | string[]>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | boolean | string[]>();
  const setFlag = (key: string, value: string | boolean) => {
    if (LIST_FLAGS.has(key)) {
      const existing = (flags.get(key) as string[] | undefined) ?? [];
      existing.push(String(value));
      flags.set(key, existing);
    } else {
      flags.set(key, value);
    }
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === '-h') setFlag('help', true);
    else if (arg === '-v') setFlag('version', true);
    else if (arg === '-q') setFlag('quiet', true);
    else if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        setFlag(arg.slice(2, eq), arg.slice(eq + 1));
      } else {
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (VALUE_FLAGS.has(key) && next !== undefined && (next === '-' || !next.startsWith('-'))) {
          setFlag(key, next);
          i++;
        } else {
          setFlag(key, true);
        }
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function intFlag(flags: ParsedArgs['flags'], key: string): number | undefined {
  const raw = flags.get(key);
  if (raw === undefined) return undefined;
  const value = Number.parseInt(String(raw), 10);
  if (Number.isNaN(value) || value <= 0) {
    console.error(`Invalid --${key}: ${String(raw)}`);
    process.exit(1);
  }
  return value;
}

const ICONS: Record<CheckIssue['level'], string> = {
  ok: '\x1b[32m✓\x1b[0m',
  info: '\x1b[36mℹ\x1b[0m',
  warn: '\x1b[33m⚠\x1b[0m',
  fail: '\x1b[31m✗\x1b[0m',
};

async function main(): Promise<void> {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.has('version')) {
    console.log(VERSION);
    return;
  }
  if (flags.has('help') || positional.length === 0) {
    console.log(HELP);
    process.exitCode = positional.length === 0 && !flags.has('help') ? 1 : 0;
    return;
  }

  const quiet = flags.has('quiet');
  const log = quiet ? () => {} : (message: string) => console.error(message);

  let command = positional[0] as string;
  let url = positional[1];
  if (command !== 'generate' && command !== 'check') {
    url = command;
    command = 'check';
  }
  if (!url) {
    console.error('Missing <url>. See llms-txt-doctor --help');
    process.exit(1);
  }

  if (command === 'generate') {
    const result = await generateLlmsTxt({
      url,
      maxPages: intFlag(flags, 'max-pages'),
      concurrency: intFlag(flags, 'concurrency'),
      title: flags.get('title') as string | undefined,
      description: flags.get('description') as string | undefined,
      include: flags.get('include') as string[] | undefined,
      exclude: flags.get('exclude') as string[] | undefined,
      all: flags.has('all'),
      log,
    });
    const out = (flags.get('out') as string | undefined) ?? 'llms.txt';
    if (out === '-') {
      console.log(result.content);
    } else {
      await writeFile(out, result.content, 'utf8');
      log('');
      log(
        `Wrote ${out}: ${result.pageCount} pages in ${result.sectionCount} sections (${result.usedSitemap ? 'from sitemap' : 'crawled from homepage'})`,
      );
      log(`Next: deploy it at /llms.txt, then run \`llms-txt-doctor check <url>\``);
    }
    return;
  }

  const result = await checkSite({ url, maxLinks: intFlag(flags, 'max-links'), log });
  if (flags.has('json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`\nllms.txt check — ${result.siteUrl}\n`);
    for (const issue of result.issues) {
      console.log(`  ${ICONS[issue.level]} ${issue.message}`);
    }
    const fails = result.issues.filter((i) => i.level === 'fail').length;
    const warns = result.issues.filter((i) => i.level === 'warn').length;
    console.log('');
    if (fails === 0 && warns === 0) console.log('  All checks passed.');
    else console.log(`  ${fails} failed, ${warns} warning(s)`);
    if (!result.found) {
      console.log(`  Generate one: npx llms-txt-doctor generate ${result.siteUrl}`);
    }
  }
  if (result.issues.some((i) => i.level === 'fail')) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
