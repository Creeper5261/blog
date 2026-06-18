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
```

Do not commit real app keys, tokens, private endpoints, `.vercel/`, or files under `secrets/`.

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
- `source/js/service-fallbacks.js` remains a defensive layer so widgets do not stay blank forever.

- welcome/location falls back when Tencent Map has no key or no response;
- Busuanzi PV/UV counters fall back to `--` if the service stalls;
- the weather clock falls back to a local time card;
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
| Busuanzi PV/UV | Butterfly `busuanzi` | Frontend script reachable | Historical UV/PV cannot be restored from source; only the live Busuanzi service can provide current counters. |
| Giscus comments | `source/js/comments-runtime.js` | Replaces Twikoo; bound to public `Creeper5261/Creeper5261.github.io` Discussions | Ensure the Giscus GitHub App is installed for the public repo. |
| GitHub contribution calendar | `tools/prepare-github-calendar.mjs`, `source/js/github-calendar.js` | Replaces GitCalendar with local build data | Build refreshes data from GitHub public contributions; cache/fallback is local. |
| QWeather widget / clock weather | `source/_data/recovered-injector.json` | Vercel key restored; widget/CDN may still fail; page has fallback | Recreate the QWeather widget/key if the old widget remains unavailable. |
| Tencent Map IP location | `PUBLIC_TENCENT_MAP_KEY` | Vercel key restored; page has fallback | Prefer a new domain-restricted browser key before public production use. |
| Algolia search | Astro env / recovered placeholders | Vercel variables restored | Verify index ownership and rebuild the search index when posts change. |
| QQ avatar API | `_config.butterfly.yml` social link | Previously failed during checks | Replace with a stable profile URL if it remains unavailable. |

## Notes On Lost Data

- Article `date` and `updated` values were recovered into Markdown front matter where available.
- Busuanzi historical UV/PV is not recoverable from static HTML or Hexo source alone.
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
