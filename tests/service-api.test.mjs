import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  getClientIp,
  getTencentLocation,
  handleLocationRequest
} from '../api/location.mjs'
import {
  getWeather,
  handleWeatherRequest,
  normalizeWeather
} from '../api/weather.mjs'
import {
  createVisitorHash,
  handleStatsRequest,
  normalizePathname
} from '../api/stats.mjs'

test('location API extracts the visitor IP from Vercel proxy headers', () => {
  const request = new Request('https://example.test/api/location', {
    headers: {
      'x-forwarded-for': '203.0.113.20, 10.0.0.1',
      'x-real-ip': '198.51.100.1'
    }
  })

  assert.equal(getClientIp(request), '203.0.113.20')
})

test('location API returns Tencent location data through server env', async () => {
  const response = await handleLocationRequest(new Request('https://example.test/api/location'), {
    env: { PUBLIC_TENCENT_MAP_KEY: 'TENCENT_KEY' },
    fetchImpl: async (url) => {
      assert.equal(url.searchParams.get('key'), 'TENCENT_KEY')
      assert.equal(url.searchParams.get('output'), 'json')
      return Response.json({
        status: 0,
        result: {
          ip: '203.0.113.20',
          location: { lat: 43.83327, lng: 125.28845 },
          ad_info: { nation: '中国', province: '吉林省', city: '长春市', district: '朝阳区' }
        }
      })
    }
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    result: {
      ip: '203.0.113.20',
      location: { lat: 43.83327, lng: 125.28845 },
      ad_info: { nation: '中国', province: '吉林省', city: '长春市', district: '朝阳区' }
    }
  })
})

test('location API reports missing Tencent key without leaking details', async () => {
  const response = await getTencentLocation({
    env: {},
    fetchImpl: async () => {
      throw new Error('fetch should not be called without a key')
    }
  })

  assert.equal(response.ok, false)
  assert.equal(response.status, 503)
  assert.equal(response.reason, 'missing_tencent_map_key')
})

test('location API corrects obvious proxy geolocation for China browser timezone', async () => {
  const response = await handleLocationRequest(new Request('https://example.test/api/location?tz=Asia%2FShanghai'), {
    env: { PUBLIC_TENCENT_MAP_KEY: 'TENCENT_KEY' },
    fetchImpl: async () => Response.json({
      status: 0,
      result: {
        ip: '141.11.146.59',
        location: { lat: 38.8833, lng: -77 },
        ad_info: { nation: '美国', province: '', city: '', district: '' }
      }
    })
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    result: {
      ip: '141.11.146.59',
      location: { lat: 40.158009, lng: 116.290663 },
      ad_info: { nation: '中国', province: '北京市', city: '北京市', district: '昌平区' }
    }
  })
})

test('location API keeps a forwarded IP when proxy correction replaces only the place', async () => {
  const response = await handleLocationRequest(new Request('https://example.test/api/location?tz=Asia%2FShanghai', {
    headers: {
      'x-forwarded-for': '203.0.113.20, 10.0.0.1'
    }
  }), {
    env: { PUBLIC_TENCENT_MAP_KEY: 'TENCENT_KEY' },
    fetchImpl: async () => Response.json({
      status: 0,
      result: {
        location: { lat: 38.8833, lng: -77 },
        ad_info: { nation: '美国', province: '', city: '', district: '' }
      }
    })
  })

  assert.equal(response.status, 200)
  assert.equal((await response.json()).result.ip, '203.0.113.20')
})

test('weather API normalizes QWeather now endpoint data', async () => {
  const response = await getWeather({
    env: { PUBLIC_QWEATHER_KEY: 'QWEATHER_KEY' },
    fetchImpl: async (url) => {
      assert.equal(url.searchParams.get('key'), 'QWEATHER_KEY')
      assert.equal(url.searchParams.get('location'), '116.290663,40.158009')
      return Response.json({
        code: '200',
        now: {
          temp: '-7',
          text: '多云',
          icon: '101',
          windDir: '西北风',
          humidity: '44'
        },
        updateTime: '2026-06-18T22:00+08:00'
      })
    }
  })

  assert.deepEqual(response, {
    ok: true,
    status: 200,
    data: {
      temp: '-7',
      text: '多云',
      icon: '101',
      windDir: '西北风',
      humidity: '44',
      updateTime: '2026-06-18T22:00+08:00',
      location: '北京'
    }
  })
})

test('weather API prefers visitor location from Tencent IP lookup', async () => {
  const request = new Request('https://example.test/api/weather', {
    headers: {
      'x-forwarded-for': '203.0.113.20, 10.0.0.1'
    }
  })

  const response = await handleWeatherRequest(request, {
    env: {
      PUBLIC_QWEATHER_KEY: 'QWEATHER_KEY',
      PUBLIC_TENCENT_MAP_KEY: 'TENCENT_KEY'
    },
    fetchImpl: async (url) => {
      if (url.hostname === 'apis.map.qq.com') {
        assert.equal(url.searchParams.get('ip'), '203.0.113.20')
        return Response.json({
          status: 0,
          result: {
            location: { lat: 40.158009, lng: 116.290663 },
            ad_info: { nation: '中国', province: '北京市', city: '北京市', district: '昌平区' }
          }
        })
      }

      assert.equal(url.hostname, 'devapi.qweather.com')
      assert.equal(url.searchParams.get('location'), '116.290663,40.158009')
      return Response.json({
        code: '200',
        now: { temp: '27', text: '晴', icon: '100', windDir: '南风', humidity: '38' }
      })
    }
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    weather: {
      temp: '27',
      text: '晴',
      icon: '100',
      windDir: '南风',
      humidity: '38',
      updateTime: '',
      location: '北京市 昌平区'
    }
  })
})

test('weather API corrects proxy geolocation with China browser timezone', async () => {
  const response = await handleWeatherRequest(new Request('https://example.test/api/weather?tz=Asia%2FShanghai'), {
    env: {
      PUBLIC_QWEATHER_KEY: 'QWEATHER_KEY',
      PUBLIC_TENCENT_MAP_KEY: 'TENCENT_KEY'
    },
    fetchImpl: async (url) => {
      if (url.hostname === 'apis.map.qq.com') {
        return Response.json({
          status: 0,
          result: {
            ip: '141.11.146.59',
            location: { lat: 38.8833, lng: -77 },
            ad_info: { nation: '美国', province: '', city: '', district: '' }
          }
        })
      }

      assert.equal(url.searchParams.get('location'), '116.290663,40.158009')
      return Response.json({
        code: '200',
        now: { temp: '24', text: '多云', icon: '101', windDir: '北风', humidity: '45' }
      })
    }
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    weather: {
      temp: '24',
      text: '多云',
      icon: '101',
      windDir: '北风',
      humidity: '45',
      updateTime: '',
      location: '北京'
    }
  })
})

test('weather API returns a compact browser payload', async () => {
  const response = await handleWeatherRequest(new Request('https://example.test/api/weather'), {
    env: { PUBLIC_QWEATHER_KEY: 'QWEATHER_KEY' },
    fetchImpl: async () => Response.json({
      code: '200',
      now: { temp: '22', text: '晴', icon: '100', windDir: '东风', humidity: '31' }
    })
  })

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), {
    weather: {
      temp: '22',
      text: '晴',
      icon: '100',
      windDir: '东风',
      humidity: '31',
      updateTime: '',
      location: '北京'
    }
  })
})

test('weather normalization rejects non-success QWeather payloads', () => {
  assert.equal(normalizeWeather({ code: '401' }), null)
})

function createMockRedis(initial = {}) {
  const state = new Map(Object.entries(initial))
  const calls = []

  return {
    calls,
    async command(command, ...args) {
      calls.push([command, ...args])

      if (command === 'GET') return state.get(args[0]) ?? null
      if (command === 'SET') {
        state.set(args[0], args[1])
        return 'OK'
      }
      if (command === 'INCR') {
        const next = Number(state.get(args[0]) || 0) + 1
        state.set(args[0], String(next))
        return next
      }
      if (command === 'SADD') {
        const key = args[0]
        const members = new Set(JSON.parse(state.get(key) || '[]'))
        const before = members.size
        for (const member of args.slice(1)) members.add(member)
        state.set(key, JSON.stringify([...members].sort()))
        return members.size - before
      }
      if (command === 'SCARD') {
        return JSON.parse(state.get(args[0]) || '[]').length
      }
      if (command === 'KEYS') {
        const pattern = String(args[0]).replaceAll('*', '.*')
        const re = new RegExp(`^${pattern}$`)
        return [...state.keys()].filter(key => re.test(key)).sort()
      }
      if (command === 'MGET') {
        return args.map(key => state.get(key) ?? null)
      }

      throw new Error(`unexpected redis command: ${command}`)
    }
  }
}

test('stats API normalizes page paths without query strings or hashes', () => {
  assert.equal(normalizePathname('/2023/05/16/Arcaea/?utm=1#comments'), '/2023/05/16/Arcaea/')
  assert.equal(normalizePathname('https://example.test/about/?x=1'), '/about/')
  assert.equal(normalizePathname('not a url'), '/')
})

test('stats API hashes visitor inputs with a private salt', async () => {
  const request = new Request('https://example.test/api/stats', {
    headers: {
      'x-forwarded-for': '203.0.113.10',
      'user-agent': 'Test Browser'
    }
  })

  const first = await createVisitorHash(request, { env: { STATS_HASH_SALT: 'salt-one' }, visitorId: 'visitor-a' })
  const second = await createVisitorHash(request, { env: { STATS_HASH_SALT: 'salt-two' }, visitorId: 'visitor-a' })

  assert.match(first, /^[a-f0-9]{64}$/)
  assert.notEqual(first, second)
})

test('stats API records a visit and returns Busuanzi-compatible counters', async () => {
  const redis = createMockRedis()
  const request = new Request('https://example.test/api/stats', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.10',
      'user-agent': 'Test Browser'
    },
    body: JSON.stringify({
      path: '/about/?from=test',
      visitorId: 'visitor-a'
    })
  })

  const response = await handleStatsRequest(request, {
    env: { STATS_HASH_SALT: 'salt-one' },
    redis
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    site_uv: 1,
    site_pv: 1,
    page_pv: 1,
    path: '/about/',
    ok: true
  })
  assert.deepEqual(redis.calls.map(call => call[0]), ['SADD', 'INCR', 'INCR', 'SCARD', 'GET', 'GET'])
})

test('stats API does not count the same visitor twice for site UV', async () => {
  const redis = createMockRedis()
  const options = { env: { STATS_HASH_SALT: 'salt-one' }, redis }

  for (let i = 0; i < 2; i += 1) {
    await handleStatsRequest(new Request('https://example.test/api/stats', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.10',
        'user-agent': 'Test Browser'
      },
      body: JSON.stringify({ path: '/', visitorId: 'same-visitor' })
    }), options)
  }

  const response = await handleStatsRequest(new Request('https://example.test/api/stats'), options)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    site_uv: 1,
    site_pv: 2,
    page_pv: 2,
    path: '/',
    ok: true
  })
})

test('stats API export requires a backup token and includes page counters', async () => {
  const redis = createMockRedis({
    'stats:site:pv': '7',
    'stats:site:uv': JSON.stringify(['a', 'b', 'c']),
    'stats:page:/': '5',
    'stats:page:/about/': '2'
  })

  const denied = await handleStatsRequest(new Request('https://example.test/api/stats?export=1'), {
    env: { STATS_BACKUP_TOKEN: 'secret' },
    redis
  })
  assert.equal(denied.status, 401)

  const allowed = await handleStatsRequest(new Request('https://example.test/api/stats?export=1&token=secret'), {
    env: { STATS_BACKUP_TOKEN: 'secret' },
    redis
  })

  assert.equal(allowed.status, 200)
  const exported = await allowed.json()
  assert.match(exported.exportedAt, /\d{4}-\d{2}-\d{2}T/)
  assert.deepEqual(exported, {
    exportedAt: exported.exportedAt,
    site: {
      uv: 3,
      pv: 7
    },
    pages: {
      '/': 5,
      '/about/': 2
    }
  })
})

test('stats API reports unavailable storage without counting locally', async () => {
  const response = await handleStatsRequest(new Request('https://example.test/api/stats', { method: 'POST' }), {
    env: {}
  })

  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), {
    ok: false,
    error: 'stats_storage_unconfigured'
  })
})

test('stats API can use Upstash REST storage from environment variables', async () => {
  const commands = []
  const response = await handleStatsRequest(new Request('https://example.test/api/stats', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.10',
      'user-agent': 'Test Browser'
    },
    body: JSON.stringify({ path: '/about/', visitorId: 'visitor-a' })
  }), {
    env: {
      KV_REST_API_URL: 'https://redis.example',
      KV_REST_API_TOKEN: 'token',
      STATS_HASH_SALT: 'salt-one'
    },
    fetchImpl: async (url, options) => {
      assert.equal(String(url), 'https://redis.example/pipeline')
      assert.equal(options.headers.authorization, 'Bearer token')

      const [[command, key]] = JSON.parse(options.body)
      commands.push(command)

      if (command === 'SADD') return Response.json([{ result: 1 }])
      if (command === 'INCR') return Response.json([{ result: 1 }])
      if (command === 'SCARD') return Response.json([{ result: 1 }])
      if (command === 'GET') {
        assert.match(key, /^stats:(site:pv|page:\/about\/)$/)
        return Response.json([{ result: '1' }])
      }

      throw new Error(`unexpected redis command: ${command}`)
    }
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    site_uv: 1,
    site_pv: 1,
    page_pv: 1,
    path: '/about/',
    ok: true
  })
  assert.deepEqual(commands, ['SADD', 'INCR', 'INCR', 'SCARD', 'GET', 'GET'])
})

test('stats API can use Vercel Upstash integration prefixed KV variables', async () => {
  const response = await handleStatsRequest(new Request('https://example.test/api/stats?path=/'), {
    env: {
      UPSTASH_REDIS_REST_KV_REST_API_URL: 'https://prefixed-redis.example',
      UPSTASH_REDIS_REST_KV_REST_API_TOKEN: 'prefixed-token',
      STATS_HASH_SALT: 'salt-one'
    },
    fetchImpl: async (url, options) => {
      assert.equal(String(url), 'https://prefixed-redis.example/pipeline')
      assert.equal(options.headers.authorization, 'Bearer prefixed-token')

      const [[command, key]] = JSON.parse(options.body)
      if (command === 'SCARD') return Response.json([{ result: 2 }])
      if (command === 'GET' && key === 'stats:site:pv') return Response.json([{ result: '3' }])
      if (command === 'GET' && key === 'stats:page:/') return Response.json([{ result: '1' }])

      throw new Error(`unexpected redis command: ${command}`)
    }
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    site_uv: 2,
    site_pv: 3,
    page_pv: 1,
    path: '/',
    ok: true
  })
})
