import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_ROUTES = ['/tools/local-json/', '/pulse/', '/explore/', '/explain/', '/lab/']

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function waitForJson(url, timeout = 10000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return response.json()
    } catch {}
    await sleep(100)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

class DevToolsClient {
  constructor(url) {
    this.url = url
    this.nextId = 0
    this.pending = new Map()
    this.events = new Map()
  }

  async connect() {
    this.socket = new WebSocket(this.url)
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id) {
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        if (message.error) pending.reject(new Error(message.error.message))
        else pending.resolve(message.result)
        return
      }
      const listeners = this.events.get(message.method) ?? []
      for (const listener of listeners) listener(message.params)
    })
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true })
      this.socket.addEventListener('error', reject, { once: true })
    })
  }

  send(method, params = {}) {
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  on(method, listener) {
    if (!this.events.has(method)) this.events.set(method, [])
    this.events.get(method).push(listener)
  }

  resetEvents() {
    this.events.set('Network.responseReceived', [])
    this.events.set('Network.loadingFinished', [])
  }

  close() {
    this.socket?.close()
  }
}

async function enableClient(client) {
  await client.send('Page.enable')
  await client.send('Network.enable')
  await client.send('Runtime.enable')
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    window.__s4Lcp = null
    if (PerformanceObserver.supportedEntryTypes?.includes('largest-contentful-paint')) {
      new PerformanceObserver((list) => {
        const entry = list.getEntries().at(-1)
        if (entry) window.__s4Lcp = entry.startTime
      }).observe({ type: 'largest-contentful-paint', buffered: true })
    }
  })()` })
}

async function evaluate(client, expression, awaitPromise = false) {
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'browser evaluation failed')
  return result.result?.value
}

async function measureNavigation(client, baseUrl, route) {
  const responses = new Map()
  const finished = new Map()
  client.resetEvents()
  client.on('Network.responseReceived', ({ requestId, response }) => responses.set(requestId, { url: response.url, status: response.status, mimeType: response.mimeType }))
  client.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => finished.set(requestId, encodedDataLength))
  const loaded = new Promise((resolve) => client.on('Page.loadEventFired', resolve))
  const startedAt = performance.now()
  await client.send('Page.navigate', { url: new URL(route, baseUrl).href })
  await loaded
  await sleep(100)
  const pageMetrics = await evaluate(client, `(() => {
    const resources = performance.getEntriesByType('resource')
    const lcp = window.__s4Lcp ?? performance.getEntriesByType('largest-contentful-paint').at(-1)
    const button = document.querySelector('.explain-unit [data-action="advance"], #format')
    return { lcp: typeof lcp === 'number' ? lcp : lcp?.startTime ?? null, resources: resources.length, transferSize: resources.reduce((total, entry) => total + (entry.transferSize || 0), 0), hasNoScript: Boolean(document.querySelector('noscript')), button: Boolean(button) }
  })()`)
  const interaction = await evaluate(client, `((async () => {
    const button = document.querySelector('.explain-unit [data-action="advance"], #format')
    if (!button) return null
    const started = performance.now()
    button.click()
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return performance.now() - started
  })())`, true)
  const networkBytes = [...finished.values()].reduce((total, bytes) => total + bytes, 0)
  return {
    route,
    durationMs: Math.round(performance.now() - startedAt),
    requestCount: responses.size,
    networkBytes,
    successfulResponses: [...responses.values()].filter((response) => response.status >= 200 && response.status < 400).length,
    lcpMs: pageMetrics.lcp === null ? null : Math.round(pageMetrics.lcp),
    resourceCount: pageMetrics.resources,
    transferSize: pageMetrics.transferSize,
    interactionLatencyMs: interaction === null ? null : Math.round(interaction),
    hasNoScript: pageMetrics.hasNoScript,
    hasInteractiveControl: pageMetrics.button
  }
}

async function attachChrome(cdpBaseUrl) {
  const version = await waitForJson(`${cdpBaseUrl}/json/version`)
  const pages = await waitForJson(`${cdpBaseUrl}/json/list`)
  const page = pages.find((entry) => entry.type === 'page')
  if (!page?.webSocketDebuggerUrl) throw new Error('Chrome did not expose a page target')
  const client = new DevToolsClient(page.webSocketDebuggerUrl)
  await client.connect()
  await enableClient(client)
  return { client, version, cleanup: async () => client.close() }
}

export async function measureS4({ baseUrl = process.argv[2] ?? 'http://127.0.0.1:4321', routes = DEFAULT_ROUTES } = {}) {
  const browser = await attachChrome(process.env.S4_CDP_URL ?? 'http://127.0.0.1:9222')
  try {
    const cold = []
    const hot = []
    for (const route of routes) cold.push(await measureNavigation(browser.client, baseUrl, route))
    for (const route of routes) hot.push(await measureNavigation(browser.client, baseUrl, route))
    const baseline = cold.find((entry) => entry.route === '/lab/')
    const prototypes = cold.filter((entry) => entry.route !== '/lab/')
    return {
      schemaVersion: 1,
      baseUrl,
      browser: browser.version.Browser,
      routes,
      cold,
      hot,
      comparison: {
        baseline: '/lab/',
        baselineRequestCount: baseline?.requestCount ?? null,
        prototypeAverageRequestCount: prototypes.length ? Math.round(prototypes.reduce((total, entry) => total + entry.requestCount, 0) / prototypes.length) : null,
        baselineNetworkBytes: baseline?.networkBytes ?? null,
        prototypeAverageNetworkBytes: prototypes.length ? Math.round(prototypes.reduce((total, entry) => total + entry.networkBytes, 0) / prototypes.length) : null
      }
    }
  } finally {
    await browser.cleanup()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(await measureS4(), null, 2)}\n`)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
