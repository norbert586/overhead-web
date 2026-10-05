import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Which build is running? The first question in any production incident, and
// one that used to need SSH. Read once at startup from the deploy checkout
// (the server runs straight from a git clone), with GIT_SHA as an override
// for environments without one. `version` is the release people see (repo
// root VERSION, bumped by the changelog bot on every merge); `commit` is the
// exact build.

const REPO_ROOT = path.resolve(__dirname, '../..');

function git(args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, timeout: 2_000, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim() || null;
  } catch {
    return null;
  }
}

function release(): string {
  try {
    return fs.readFileSync(path.join(REPO_ROOT, 'VERSION'), 'utf8').trim() || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const VERSION = {
  version: release(),
  commit: process.env.GIT_SHA ?? git(['rev-parse', '--short', 'HEAD']) ?? 'unknown',
  committedAt: git(['log', '-1', '--format=%cI']),
  startedAt: new Date().toISOString(),
  node: process.version,
};
