# DAT Blog Recovered Hexo Source

This repository is the recovered source for DAT's Hexo + Butterfly blog. The original source was lost, then reconstructed from the Vercel/GitHub static output and the existing Markdown/config fragments.

## Current Status

- Source root: `recovered-hexo`
- Framework: Hexo `6.3.0`
- Theme: `hexo-theme-butterfly` `4.10.0`
- Package manager: `pnpm@10.20.0`
- Default public URL: `https://creeper5261-github-io.vercel.app`
- Private source remote: `git@github.com:Creeper5261/Hexo-Blog.git`

The earlier recovery stage reached byte-level parity with the static recovery snapshot. This repository is now the maintainable source fork: generated output is expected to differ from the original snapshot where dead domains/CDNs were replaced.

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

Generate the site:

```bash
pnpm run build
```

Start a local Hexo server:

```bash
pnpm run server
```

Recovery-only tools from the original workspace live outside this repo in `../tools` and are not part of the normal build path.

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
| Twikoo comments | `_config.butterfly.yml`, recovered shell snippets | Frontend library reachable, backend `https://twikoo.godboy.cc/` fails TLS | Redeploy Twikoo and replace `twikoo.envId`. Old comments require the original backend database backup. |
| GitCalendar | `source/_data/recovered-injector.json` | API returns server error | Replace service or implement a GitHub API based calendar if needed. |
| QWeather widget / clock weather | `source/_data/recovered-injector.json` | Widget script fails TLS | Recreate the QWeather widget/key and update the injected snippet. |
| Tencent Map IP location | `source/js/txmap.js` | Existing key returned `status:0` on 2026-06-18 | Keep working key or create a new domain-restricted browser key. |
| Algolia search | `_config.yml` | Existing frontend search keys preserved | Verify index ownership before production use. |
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
- `db.json`
- `_multiconfig.yml`
- `*.log`
- `*.pid`
- `.env*`

The source of truth is `_config.yml`, `_config.butterfly.yml`, `source/`, `scripts/`, `tools/`, `package.json`, and `pnpm-lock.yaml`.
