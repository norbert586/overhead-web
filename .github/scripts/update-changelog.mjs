// Append a changelog entry for a merged PR, and cut its version.
//
// Inputs (env): PR_TITLE, PR_NUMBER, PR_URL, PR_LABELS (JSON array of label
// names, optional), GITHUB_OUTPUT (set by Actions; receives `version=`).
//
// Behaviour:
//   • Skips entries whose title starts with "Update CHANGELOG" (avoids
//     recording our own bot commits if a PR is ever opened from the bot).
//   • Every merged PR is a release. VERSION (repo root, semver) is bumped:
//       label major / breaking              → major (x.0.0)
//       label patch / fix / bug, or a title
//       starting Fix / Hotfix / Repair      → patch (x.y.Z)
//       anything else                       → minor (x.Y.0)
//     The app and the server read VERSION at build/start, so the site shows
//     the release it's running without anyone bumping it by hand.
//   • Groups bullets under a "## YYYY-MM-DD" heading. If today's heading
//     already exists, the new bullet is appended underneath it; otherwise
//     a new heading is inserted at the top of the entry list.

import fs from 'node:fs';
import path from 'node:path';

const CHANGELOG = path.resolve('CHANGELOG.md');
const VERSION_FILE = path.resolve('VERSION');

const title  = (process.env.PR_TITLE  ?? '').trim();
const number = (process.env.PR_NUMBER ?? '').trim();
const url    = (process.env.PR_URL    ?? '').trim();

if (!title || !number || !url) {
  console.error('Missing PR_TITLE / PR_NUMBER / PR_URL env vars');
  process.exit(1);
}

if (/^update changelog/i.test(title)) {
  console.log(`Skipping bot-style PR title: "${title}"`);
  process.exit(0);
}

let labels = [];
try { labels = JSON.parse(process.env.PR_LABELS || '[]').map((l) => String(l).toLowerCase()); } catch { /* none */ }

function nextVersion(current) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(current.trim());
  if (!m) throw new Error(`VERSION is not semver: "${current.trim()}"`);
  const [major, minor, patch] = m.slice(1).map(Number);
  if (labels.some((l) => l === 'major' || l === 'breaking')) return `${major + 1}.0.0`;
  if (labels.some((l) => l === 'patch' || l === 'fix' || l === 'bug') || /^(fix|hotfix|repair)\b/i.test(title)) {
    return `${major}.${minor}.${patch + 1}`;
  }
  return `${major}.${minor + 1}.0`;
}

const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

const existing = fs.existsSync(CHANGELOG) ? fs.readFileSync(CHANGELOG, 'utf8') : '';

const HEADER = [
  '# Changelog',
  '',
  'All notable changes to Overhead are tracked here.',
  'Entries are appended automatically when a pull request is merged into `main`.',
  '',
].join('\n');

let body = existing;
if (!body.startsWith('# Changelog')) {
  body = HEADER + body;
}

const lines = body.split('\n');

// Find the first "## " heading.
const firstHeadingIdx = lines.findIndex((l) => l.startsWith('## '));
const todayHeading = `## ${today}`;
const hasTodayHeading = firstHeadingIdx !== -1 && lines[firstHeadingIdx] === todayHeading;

const alreadyListed = lines.some((l) => l.startsWith('- ') && (l.includes(`(#${number})`) || l.includes(`/${number})`)));
if (alreadyListed) {
  console.log(`PR #${number} already in changelog — skipping.`);
  process.exit(0);
}

const version = nextVersion(fs.existsSync(VERSION_FILE) ? fs.readFileSync(VERSION_FILE, 'utf8') : '0.0.0');
const bullet = `- ${title} ([#${number}](${url})) · v${version}`;

if (hasTodayHeading) {
  // Insert bullet directly after today's heading, after any existing bullets.
  let insertAt = firstHeadingIdx + 1;
  // Skip the blank line that conventionally follows the heading.
  if (lines[insertAt] === '') insertAt++;
  // Walk past existing bullets.
  while (insertAt < lines.length && lines[insertAt].startsWith('- ')) insertAt++;
  lines.splice(insertAt, 0, bullet);
} else {
  // Insert a brand new heading + bullet.
  // Find where to insert: right before the first existing "## " heading,
  // or at the end of the file if there are none.
  const insertAt = firstHeadingIdx === -1 ? lines.length : firstHeadingIdx;
  const block = [todayHeading, '', bullet, ''];
  lines.splice(insertAt, 0, ...block);
}

let out = lines.join('\n');
if (!out.endsWith('\n')) out += '\n';

fs.writeFileSync(CHANGELOG, out);
fs.writeFileSync(VERSION_FILE, `${version}\n`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
console.log(`Added changelog entry for PR #${number}: "${title}" — v${version}`);
