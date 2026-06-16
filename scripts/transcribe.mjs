import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import OpenAI from 'openai';

// ---------------------------------------------------------------------------
// Local audio transcription CLI.
//   npm run transcribe -- "<audioFile>" [--out <file>] [--model <id>]
//                          [--language <code>] [--prompt "<hint>"]
//
// Converts an audio file to text using OpenAI's transcription API, prints the
// transcript, and writes it next to the source file. Mirrors the env-loading
// pattern in scripts/audit-vector-pipeline.mjs (reads OPENAI_API_KEY from
// .env.local). No new dependencies — uses the already-installed `openai` SDK.
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = 'gpt-4o-transcribe';
const ALLOWED_MODELS = ['gpt-4o-transcribe', 'gpt-4o-mini-transcribe', 'whisper-1'];
const SUPPORTED_EXTENSIONS = ['m4a', 'mp3', 'mp4', 'wav', 'webm', 'ogg', 'oga', 'mpeg', 'mpga', 'flac'];
const MAX_BYTES = 25 * 1024 * 1024; // OpenAI hard limit: 25 MB

function parseDotEnv(text) {
  const env = {};
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

function extensionOf(fileName) {
  return fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
}

function usage() {
  return [
    'Usage:',
    '  npm run transcribe -- "<audioFile>" [--out <file>] [--model <id>] [--language <code>] [--prompt "<hint>"]',
    '',
    `Models: ${ALLOWED_MODELS.join(', ')} (default: ${DEFAULT_MODEL})`,
    `Formats: ${SUPPORTED_EXTENSIONS.join(', ')}`,
    'Limit: 25 MB per file. Larger/longer files need chunking (not supported in v1).',
    'Tip: gpt-4o-transcribe caps at ~25 min; for longer recordings use --model whisper-1.',
  ].join('\n');
}

async function run() {
  const cwd = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const input = args._[0];

  if (!input || args.help || args.h) {
    console.log(usage());
    process.exitCode = input ? 0 : 1;
    return;
  }

  // Resolve API key: .env.local first, then process.env.
  let fileEnv = {};
  try {
    fileEnv = parseDotEnv(await readFile(join(cwd, '.env.local'), 'utf8'));
  } catch {
    // .env.local is optional; fall back to the ambient environment.
  }
  const apiKey = process.env.OPENAI_API_KEY || fileEnv.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set. Add it to .env.local or the environment.');
  }

  const model = args.model || DEFAULT_MODEL;
  if (!ALLOWED_MODELS.includes(model)) {
    throw new Error(`Unknown model "${model}". Choose one of: ${ALLOWED_MODELS.join(', ')}.`);
  }

  // Validate the file before any network call.
  const ext = extensionOf(input);
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new Error(
      `Unsupported audio format ".${ext || '(none)'}". Supported: ${SUPPORTED_EXTENSIONS.join(', ')}.`
    );
  }

  let stats;
  try {
    stats = await stat(input);
  } catch {
    throw new Error(`File not found: ${input}`);
  }
  if (!stats.isFile()) {
    throw new Error(`Not a file: ${input}`);
  }
  if (stats.size > MAX_BYTES) {
    const mb = (stats.size / 1024 / 1024).toFixed(1);
    throw new Error(
      `File is ${mb} MB, over OpenAI's 25 MB limit. Compress or split it first ` +
        '(ffmpeg chunking is not supported in v1).'
    );
  }

  const minutes = stats.size / 1024 / 1024; // ~1 MB/min for compressed audio (rough)
  console.error(
    `Transcribing "${basename(input)}" with ${model}` +
      (args.language ? ` (language: ${args.language})` : '') +
      ` — ~${minutes.toFixed(0)} min estimated…`
  );

  const openai = new OpenAI({ apiKey });

  let transcript;
  try {
    transcript = await openai.audio.transcriptions.create({
      file: createReadStream(input),
      model,
      response_format: 'text',
      ...(args.language ? { language: String(args.language) } : {}),
      ...(args.prompt ? { prompt: String(args.prompt) } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/1500|duration|too long|length/i.test(message) && model !== 'whisper-1') {
      throw new Error(
        `${message}\n\nThis recording may exceed ${model}'s ~25 min cap. ` +
          'Re-run with: --model whisper-1'
      );
    }
    throw new Error(`Transcription failed: ${message}`);
  }

  // response_format 'text' returns a plain string.
  const text = typeof transcript === 'string' ? transcript : (transcript.text ?? '');

  const outPath = args.out ? String(args.out) : `${input}.txt`;
  await writeFile(outPath, text.trim() + '\n', 'utf8');

  // Transcript to stdout (pipe-friendly); status/log to stderr.
  process.stdout.write(text.trim() + '\n');
  console.error(`\nSaved transcript to: ${outPath}`);
}

run().catch((error) => {
  console.error(`\nError: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
