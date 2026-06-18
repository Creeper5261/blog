# Agent Notes

This is DAT's recovered blog source. The default build path is now Astro, with the recovered Hexo + Butterfly site retained as the visual baseline and rollback path.

## Working Rules

- Do not edit generated directories by hand: `public/`, `dist/`, `.astro/`, or `.astro-static/`.
- Do not commit `node_modules/`, generated output, `db.json`, `_multiconfig.yml`, logs, pid files, `.env*`, `.vercel/`, or `secrets/`.
- Treat `astro.config.mjs`, `src/`, `source/`, `tools/`, `package.json`, and `pnpm-lock.yaml` as the modern source of truth.
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

`pnpm run check` must have no hard failures. Warnings for GitCalendar or QWeather indicate external service work that cannot be solved by source changes alone. Visual acceptance uses local screenshots under `.local/visual-compare` plus `pnpm run visual:report`.

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
- Twikoo requires `PUBLIC_TWIKOO_ENV_ID`; the old custom-domain backend is not currently usable.
- Busuanzi counters and Twikoo comments are external data. Source edits cannot restore historical UV/PV or comments without the original service data.

## Git

The intended private remote is:

```text
git@github.com:Creeper5261/blog.git
```

Do not push unless the user asks.
