import { promises as fs } from 'node:fs';
import crypto from 'node:crypto';
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
  'recovered-injector.json',
  'recovered-shell.json',
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
  },
  {
    pattern: 'https://twikoo.godboy.cc/',
    reason: 'Twikoo has been replaced by Giscus; legacy backend URLs must not be loaded at runtime'
  },
  {
    pattern: 'https://gitcalendar.fomal.cc/api?Creeper5261',
    reason: 'GitCalendar has been replaced by the local GitHub contribution calendar data'
  }
];

const forbiddenFingerprints = [
  {
    sha256: 'd3a953f706e7aa92881591bea296777a10b903c53efb6b92ddf908c6c5f6b1f5',
    length: 10,
    reason: 'Algolia app id must be provided through PUBLIC_ALGOLIA_APP_ID'
  },
  {
    sha256: '45b88f0b9726c4048327ea6cafab9be0848081ec63c68a84d07d4031b4a43a37',
    length: 32,
    reason: 'Algolia search key must be provided through PUBLIC_ALGOLIA_SEARCH_KEY'
  },
  {
    sha256: '8dc0ebd87be9f6ce58573a6e594e4185b15d0ead15106ba9bf2c052d5f6dbd18',
    length: 35,
    reason: 'Tencent Map browser key must be provided through PUBLIC_TENCENT_MAP_KEY'
  },
  {
    sha256: 'cc6d148c73b804111f9f5923a2a71d7a41008d9dc7ba89a72b71b1ee3c4f2f09',
    length: 32,
    reason: 'QWeather key must be provided through PUBLIC_QWEATHER_KEY'
  },
  {
    sha256: 'a68d297eb36f39e555ab44eb144af3f1fa4dac9d487ccc0751db6edfd76ccc75',
    length: 32,
    reason: 'Gaode Map key must be provided through PUBLIC_GAUD_MAP_KEY'
  }
];

const manualAction = [
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

const forbiddenFingerprintsByLength = forbiddenFingerprints.reduce((groups, check) => {
  if (!groups.has(check.length)) groups.set(check.length, []);
  groups.get(check.length).push(check);
  return groups;
}, new Map());

function containsForbiddenFingerprint(text, check) {
  if (text.length < check.length) return false;

  const candidatePattern = /[A-Za-z0-9-]{10,64}/g;
  let match;

  while ((match = candidatePattern.exec(text)) !== null) {
    const candidates = forbiddenFingerprintsByLength.get(match[0].length);
    if (!candidates) continue;
    if (candidates.some(candidate => candidate.sha256 === check.sha256) && sha256(match[0]) === check.sha256) return true;
  }

  return false;
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

  for (const check of forbiddenFingerprints) {
    if (containsForbiddenFingerprint(text, check)) {
      failures.push({
        file: file.relative,
        pattern: `sha256:${check.sha256}`,
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
