#!/usr/bin/env node
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import matter from 'gray-matter'
import { metadataHashFor, validatePublicationFiles, validatePublicationManifest } from './publish-latex.mjs'

const root = process.cwd()
const sourceTex = path.join(root, 'source/tex/ai-infra/RMSNorm-pilot.tex')
const sourceYaml = path.join(root, 'source/tex/ai-infra/RMSNorm-pilot.yaml')
const id = 'RMSNorm'
const sha = async (file) => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')
const copy = (from, to) => fs.cp(from, to, { recursive: true })
const run = (cwd, args) => execFileSync(process.execPath, [path.join(root, 'tools/publish-latex.mjs'), ...args], { cwd, stdio: 'pipe', env: { ...process.env, PUBLISH_UPDATED_AT: expected.updated } })
const normalize = (value) => value.replace(/\s+/gu, ' ').trim()
const normalizePost = (value) => normalize(value.replace(/^updated:.*$/mu, ''))
const expectedPost = path.join(root, 'source/_posts/RMSNorm：起一个稳压器的作用.md')
const expectedFragment = path.join(root, 'source/content/renders/RMSNorm.html')
const expectedManifest = JSON.parse(await fs.readFile(path.join(root, 'source/_data/latex-publications.json'), 'utf8'))
const expected = expectedManifest.articles.find((article) => article.id === id)
if (!expected || expected.date !== '2026-08-15T12:00:00.000Z' || expected.permalink !== '/2026/08/15/RMSNorm/') throw new Error('expected RMSNorm identity is incomplete')
assertManifestErrors()
await assertIsolatedGitBuild()
await assertGitUpdatedRegression()

async function assertGitUpdatedRegression() {
  const tempRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'latex-git-regression-'))
  try {
    execFileSync('git', ['init', '-q'], { cwd: tempRepo }); execFileSync('git', ['config', 'user.email', 'acceptance@example.invalid'], { cwd: tempRepo }); execFileSync('git', ['config', 'user.name', 'Acceptance'], { cwd: tempRepo })
    await fs.mkdir(path.join(tempRepo, 'source/tex/ai-infra'), { recursive: true }); await fs.mkdir(path.join(tempRepo, 'source/_data'), { recursive: true })
    await fs.copyFile(sourceTex, path.join(tempRepo, 'source/tex/ai-infra/RMSNorm-pilot.tex')); await fs.copyFile(sourceYaml, path.join(tempRepo, 'source/tex/ai-infra/RMSNorm-pilot.yaml'))
    const invoke = () => execFileSync(process.execPath, [path.join(root, 'tools/publish-latex.mjs'), '--all', '--dir', 'source/tex'], { cwd: tempRepo, stdio: 'pipe', env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'PUBLISH_UPDATED_AT')) })
    invoke(); execFileSync('git', ['add', '-f', '.'], { cwd: tempRepo }); execFileSync('git', ['commit', '-qm', 'tracked RMSNorm projection'], { cwd: tempRepo })
    const first = JSON.parse(await fs.readFile(path.join(tempRepo, 'source/_data/latex-publications.json'), 'utf8')).articles[0]
    await fs.appendFile(path.join(tempRepo, 'source/tex/ai-infra/RMSNorm-pilot.tex'), '\n% tracked content edit\n'); execFileSync('git', ['add', '-f', '.'], { cwd: tempRepo }); execFileSync('git', ['commit', '-qm', 'edit RMSNorm source'], { cwd: tempRepo }); invoke()
    const second = JSON.parse(await fs.readFile(path.join(tempRepo, 'source/_data/latex-publications.json'), 'utf8')).articles[0]
    const commitTime = execFileSync('git', ['log', '-1', '--format=%cI', '--', 'source/tex/ai-infra/RMSNorm-pilot.tex'], { cwd: tempRepo, encoding: 'utf8' }).trim()
    if (second.updated !== commitTime || second.sourceHash === first.sourceHash || second.renderKey === first.renderKey || second.permalink !== expected.permalink) throw new Error('git updated/source identity regression failed')
    await fs.writeFile(path.join(tempRepo, 'unrelated.txt'), 'unrelated\n'); execFileSync('git', ['add', 'unrelated.txt'], { cwd: tempRepo }); execFileSync('git', ['commit', '-qm', 'unrelated change'], { cwd: tempRepo }); invoke()
    const third = JSON.parse(await fs.readFile(path.join(tempRepo, 'source/_data/latex-publications.json'), 'utf8')).articles[0]
    if (third.updated !== second.updated || third.sourceHash !== second.sourceHash || third.renderKey !== second.renderKey) throw new Error('unrelated git commit drifted publication identity')
  } finally { await fs.rm(tempRepo, { recursive: true, force: true }) }
}

async function assertIsolatedGitBuild() {
  const worktreeRoot = os.tmpdir()
  const worktree = await fs.mkdtemp(path.join(worktreeRoot, 'latex-worktree-'))
  try {
    execFileSync('git', ['worktree', 'add', '--detach', worktree, 'HEAD'], { cwd: root, stdio: 'pipe' })
    const packageManager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
    const install = (command, args) => execFileSync(command, args, { cwd: worktree, stdio: 'pipe', shell: process.platform === 'win32', env: { ...process.env, PUBLISH_UPDATED_AT: expected.updated } })
    const storePath = execFileSync(packageManager, ['store', 'path'], { cwd: root, shell: process.platform === 'win32', encoding: 'utf8' }).trim()
    install(packageManager, ['install', '--config.frozen-lockfile=false', '--store-dir', storePath])
    await fs.copyFile(path.join(root, 'tools/publish-latex.mjs'), path.join(worktree, 'tools/publish-latex.mjs'))
    for (const file of [sourceTex, sourceYaml, expectedPost, expectedFragment]) await fs.rm(path.join(worktree, path.relative(root, file)), { force: true })
    await fs.mkdir(path.join(worktree, 'source/tex/ai-infra'), { recursive: true })
    await copy(sourceTex, path.join(worktree, 'source/tex/ai-infra/RMSNorm-pilot.tex'))
    await copy(sourceYaml, path.join(worktree, 'source/tex/ai-infra/RMSNorm-pilot.yaml'))
    const manifestFile = path.join(worktree, 'source/_data/latex-publications.json')
    const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'))
    await fs.writeFile(manifestFile, `${JSON.stringify({ ...manifest, articles: manifest.articles.filter((article) => article.id !== id) }, null, 2)}\n`)
    const runCommand = (command, args, shell = false) => execFileSync(command, args, { cwd: worktree, stdio: 'pipe', shell, env: { ...process.env, PUBLISH_UPDATED_AT: expected.updated } })
    runCommand(packageManager, ['run', 'publish:latex', '--', '--all', '--dir', 'source/tex'], true)
    try {
      runCommand(packageManager, ['run', 'legacy:build'], true)
      runCommand(packageManager, ['run', 'recovery:prepare-legacy-pages'], true)
      runCommand(packageManager, ['run', 'build'], true)
    } catch (error) { throw new Error(`isolated legacy/Astro build failed: ${error.message}`) }
    const currentHome = await fs.readFile(path.join(worktree, 'dist/index.html'), 'utf8')
    if (!currentHome.includes('RMSNorm：起一个稳压器的作用') || !currentHome.includes('/2026/08/15/RMSNorm/')) throw new Error('home misses RMSNorm card/permalink')
    if (!currentHome.includes('swiper') || !currentHome.includes('RMSNorm')) throw new Error('home misses RMSNorm carousel')
    for (const page of ['2026/08/15/RMSNorm/index.html', 'archives/2026/08/index.html', 'tags/RMSNorm/index.html', 'categories/学习/index.html']) {
      if (!(await fs.stat(path.join(worktree, 'dist', page)).catch(() => null))) throw new Error(`current projection missing: ${page}`)
      const html = await fs.readFile(path.join(worktree, 'dist', page), 'utf8')
      if (!html.includes('/2026/08/15/RMSNorm/')) throw new Error(`projection misses RMSNorm link: ${page}`)
    }
    const post = await fs.readFile(path.join(worktree, 'dist/2026/08/15/RMSNorm/index.html'), 'utf8')
    const postName = (await fs.readdir(path.join(worktree, 'source/_posts'))).find((name) => name.includes('RMSNorm') && name.endsWith('.md'))
    const sourcePost = await fs.readFile(path.join(worktree, 'source/_posts', postName), 'utf8')
    if (!post.includes('<link rel="canonical"') || !post.includes('/2026/08/15/RMSNorm/') || !sourcePost.includes('data-render-fragment="RMSNorm"') || !post.includes('latex-preview-document')) throw new Error('article render contract incomplete')
  } finally {
    try { execFileSync('git', ['worktree', 'remove', '--force', worktree], { cwd: root, stdio: 'pipe' }) } catch { execFileSync('git', ['worktree', 'prune'], { cwd: root, stdio: 'pipe' }) }
    await fs.rm(worktree, { recursive: true, force: true })
  }
}

function assertManifestErrors() {
  const valid = { id: 'x', permalink: '/x/', sourceHash: 'a', metadataHash: 'b', rendererIdentity: 'c', renderKey: 'd' }
  for (const invalid of [{ articles: [valid, { ...valid }] }, { articles: [{ ...valid, permalink: '' }] }, { articles: [{ ...valid, renderKey: '' }] }]) {
    try { validatePublicationManifest(invalid); throw new Error('manifest invalid case accepted') } catch (error) { if (error.message === 'manifest invalid case accepted') throw error }
  }
}

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'latex-publish-'))
try {
  for (const directory of ['source/tex/ai-infra', 'source/_posts', 'source/content/renders', 'source/_data']) await fs.mkdir(path.join(temp, directory), { recursive: true })
  await copy(sourceTex, path.join(temp, 'source/tex/ai-infra/RMSNorm-pilot.tex'))
  await copy(sourceYaml, path.join(temp, 'source/tex/ai-infra/RMSNorm-pilot.yaml'))
  const texBytes = await fs.readFile(sourceTex)
  const yamlData = matter(`---\n${await fs.readFile(sourceYaml, 'utf8')}\n---`).data
  const metadataHash = metadataHashFor(yamlData, id)
  const renderKey = crypto.createHash('sha256').update(`${crypto.createHash('sha256').update(texBytes).digest('hex')}\0${metadataHash}\0katex-0.18.2-latex-basic-v5`).digest('hex')
  const tempYaml = path.join(temp, 'source/tex/ai-infra/RMSNorm-pilot.yaml')
  await fs.writeFile(tempYaml, (await fs.readFile(tempYaml, 'utf8')).replace(/renderSourceHash:.*$/mu, `renderSourceHash: '${renderKey}'`))
  for (const file of (await fs.readdir(path.join(root, 'source/_posts'))).filter((file) => file.endsWith('.md') && !file.includes('RMSNorm'))) await copy(path.join(root, 'source/_posts', file), path.join(temp, 'source/_posts', file))
  for (const file of (await fs.readdir(path.join(root, 'source/content/renders'))).filter((file) => file !== 'RMSNorm.html')) await copy(path.join(root, 'source/content/renders', file), path.join(temp, 'source/content/renders', file))
  await copy(expectedFragment, path.join(temp, 'source/content/renders/RMSNorm.html'))
  await fs.writeFile(path.join(temp, 'source/_data/latex-publications.json'), JSON.stringify({ articles: expectedManifest.articles.filter((article) => article.id !== id) }, null, 2) + '\n')
  run(temp, ['--all', '--dir', 'source/tex'])
  const generatedFile = (await fs.readdir(path.join(temp, 'source/_posts'))).find((file) => file.includes('RMSNorm'))
  const generatedPost = await fs.readFile(path.join(temp, 'source/_posts', generatedFile), 'utf8')
  const generatedFragment = await fs.readFile(path.join(temp, 'source/content/renders/RMSNorm.html'), 'utf8')
  const generatedManifest = JSON.parse(await fs.readFile(path.join(temp, 'source/_data/latex-publications.json'), 'utf8'))
  const generated = generatedManifest.articles.find((article) => article.id === id)
  await validatePublicationFiles(generatedManifest, temp)
  if (!generated || generated.date !== expected.date || generated.permalink !== expected.permalink) throw new Error('generated date/permalink identity changed')
  if (generated.sourceHash !== expected.sourceHash || generated.metadataHash !== expected.metadataHash || generated.rendererIdentity !== expected.rendererIdentity) throw new Error('generated source identity differs')
  if (normalizePost(generatedPost) !== normalizePost(await fs.readFile(expectedPost, 'utf8'))) throw new Error('generated post differs from expected semantics')
  if (!generated.renderCache || generatedFragment.length === 0 || normalize(generatedFragment) !== normalize(await fs.readFile(expectedFragment, 'utf8'))) throw new Error('generated render differs from expected semantics')
  if (generatedManifest.articles.filter((article) => article.id === id).length !== 1 || !generated.home || !generated.carousel || !generated.timeline || !generated.categories.includes('学习') || !generated.tags.includes('RMSNorm')) throw new Error('home/carousel/category/tag/timeline projection incomplete')
  const before = await Promise.all([sha(path.join(temp, 'source/content/renders/RMSNorm.html')), sha(path.join(temp, 'source/_data/latex-publications.json'))])
  run(temp, ['--all', '--dir', 'source/tex'])
  const after = await Promise.all([sha(path.join(temp, 'source/content/renders/RMSNorm.html')), sha(path.join(temp, 'source/_data/latex-publications.json'))])
  if (before.join(':') !== after.join(':')) throw new Error('repeated publication is not idempotent')
  console.log('latex publisher acceptance passed: isolated no-RMSNorm baseline rebuilt with semantic parity')
} finally { await fs.rm(temp, { recursive: true, force: true }) }
