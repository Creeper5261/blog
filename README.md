# DAT Blog

This repository contains DAT's recovered blog and the new Astro-based static build. The original Hexo + Butterfly source was lost, reconstructed, and then used as the visual baseline for the modern build path.

## Current Status

- Default framework: Astro
- Legacy baseline: Hexo `6.3.0` + `hexo-theme-butterfly` `4.10.0`
- Package manager: `pnpm@10.20.0`
- Default public URL: `https://creeper5261-github-io.vercel.app`
- Private source remote: `git@github.com:Creeper5261/blog.git`

The current `feature/astro-rewrite` branch serves sanitized legacy HTML through Astro to preserve the existing visual style while replacing the default Hexo build chain. Hexo remains available under `legacy:*` scripts as the visual baseline and rollback path.

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

## Environment Variables

Real service values must be configured through `.env`, Vercel Environment Variables, or another deployment platform. Use `.env.example` as the template.

```text
PUBLIC_ALGOLIA_APP_ID
PUBLIC_ALGOLIA_SEARCH_KEY
PUBLIC_ALGOLIA_INDEX_NAME
PUBLIC_TWIKOO_ENV_ID
PUBLIC_TENCENT_MAP_KEY
PUBLIC_QWEATHER_KEY
PUBLIC_GAUD_MAP_KEY
PUBLIC_BAIDU_MAP_AK
```

Do not commit real app keys, tokens, private endpoints, `.vercel/`, or files under `secrets/`.

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
| Twikoo comments | Astro env / recovered shell placeholders | Frontend library reachable, old backend fails TLS | Redeploy Twikoo and set `PUBLIC_TWIKOO_ENV_ID`. Old comments require the original backend database backup. |
| GitCalendar | `source/_data/recovered-injector.json` | API returns server error | Replace service or implement a GitHub API based calendar if needed. |
| QWeather widget / clock weather | `source/_data/recovered-injector.json` | Widget script fails TLS | Recreate the QWeather widget/key and update the injected snippet. |
| Tencent Map IP location | `PUBLIC_TENCENT_MAP_KEY` | Old browser key removed from source | Create a new domain-restricted browser key. |
| Algolia search | Astro env / recovered placeholders | Old frontend keys removed from source | Set `PUBLIC_ALGOLIA_*` after verifying index ownership. |
| QQ avatar API | `_config.butterfly.yml` social link | Previously failed during checks | Replace with a stable profile URL if it remains unavailable. |

## Notes On Lost Data

- Article `date` and `updated` values were recovered into Markdown front matter where available.
- Busuanzi historical UV/PV is not recoverable from static HTML or Hexo source alone.
- Twikoo comment history is not recoverable unless the old Twikoo backend database still exists.
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

The modern build source of truth is `astro.config.mjs`, `src/`, `source/`, `tools/`, `package.json`, and `pnpm-lock.yaml`. `_config.yml` and `_config.butterfly.yml` remain for the legacy Hexo baseline.
