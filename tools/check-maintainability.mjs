import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const ignoredDirectories = new Set([
  '.git',
  'node_modules',
  'public'
]);

const ignoredFiles = new Set([
  '_multiconfig.yml',
  'check-maintainability.mjs',
  'db.json',
  'hexo-server.err.log',
  'hexo-server.log',
  'hexo-server.pid',
  'static-server.pid'
]);

const runtimeFilePatterns = [
  /^_config(?:\.[^.]+)?\.yml$/,
  /^package\.json$/,
  /^scripts\//,
  /^source\//
];

const forbidden = [
  {
    pattern: 'https://picbed.godboy.cc/',
    reason: 'expired image-bed domain; use the GitHub picbed CDN prefix'
  },
  {
    pattern: 'https://www.godboy.cc/',
    reason: 'expired canonical/custom domain; keep it only in docs/comments as a quick replacement'
  },
  {
    pattern: 'https://cdn1.tianli0.top/',
    reason: 'stale CDN mirror; use a current npm CDN or local asset'
  },
  {
    pattern: 'https://lf3-cdn-tos.bytecdntp.com/',
    reason: 'stale ByteDance CDN mirror; use a current npm CDN'
  },
  {
    pattern: 'https://lf6-cdn-tos.bytecdntp.com/',
    reason: 'stale ByteDance CDN mirror; use a current npm CDN'
  },
  {
    pattern: 'https://lf9-cdn-tos.bytecdntp.com/',
    reason: 'stale ByteDance CDN mirror; use a current npm CDN'
  }
];

const manualAction = [
  {
    pattern: 'https://twikoo.godboy.cc/',
    reason: 'Twikoo backend is tied to the expired custom domain and needs redeployment or a new envId'
  },
  {
    pattern: 'https://gitcalendar.fomal.cc/api?Creeper5261',
    reason: 'GitCalendar API is an external service and may need replacement if it stays unavailable'
  },
  {
    pattern: 'https://widget.qweather.net/simple/static/js/he-simple-common.js?v=2.0',
    reason: 'QWeather widget script is external and may need a new widget/key setup'
  }
];

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else if (entry.isFile() && !ignoredFiles.has(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function normalizeRelative(file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
}

function shouldScan(file) {
  return runtimeFilePatterns.some(pattern => pattern.test(file));
}

const files = (await walk(root))
  .map(file => ({ absolute: file, relative: normalizeRelative(file) }))
  .filter(file => shouldScan(file.relative));

const failures = [];
const warnings = [];

for (const file of files) {
  const rawText = await fs.readFile(file.absolute, 'utf8');
  const text = file.relative.endsWith('.yml')
    ? rawText.split(/\r?\n/).filter(line => !line.trimStart().startsWith('#')).join('\n')
    : rawText;

  for (const check of forbidden) {
    if (text.includes(check.pattern)) {
      failures.push({
        file: file.relative,
        pattern: check.pattern,
        reason: check.reason
      });
    }
  }

  for (const check of manualAction) {
    if (text.includes(check.pattern)) {
      warnings.push({
        file: file.relative,
        pattern: check.pattern,
        reason: check.reason
      });
    }
  }
}

const summary = {
  scannedFiles: files.length,
  failures,
  warnings,
  ok: failures.length === 0
};

console.log(JSON.stringify(summary, null, 2));

if (failures.length) process.exitCode = 1;
