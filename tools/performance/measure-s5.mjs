import { measureS4 } from './measure-s4.mjs'

const ROUTES = [
  '/lab/',
  '/tools/local-json/',
  '/tools/sha256/',
  '/topics/',
  '/explore/map/',
  '/paths/',
  '/flow/',
  '/narratives/',
  '/narratives/site.hybrid-indexing.collection/'
]

const result = await measureS4({
  baseUrl: process.argv[2] ?? 'http://127.0.0.1:4321',
  routes: ROUTES
})
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
