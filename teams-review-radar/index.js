#!/usr/bin/env node
/**
 * Teams Review Radar — turns a Graph channel-message dump into a list of PR review
 * requests that have not been approved yet.
 *
 * Usage:
 *   node index.js --input <messages.json> [--out out/dashboard.html] [--json] [--all]
 */

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { parseArgs } from 'node:util';

import { parseMessages } from './src/parse.js';
import { classify } from './src/classify.js';
import { renderHtml } from './src/render.js';

const DEFAULT_CONFIG = 'config.json';
const DEFAULT_OUTPUT = 'out/dashboard.html';

/** `~` is not expanded by the shell when the path comes out of a JSON config file. */
function expandHome(path) {
  return path?.startsWith('~/') ? resolve(homedir(), path.slice(2)) : path;
}

async function readJson(path) {
  const raw = await readFile(path, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (cause) {
    throw new Error(`${path} is not valid JSON: ${cause.message}`);
  }
}

async function loadConfig(path, { explicit }) {
  try {
    return await readJson(path);
  } catch (error) {
    // A missing default config is fine — CLI flags alone are enough to run.
    if (error.code === 'ENOENT' && !explicit) return {};
    throw error;
  }
}

function printText(result) {
  const line = (item) =>
    `  ${String(item.ageMs == null ? '?' : Math.floor(item.ageMs / 86400000) + 'd').padStart(5)}  ` +
    `${(item.author ?? 'unknown').padEnd(22).slice(0, 22)}  ` +
    `${item.text.replace(/\s+/g, ' ').slice(0, 70)}`;

  console.log(`\nUnclaimed (${result.open.length}) — no reactions at all`);
  console.log(result.open.length ? result.open.map(line).join('\n') : '  none');
  console.log(`\nIn review (${result.inReview.length}) — has 👀 but no ✅`);
  console.log(result.inReview.length ? result.inReview.map(line).join('\n') : '  none');
  console.log(`\n${result.approvedCount} approved · ${result.skippedNonPr} skipped as non-PR\n`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: 'string', short: 'i' },
      out: { type: 'string', short: 'o' },
      config: { type: 'string', short: 'c' },
      json: { type: 'boolean', default: false },
      text: { type: 'boolean', default: false },
      all: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help) {
    console.log(`teams-review-radar

  --input,  -i  Graph messages JSON dumped by the Power Automate flow (required)
  --out,    -o  HTML output path (default ${DEFAULT_OUTPUT})
  --config, -c  config file (default ${DEFAULT_CONFIG})
  --json        print normalized JSON instead of writing HTML
  --text        print a plain-text summary instead of writing HTML
  --all         ignore requirePrMatch and include every message
  --help,   -h  this message
`);
    return;
  }

  const configPath = values.config ?? DEFAULT_CONFIG;
  const config = await loadConfig(configPath, { explicit: Boolean(values.config) });

  const inputPath = expandHome(values.input ?? config.inputPath);
  if (!inputPath) {
    throw new Error('No input file. Pass --input <path> or set "inputPath" in config.json.');
  }

  const payload = await readJson(inputPath);
  const items = parseMessages(payload);
  const result = classify(items, config, { includeNonPr: values.all });

  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (values.text) {
    printText(result);
    return;
  }

  // The flow overwrites the dump on each run, so its mtime is when the data was fetched.
  const dataAsOf = await stat(inputPath).then(
    (info) => info.mtime.toISOString(),
    () => 'unknown',
  );

  const outputPath = values.out ?? expandHome(config.outputPath) ?? DEFAULT_OUTPUT;
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await writeFile(outputPath, renderHtml(result, { dataAsOf, sourcePath: inputPath }), 'utf8');

  console.log(
    `${result.open.length} unclaimed · ${result.inReview.length} in review · ` +
      `${result.approvedCount} approved  →  ${outputPath}`,
  );
}

main().catch((error) => {
  console.error(`error: ${error.message}`);
  process.exitCode = 1;
});
