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
  const renderKey = crypto.createHash('sha256').update(`${crypto.createHash('sha256').update(texBytes).digest('hex')}\0${metadataHash}\0katex-0.18.2-latex-basic-v2`).digest('hex')
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
