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
      ip: '',
      location: { lat: 40.158009, lng: 116.290663 },
      ad_info: { nation: '中国', province: '北京市', city: '北京市', district: '昌平区' }
    }
  })
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
