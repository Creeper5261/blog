# Agent Notes

This is the maintainable recovered Hexo source for DAT's blog.

## Working Rules

- Do not edit `public/` by hand. Generate it with `pnpm run build`.
- Do not commit `node_modules/`, `public/`, `db.json`, `_multiconfig.yml`, logs, pid files, or `.env*`.
- Treat `_config.yml`, `_config.butterfly.yml`, `source/`, `scripts/`, `tools/`, `package.json`, and `pnpm-lock.yaml` as the source of truth.
- `source/_data/recovered-injector.json` and `source/_data/recovered-shell.json` contain recovered HTML snippets. Edit them carefully and verify generated output after changes.
- Keep general maintenance utilities in `tools/`. Hexo auto-loads files under `scripts/` as runtime plugins.
- The old byte-perfect snapshot comparison tools live outside this repo in the original workspace. They are recovery diagnostics, not the normal build path.

## Verification

Before claiming the site is ready:

```bash
pnpm run check
pnpm run build
```

`pnpm run check` must have no hard failures. Warnings for Twikoo, GitCalendar, or QWeather indicate external service work that cannot be solved by source changes alone.

## URL And Assets

- Default URL is `https://creeper5261-github-io.vercel.app`.
- Keep `https://www.godboy.cc/` only in documentation/comments as a quick replacement after the custom domain is restored.
- Runtime source should use relative internal links, not hard-coded old custom-domain links.
- Image bed assets use `https://cdn.jsdelivr.net/gh/Creeper5261/picbed@main/`.

## External Keys And Services

- Do not paste private credentials into source.
- Tencent Map key in `source/js/txmap.js` is a public browser key; prefer replacing it with a domain-restricted key.
- Twikoo requires a live backend `envId`; the old `https://twikoo.godboy.cc/` backend is not currently usable.
- Busuanzi counters and Twikoo comments are external data. Source edits cannot restore historical UV/PV or comments without the original service data.

## Git

The intended private remote is:

```text
git@github.com:Creeper5261/Hexo-Blog.git
```

Do not push unless the user asks.
