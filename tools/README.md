# LaTeX 文章发布工作流

本目录中的 `publish-latex.mjs` 将原始 LaTeX 文章接入博客文章、首页卡片、首页轮播、分类、标签和时间轴。

## 输入

准备同名文件：

```text
source/tex/<series>/<article>.tex
source/tex/<series>/<article>.yaml
```

YAML 至少包含：

```yaml
id: RMSNorm
title: 'RMSNorm：起一个稳压器的作用'
date: '2026-08-15T12:00:00.000Z'
description: 'AI Infra 系列试点：RMSNorm 的原生 LaTeX 排版稿。'
permalink: '/2026/08/15/RMSNorm/'
home: true
carousel: true
timeline: true
categories:
  - 学习
tags:
  - AI Infra
  - Transformer
```

如需复用已确认的渲染片段，可增加：

```yaml
renderFragment: 'source/content/renders/RMSNorm.html'
```

## 生成与预览

```bash
pnpm run publish:latex -- \
  --tex source/tex/ai-infra/RMSNorm-pilot.tex \
  --meta source/tex/ai-infra/RMSNorm-pilot.yaml
pnpm run server
```

脚本自动更新 `source/_posts/`、`source/content/renders/` 和 `source/_data/latex-publications.json`。本地检查：

```text
http://127.0.0.1:4321/
http://127.0.0.1:4321/2026/08/15/RMSNorm/
```

检查正文、公式、矩阵、表格、折叠块、字数统计、首页卡片、轮播、分类、标签、时间轴，以及明暗主题和移动端布局。

## 验收

```bash
pnpm run publish:latex:acceptance
pnpm run check
pnpm run build
```

## 提交、合并与推送

```bash
git switch -c feature/latex-article-<short-name>
git add source/tex source/_posts source/content/renders source/_data/latex-publications.json
git add tools/publish-latex.mjs tools/latex-publish-acceptance.mjs package.json src/pages/index.astro tools/README.md
git diff --cached --check
git commit -m "feat(article): publish <article-name>"

git switch main
git merge --no-ff feature/latex-article-<short-name>
git push origin main
git rev-parse HEAD
git ls-remote origin refs/heads/main
```

确认本地和远端 commit 一致后，等待 GitHub Actions/Vercel 完成部署，再访问：

```text
https://creeper5261-github-io.vercel.app/
https://creeper5261-github-io.vercel.app/<permalink>/
```
