#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const root = process.cwd()
const sha = async (file) => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')
const run = (file, args) => execFileSync(process.execPath, [file, ...args], { cwd: root, stdio: 'inherit' })

const tex = 'source/tex/ai-infra/RMSNorm-pilot.tex'
const meta = 'source/tex/ai-infra/RMSNorm-pilot.yaml'
const fragment = path.resolve(root, 'source/content/renders/RMSNorm.html')
const post = path.resolve(root, 'source/_posts/RMSNorm：起一个稳压器的作用.md')
const manifest = path.resolve(root, 'source/_data/latex-publications.json')
const before = await Promise.all([sha(fragment), sha(post), sha(manifest)])
run('tools/publish-latex.mjs', ['--tex', tex, '--meta', meta])
const after = await Promise.all([sha(fragment), sha(post), sha(manifest)])
if (before[0] !== after[0] || before[1] !== after[1] || before[2] !== after[2]) throw new Error('RMSNorm rerun is not idempotent')
const data = JSON.parse(await fs.readFile(manifest, 'utf8'))
const article = data.articles.find((item) => item.id === 'RMSNorm')
if (!article?.home || !article.carousel || article.permalink !== '/2026/08/15/RMSNorm/') throw new Error('RMSNorm publication flags are incomplete')
console.log('latex publisher acceptance passed: RMSNorm rerun is idempotent and indexed for home, carousel and timeline')
