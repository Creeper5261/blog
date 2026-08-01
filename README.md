# DAT Blog

This repository contains DAT's recovered blog and the new Astro-based static build. The original Hexo + Butterfly source was lost, reconstructed, and then used as the visual baseline for the modern build path.

## Current Status

- Default framework: Astro
- Legacy baseline: Hexo `6.3.0` + `hexo-theme-butterfly` `4.10.0`
- Package manager: `pnpm@10.20.0`
- Default public URL: `https://creeper5261-github-io.vercel.app`
- Private source remote: `git@github.com:Creeper5261/blog.git`
- Public generated-output repository: `https://github.com/Creeper5261/Creeper5261.github.io`

The current `feature/astro-rewrite` branch serves sanitized legacy HTML through Astro to preserve the existing visual style while replacing the default Hexo build chain. Hexo remains available under `legacy:*` scripts as the visual baseline and rollback path.

## Repository And Deployment Model

Keep source and output split:

- `Creeper5261/blog` stays private and contains Astro/Hexo source, recovery scripts, tests, and service wiring.
- `Creeper5261/Creeper5261.github.io` stays public and receives generated static output only.
- Vercel should deploy from the public output repository if you want the old "only publish generated files" model.
- Giscus comments are bound to the public output repository's Discussions, not the private source repository.

The automated pipeline is:

```text
private source repo -> pnpm run check -> pnpm run build -> dist/ -> public output repo -> Vercel
```

`publish.yml` runs on pushes to `main`, checks the private source, builds `dist/`, syncs it into a checkout of `Creeper5261/Creeper5261.github.io`, and pushes only generated output. Vercel should stay attached to the public repository for the source-private deployment model.

`stats-backup.yml` runs daily, exports protected PV/UV data, uploads a private workflow artifact, and also commits the same JSON into the private `stats-backups` branch so the backup outlives artifact retention.

## URL Policy

Use a reachable stable URL first:

```yaml
url: https://creeper5261-github-io.vercel.app
```

Quick replacement candidates are documented in `_config.yml`:

- `https://creeper5261-github-io.vercel.app/` is currently reachable.
- `https://creeper5261.github.io/` returned GitHub Pages 404 during recovery on 2026-06-18; switch to it after Pages is enabled and deployed.
- `https://www.godboy.cc/` is the old custom domain. Keep it as a quick replacement only after DNS/TLS is restored.

Runtime source should not contain hard-coded `https://www.godboy.cc/` links. Use relative links for internal routes.

## Commands

Install dependencies:

```bash
pnpm install
```

Run maintainability checks:

```bash
pnpm run check
```

Generate the Astro site:

```bash
pnpm run build
```

Start local Astro dev server:

```bash
pnpm run server
```

Start the local-only writing client:

```bash
pnpm run writer
```

The writer opens a localhost-only visual console at `http://127.0.0.1:4126`. It can create front matter from a form, save Markdown into `source/_posts`, browse existing posts, show existing categories/tags, stage pasted or dragged images, and generate the exact publish command plan for the private-source pipeline.

Images are staged locally under `.local/writer-assets` before any picbed upload. The planned public picbed path is:

```text
img/posts/<category-1>/<category-2>/<post-filename>/<image-name>
```

If an article has no category, the writer uses `未分类`. If an image is not manually named, the writer uses `YYYYMMDD-HHmmss-001.ext` style names.

To upload staged images, clone `Creeper5261/picbed` locally and set:

```bash
PICBED_REPO_CHECKOUT=../picbed
```

The writer can then generate the picbed upload commands that add `img/posts`, commit, and push that checkout.

Publish a generated `dist/` directory into a checked-out public output repository:

```bash
PUBLIC_REPO_CHECKOUT=../public-output pnpm run publish:output
```

Export PV/UV statistics into `.local/stats-backups`:

```bash
STATS_BACKUP_URL=https://creeper5261-github-io.vercel.app/api/stats STATS_BACKUP_TOKEN=... pnpm run backup:stats
```

Run the old Hexo baseline:

```bash
pnpm run legacy:server
```

Create a visual report from screenshots already captured in `.local/visual-compare`:

```bash
pnpm run visual:report
```

Recovery-only tools from the original workspace live outside this repo in `../tools` and are not part of the normal build path.

Regenerate Astro legacy page fixtures from a freshly generated Hexo `public/` directory only when intentionally refreshing the recovered compatibility shell:

```bash
pnpm run recovery:prepare-legacy-pages
```

The normal `pnpm run build` path does not read from `public/`; `src/legacy/pages` is tracked source for the Astro compatibility layer.

## Environment Variables

Real service values must be configured through `.env`, Vercel Environment Variables, or another deployment platform. Use `.env.example` as the template.

The location and weather keys are server-only in the current Vercel deployment model. They are read by Vercel Functions under `/api/location` and `/api/weather`; generated public HTML intentionally leaves the old browser placeholders empty so keys do not get committed to `Creeper5261/Creeper5261.github.io`.

```text
PUBLIC_ALGOLIA_APP_ID
PUBLIC_ALGOLIA_SEARCH_KEY
PUBLIC_ALGOLIA_INDEX_NAME
PUBLIC_GISCUS_REPO
PUBLIC_GISCUS_REPO_ID
PUBLIC_GISCUS_CATEGORY
PUBLIC_GISCUS_CATEGORY_ID
PUBLIC_GISCUS_MAPPING
PUBLIC_TENCENT_MAP_KEY
PUBLIC_QWEATHER_KEY
PUBLIC_GAUD_MAP_KEY
PUBLIC_BAIDU_MAP_AK
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
UPSTASH_REDIS_REST_KV_REST_API_URL
UPSTASH_REDIS_REST_KV_REST_API_TOKEN
KV_REST_API_URL
KV_REST_API_TOKEN
STATS_HASH_SALT
STATS_BACKUP_TOKEN
STATS_BACKUP_URL
TENCENT_MAP_KEY
QWEATHER_KEY
WRITER_HOST
WRITER_PORT
PICBED_REPO_CHECKOUT
```

`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` and Vercel KV's `KV_REST_API_URL` / `KV_REST_API_TOKEN` are equivalent storage choices for `/api/stats`; set one pair in Vercel. Vercel's Upstash marketplace connector may create prefixed KV names such as `UPSTASH_REDIS_REST_KV_REST_API_URL` / `UPSTASH_REDIS_REST_KV_REST_API_TOKEN`; those are supported too. `STATS_HASH_SALT` is a private random string used to hash visitors for UV dedupe, and `STATS_BACKUP_TOKEN` protects the JSON export endpoint at `/api/stats?export=1`.

Do not commit real app keys, tokens, private endpoints, `.vercel/`, or files under `secrets/`.

`PICBED_REPO_CHECKOUT` is a local path, not a secret. It should point to a private local checkout of `Creeper5261/picbed` when using the writer's staged-image upload plan.

GitHub Actions secrets for repository-owned automation:

```text
PUBLIC_REPO_DEPLOY_KEY
STATS_BACKUP_URL
STATS_BACKUP_TOKEN
```

`PUBLIC_REPO_DEPLOY_KEY` is an SSH private deploy key with write access to `Creeper5261/Creeper5261.github.io`. Keep Vercel app keys, Redis/KV tokens, and map/weather keys in Vercel Environment Variables; the public output workflow should not need those private runtime values.

Vercel project variables configured on 2026-06-18:

- `PUBLIC_SITE_URL`
- `PUBLIC_ALGOLIA_APP_ID`
- `PUBLIC_ALGOLIA_SEARCH_KEY`
- `PUBLIC_ALGOLIA_INDEX_NAME`
- `PUBLIC_TENCENT_MAP_KEY`
- `PUBLIC_QWEATHER_KEY`
- `PUBLIC_GAUD_MAP_KEY`

`PUBLIC_BAIDU_MAP_AK` was not configured because no valid recovered Baidu browser key was found.

Giscus defaults are public repository identifiers and are safe to commit:

```text
PUBLIC_GISCUS_REPO=Creeper5261/Creeper5261.github.io
PUBLIC_GISCUS_REPO_ID=R_kgDOJjHleA
PUBLIC_GISCUS_CATEGORY=Announcements
PUBLIC_GISCUS_CATEGORY_ID=DIC_kwDOJjHleM4C_aiF
PUBLIC_GISCUS_MAPPING=pathname
```

## Runtime Services

- `source/js/comments-runtime.js` replaces the old Twikoo bootstrap with Giscus. It mounts into the recovered `#twikoo-wrap` container for visual compatibility.
- `tools/prepare-github-calendar.mjs` fetches GitHub's public contribution calendar during build and writes `.astro-static/data/github-calendar.json`, which Astro publishes as `/data/github-calendar.json`.
- `source/js/github-calendar.js` renders that local JSON into `#gitZone`, replacing the dead `gitcalendar.fomal.cc` API.
- `api/location.mjs` proxies Tencent Map IP location through Vercel Functions so the Tencent key stays in platform env.
- `api/weather.mjs` proxies QWeather now data through Vercel Functions so the weather key stays in platform env.
- `api/stats.mjs` records PV/UV counters through Upstash Redis or Vercel KV and can export a backup JSON with `STATS_BACKUP_TOKEN`.
- `source/js/stats-runtime.js` fills the recovered Busuanzi counter slots from `/api/stats` while keeping one anonymous visitor id in browser local storage.
- `source/js/service-fallbacks.js` remains a defensive layer so widgets do not stay blank forever.
- `tools/backup-stats.mjs` exports the protected stats JSON into timestamped local files; `.github/workflows/stats-backup.yml` uploads those files as private workflow artifacts and commits them to the private `stats-backups` branch every day.
- `tools/writer/server.mjs` starts a localhost-only writing client for Markdown validation and saving into `source/_posts`.
- `tools/blog-ops/posts.mjs`, `tools/blog-ops/assets.mjs`, and `tools/blog-ops/publish.mjs` provide reusable article, image, taxonomy, and publish-plan APIs for the writer UI and future AI/MCP integrations.
- `tools/publish-output.mjs` cleans and syncs generated `dist/` output into the public generated-output repository while preserving `.git` and `CNAME`.

- welcome/location falls back only when `/api/location` has no key or no response;
- PV/UV counters fall back to `--` if `/api/stats` has no configured storage or cannot respond;
- the weather clock first tries `/api/weather`, then falls back to a local time card;
- Giscus renders a clear setup/loading status only if the script cannot load;
- GitHub contribution calendar renders a clear status only if local data is unavailable.

These fallbacks do not restore historical Busuanzi UV/PV or old Twikoo comments. They only preserve a clean page while live services load.

## Asset Hosting

The expired image-bed domain `picbed.godboy.cc` was replaced with the GitHub picbed CDN:

```text
https://cdn.jsdelivr.net/gh/Creeper5261/picbed@main/
```

Source repository for assets:

```text
https://github.com/Creeper5261/picbed
```

Spot checks on 2026-06-18 confirmed image, PDF, font, and background paths under this prefix returned `200`.

## External Services

| Service | Location | Status | Action |
| --- | --- | --- | --- |
| Picbed images/PDF/font | Markdown, CSS, recovered injectors | Fixed to jsDelivr GitHub CDN | Keep `Creeper5261/picbed` paths stable. |
| jsDelivr npm CDN | Butterfly injected scripts | Fixed for APlayer, Vue, Element UI, SweetAlert2, WinBox, typed.js, Meting | No action now. |
| PV/UV statistics | `api/stats.mjs`, `source/js/stats-runtime.js` | Replaced old Busuanzi dependency with same-origin counters backed by Upstash Redis or Vercel KV | Configure storage env on Vercel, keep `STATS_BACKUP_TOKEN`, and export `/api/stats?export=1&token=...` for periodic backups. |
| Giscus comments | `source/js/comments-runtime.js` | Replaces Twikoo; bound to public `Creeper5261/Creeper5261.github.io` Discussions | Ensure the Giscus GitHub App is installed for the public repo. |
| GitHub contribution calendar | `tools/prepare-github-calendar.mjs`, `source/js/github-calendar.js` | Replaces GitCalendar with local build data | Build refreshes data from GitHub public contributions; cache/fallback is local. |
| QWeather widget / clock weather | `source/_data/recovered-injector.json` | Vercel key restored; widget/CDN may still fail; page has fallback | Recreate the QWeather widget/key if the old widget remains unavailable. |
| Tencent Map IP location | `PUBLIC_TENCENT_MAP_KEY` | Vercel key restored; page has fallback | Prefer a new domain-restricted browser key before public production use. |
| Algolia search | Astro env / recovered placeholders | Vercel variables restored | Verify index ownership and rebuild the search index when posts change. |
| QQ avatar API | `_config.butterfly.yml` social link | Previously failed during checks | Replace with a stable profile URL if it remains unavailable. |

## Notes On Lost Data

- Article `date` and `updated` values were recovered into Markdown front matter where available.
- Busuanzi historical UV/PV is not recoverable from static HTML or Hexo source alone. New PV/UV starts from the configured Upstash Redis or Vercel KV database and can be exported as JSON.
- Old Twikoo comment history is not recoverable unless the old Twikoo backend database still exists. New comments use Giscus Discussions in the public output repository.
- Vercel deployment snapshots can help recover generated assets and HTML, but not third-party service databases.

## Repository Hygiene

Do not commit generated or local files:

- `node_modules/`
- `public/`
- `dist/`
- `.astro/`
- `.astro-static/`
- `db.json`
- `_multiconfig.yml`
- `*.log`
- `*.pid`
- `.env*`
- `.vercel/`
- `secrets/`

The modern build source of truth is `astro.config.mjs`, `src/`, `source/`, `tools/`, `package.json`, and `pnpm-lock.yaml`. `src/legacy/pages` is tracked intentionally and should be updated only through `pnpm run recovery:prepare-legacy-pages` after a deliberate Hexo recovery refresh. `_config.yml` and `_config.butterfly.yml` remain for the legacy Hexo baseline.
