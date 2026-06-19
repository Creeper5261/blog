# Astro Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the default Hexo build path with an Astro static build while preserving the recovered Butterfly visual output as closely as possible.

**Architecture:** Astro serves sanitized legacy HTML pages through route-compatible pages, while static assets are copied from recovered source directories into an ignored Astro public directory. Public browser service values are injected from environment variables and real keys are removed from tracked source.

**Tech Stack:** Astro, Node.js built-in test runner, pnpm, recovered Hexo/Butterfly assets as the visual baseline.

---

### Task 1: Legacy Route And HTML Transform Core

**Files:**
- Create: `src/legacy/routes.mjs`
- Create: `src/legacy/html-transform.mjs`
- Create: `tests/legacy-routes.test.mjs`
- Create: `tests/legacy-html.test.mjs`

- [x] **Step 1: Write failing route and transform tests**

Run: `node --test "tests/**/*.test.mjs"`
Expected: FAIL because `src/legacy/routes.mjs` and `src/legacy/html-transform.mjs` do not exist.

- [x] **Step 2: Implement minimal route and transform modules**

Implement recursive HTML route discovery, URL-style route slugs, service placeholders, public service injection, and Tencent Map script sanitization.

- [x] **Step 3: Run tests**

Run: `node --test "tests/**/*.test.mjs"`
Expected: PASS for route and transform behavior.

### Task 2: Asset And Legacy Page Preparation

**Files:**
- Create: `tools/prepare-astro-assets.mjs`
- Create: `tools/prepare-astro-legacy-pages.mjs`
- Modify: `tests/prepare-astro-assets.test.mjs`
- Create: `tests/prepare-astro-legacy-pages.test.mjs`

- [ ] **Step 1: Write failing preparation tests**

Tests must prove APK files are skipped, copied `txmap.js` has no hard-coded key, and copied legacy HTML uses service placeholders.

- [ ] **Step 2: Implement preparation tools**

Copy static assets to `.astro-static/`, copy HTML pages to `src/legacy/pages/`, sanitize service values, and print a concise JSON summary.

- [ ] **Step 3: Run tests**

Run: `node --test "tests/**/*.test.mjs"`
Expected: all tests pass.

### Task 3: Astro Build Integration

**Files:**
- Create: `astro.config.mjs`
- Create: `src/pages/[...slug].astro`
- Create: `src/pages/404.astro`
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Add Astro config and route pages**

`[...slug].astro` must read `src/legacy/pages/<slug>/index.html` or `src/legacy/pages/index.html`, inject public services, and render the full legacy HTML with `set:html`.

- [ ] **Step 2: Update scripts**

`pnpm run build` must prepare assets, prepare legacy pages, and run `astro build`. Old Hexo commands move to `legacy:*` scripts.

- [ ] **Step 3: Run build**

Run: `pnpm run build`
Expected: `dist/` contains 48 HTML pages and copied assets, excluding APK files.

### Task 4: Source Secret Cleanup

**Files:**
- Modify: `_config.yml`
- Modify: `_config.butterfly.yml`
- Modify: `source/js/txmap.js`
- Modify: `source/_data/recovered-injector.json`
- Modify: `source/_data/recovered-shell.json`
- Modify: `tools/check-maintainability.mjs`

- [ ] **Step 1: Add a failing source scan**

The check must fail when tracked source contains known old hard-coded values for Algolia, Twikoo, Tencent Map, QWeather, Gaode, or Baidu.

- [ ] **Step 2: Replace real values with placeholders or empty defaults**

Tracked source keeps variable names and documentation only. Runtime values come from `.env` or platform environment variables.

- [ ] **Step 3: Run source scan**

Run: `pnpm run check`
Expected: no hard-coded secret failures.

### Task 5: Local Visual Acceptance

**Files:**
- Create: `tools/visual-compare.mjs`
- Modify: `package.json`

- [ ] **Step 1: Capture baseline and Astro screenshots**

Compare local Hexo baseline and Astro output at `/`, `/about/`, one article, `/comments/`, and `/404.html`.

- [ ] **Step 2: Report visual similarity**

Produce screenshots and a JSON report with dimensions, major layout presence checks, and pixel-diff score where possible.

- [ ] **Step 3: Final verification**

Run: `pnpm run test`, `pnpm run check`, `pnpm run build`, and local visual comparison.
Expected: all commands pass and visual differences are limited to service data or external network availability.
