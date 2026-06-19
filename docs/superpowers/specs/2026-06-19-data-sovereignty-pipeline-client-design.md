# Data Sovereignty Pipeline Client Design

## Goal

Keep the blog source private, publish only generated output, back up runtime-owned statistics, and provide a local-only writing client for the site owner.

## Architecture

The private repository remains the source of truth. GitHub Actions builds the Astro site, then publishes `dist/` to the public `Creeper5261/Creeper5261.github.io` repository. Vercel can stay attached to the public repository, so the deployed project never needs the private source tree.

Runtime state is kept outside the generated site. PV/UV counters stay in Upstash Redis or Vercel KV and are exported by a scheduled workflow through `/api/stats?export=1` with `STATS_BACKUP_TOKEN`. Backups are kept as private workflow artifacts and can also be committed to an optional private backup branch later.

The writer client is a local Node server bound to `127.0.0.1`. It validates Markdown front matter, prevents path traversal, writes posts into `source/_posts`, and exposes a small browser UI for the owner. It does not provide public authentication because it is not exposed publicly.

## Components

- `tools/publish-output.mjs`: copies generated output into a clean checkout of the public output repository while preserving only explicitly allowed host metadata.
- `tools/backup-stats.mjs`: calls the protected stats export endpoint and writes timestamped JSON under a local backup directory.
- `tools/writer/core.mjs`: validates Markdown documents, normalizes filenames, extracts front matter, and writes posts safely.
- `tools/writer/server.mjs`: serves a local-only HTML UI and JSON endpoints for validation and saving.
- `.github/workflows/publish.yml`: checks, builds, and publishes `dist/` to the public repository using GitHub Secrets.
- `.github/workflows/stats-backup.yml`: runs on a schedule and stores exported stats as private artifacts.

## Data And Secrets

Required GitHub Secrets:

- `PUBLIC_REPO_DEPLOY_KEY`: SSH private key with write access to `Creeper5261/Creeper5261.github.io`.
- `STATS_BACKUP_URL`: deployed site stats endpoint, for example `https://creeper5261-github-io.vercel.app/api/stats`.
- `STATS_BACKUP_TOKEN`: private token accepted by `/api/stats?export=1`.

Existing runtime app keys remain in Vercel Environment Variables or local `.env` only. Generated output must not include real Tencent, QWeather, Gaode, Baidu, Redis, KV, or backup token values.

## Testing

The feature is verified through Node tests for publish cleaning rules, stats backup behavior, writer validation and safe writes, workflow presence, package scripts, `pnpm run check`, and `pnpm run build`.
