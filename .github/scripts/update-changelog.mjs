// Append a changelog entry for a merged PR.
//
// Inputs (env): PR_TITLE, PR_NUMBER, PR_URL
//
// Behaviour:
//   • Skips entries whose title starts with "Update CHANGELOG" (avoids
//     recording our own bot commits if a PR is ever opened from the bot).
//   • Groups bullets under a "## YYYY-MM-DD" heading. If today's heading
//     already exists, the new bullet is appended underneath it; otherwise
//     a new heading is inserted at the top of the entry list.

import fs from 'node:fs';
import path from 'node:path';

const CHANGELOG = path.resolve('CHANGELOG.md');

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

const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const bullet = `- ${title} ([#${number}](${url}))`;

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

if (hasTodayHeading) {
  // Insert bullet directly after today's heading, after any existing bullets.
  let insertAt = firstHeadingIdx + 1;
  // Skip the blank line that conventionally follows the heading.
  if (lines[insertAt] === '') insertAt++;
  // Walk past existing bullets.
  while (insertAt < lines.length && lines[insertAt].startsWith('- ')) {
    if (lines[insertAt].includes(`(#${number})`) || lines[insertAt].includes(`/${number})`)) {
      console.log(`PR #${number} already in changelog — skipping.`);
      process.exit(0);
    }
    insertAt++;
  }
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
console.log(`Added changelog entry for PR #${number}: "${title}"`);
