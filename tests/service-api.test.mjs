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

test('weather API normalizes QWeather now endpoint data', async () => {
  const response = await getWeather({
    env: { PUBLIC_QWEATHER_KEY: 'QWEATHER_KEY' },
    fetchImpl: async (url) => {
      assert.equal(url.searchParams.get('key'), 'QWEATHER_KEY')
      assert.equal(url.searchParams.get('location'), '125.28845,43.83327')
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
      location: '长春'
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
  assert.deepEqual(await response.json(), {
    weather: {
      temp: '22',
      text: '晴',
      icon: '100',
      windDir: '东风',
      humidity: '31',
      updateTime: '',
      location: '长春'
    }
  })
})

test('weather normalization rejects non-success QWeather payloads', () => {
  assert.equal(normalizeWeather({ code: '401' }), null)
})
