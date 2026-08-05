import { measureS4 } from './measure-s4.mjs'

const ROUTES = [
  '/lab/',
  '/tools/codec/',
  '/tools/markdown/',
  '/tools/image-compressor/',
  '/topics/',
  '/explore/map/',
  '/paths/',
  '/flow/',
]

const desktop = await measureS4({
  baseUrl: process.argv[2] ?? 'http://127.0.0.1:4321',
  routes: ROUTES
})
const degraded = await measureS4({
  baseUrl: process.argv[2] ?? 'http://127.0.0.1:4321',
  routes: ROUTES,
  emulation: {
    width: 375,
    height: 812,
    deviceScaleFactor: 2,
    mobile: true,
    cpuThrottlingRate: 6
  }
})
process.stdout.write(`${JSON.stringify({ desktop, degraded }, null, 2)}\n`)
