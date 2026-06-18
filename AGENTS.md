# Agent Notes

This is DAT's recovered blog source. The default build path is now Astro, with the recovered Hexo + Butterfly site retained as the visual baseline and rollback path.

## Repository Model

- Keep source private in `git@github.com:Creeper5261/blog.git`.
- Keep generated static output public in `https://github.com/Creeper5261/Creeper5261.github.io`.
- Vercel may deploy from the public output repository to preserve the old "source private, generated output public" workflow.
- Giscus comments are attached to the public output repository's Discussions, not the private source repository.

## Working Rules

- Do not edit generated directories by hand: `public/`, `dist/`, `.astro/`, or `.astro-static/`.
- Do not commit `node_modules/`, generated output, `db.json`, `_multiconfig.yml`, logs, pid files, `.env*`, `.vercel/`, or `secrets/`.
- Treat `astro.config.mjs`, `src/`, `source/`, `tools/`, `package.json`, and `pnpm-lock.yaml` as the modern source of truth.
- Treat `src/legacy/pages` as tracked Astro compatibility source. Refresh it from Hexo `public/` only with `pnpm run recovery:prepare-legacy-pages` after a deliberate recovery refresh.
- Treat `_config.yml`, `_config.butterfly.yml`, and `legacy:*` scripts as the Hexo baseline and rollback path.
- `source/_data/recovered-injector.json` and `source/_data/recovered-shell.json` contain recovered HTML snippets. Edit them carefully and verify generated output after changes.
- Keep general maintenance utilities in `tools/`. Hexo auto-loads files under `scripts/` as runtime plugins.
- The old byte-perfect snapshot comparison tools live outside this repo in the original workspace. They are recovery diagnostics, not the normal build path.

## Verification

Before claiming the site is ready:

```bash
pnpm run check
pnpm run build
```

`pnpm run check` must have no hard failures. The old GitCalendar and Twikoo scripts must not appear in runtime source or generated output. Visual acceptance uses local screenshots under `.local/visual-compare` plus `pnpm run visual:report`.

## URL And Assets

- Default URL is `https://creeper5261-github-io.vercel.app`.
- Keep `https://www.godboy.cc/` only in documentation/comments as a quick replacement after the custom domain is restored.
- Runtime source should use relative internal links, not hard-coded old custom-domain links.
- Image bed assets use `https://cdn.jsdelivr.net/gh/Creeper5261/picbed@main/`.

## External Keys And Services

- Do not paste private credentials or real app keys into source.
- Public browser keys are still configured through `.env` or platform environment variables, then injected into generated output.
- Use `.env.example` as the variable template.
- Tencent Map requires `PUBLIC_TENCENT_MAP_KEY`.
- Giscus uses public IDs for `Creeper5261/Creeper5261.github.io`: repo id `R_kgDOJjHleA`, category id `DIC_kwDOJjHleM4C_aiF`, mapping `pathname`.
- Busuanzi counters and old Twikoo comments are external data. Source edits cannot restore historical UV/PV or old comments without the original service data.
- The old Twikoo frontend is replaced by `source/js/comments-runtime.js`; do not reintroduce Twikoo unless explicitly requested.
- GitCalendar is replaced by `tools/prepare-github-calendar.mjs` and `source/js/github-calendar.js`; do not load `gitcalendar.fomal.cc`.
- Runtime widget fallbacks live in `source/js/service-fallbacks.js`. Keep them lightweight and idempotent for normal load and `pjax:complete`.
- Vercel currently has `PUBLIC_SITE_URL`, Algolia, Tencent Map, QWeather, and Gaode variables configured. `PUBLIC_BAIDU_MAP_AK` was not recovered.
- Do not store recovered key strings in source or tests. `tools/check-maintainability.mjs` uses hashed fingerprints for known old browser keys.

## Git

The intended private remote is:

```text
git@github.com:Creeper5261/blog.git
```

Do not push unless the user asks.
