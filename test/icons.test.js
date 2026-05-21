process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-local-test-placeholder-not-real'

const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const path = require('node:path')

const ORIGINAL_FETCH = global.fetch

function clearDistCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes(path.join('dist', ''))) delete require.cache[key]
  }
}

async function withServer(run, options = {}) {
  process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = 'test-secret-1234567890'
  process.env.JWT_ISSUER = 'awk-video-editor-api'
  process.env.JWT_AUDIENCE = 'awk-video-editor-client'
  process.env.CORS_ORIGIN = 'http://allowed.example'
  process.env.MONGODB_URI = 'mongodb://fake'
  process.env.MONGODB_DB_NAME = 'awk_video_editor'
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-local-test-placeholder-not-real'
  process.env.TRANSLATION_PROVIDER = options.translationProvider || ''
  process.env.GOOGLE_TRANSLATE_API_KEY = options.googleKey || ''
  process.env.NOUN_PROJECT_API_KEY = options.nounKey || ''
  process.env.NOUN_PROJECT_API_SECRET = options.nounSecret || ''
  delete process.env.ENABLE_TEST_ROUTES

  global.fetch = options.fetch || mockFetch({
    iconifyIcons: ['mdi:coffee', 'mdi:lamp', 'mdi:bicycle'],
    nounIcons: [nounLamp()],
  })

  clearDistCache()
  const app = require('../dist/app.js').default
  const server = http.createServer(app)

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const baseUrl = `http://127.0.0.1:${address.port}`

  try {
    return await run(baseUrl)
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()))
    global.fetch = ORIGINAL_FETCH
  }
}

function mockFetch({ iconifyIcons = [], nounIcons = [], translations = {} } = {}) {
  return async (url, init = {}) => {
    const parsed = new URL(url)

    if (parsed.hostname === 'translation.googleapis.com') {
      const body = init.body ? JSON.parse(init.body) : {}
      const original = String(body.q || '')
      const translatedText = translations[original] || fallbackTranslateForTest(original)
      return jsonResponse(200, {
        data: {
          translations: [
            {
              translatedText,
              detectedSourceLanguage: translatedText === original ? 'en' : 'es',
            },
          ],
        },
      })
    }

    if (parsed.hostname === 'api.iconify.design') {
      return jsonResponse(200, {
        icons: iconifyIcons,
        total: iconifyIcons.length,
      })
    }

    if (parsed.hostname === 'api.thenounproject.com') {
      return jsonResponse(200, {
        icons: nounIcons,
        total: nounIcons.length,
      })
    }

    return jsonResponse(404, {})
  }
}

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === 'content-type' ? 'application/json' : null
      },
    },
    async json() {
      return payload
    },
  }
}

function nounLamp() {
  return {
    id: 123456,
    term: 'Lamp',
    thumbnail_url: 'https://static.thenounproject.com/png/123456-200.png',
    tags: ['lamp', 'light', 'yellow'],
    attribution: 'Lamp by Example Creator from Noun Project',
    license_description: 'Creative Commons Attribution',
  }
}

function fallbackTranslateForTest(query) {
  const normalized = query.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  const phrases = {
    bicicleta: 'bicycle',
    cafe: 'coffee',
    'lampara amarilla': 'yellow lamp',
    'ladrillo construccion': 'construction brick',
  }
  return phrases[normalized] || query
}

async function getJson(baseUrl, route) {
  const response = await ORIGINAL_FETCH(`${baseUrl}${route}`)
  const contentType = response.headers.get('content-type') || ''
  const body = await response.json().catch(() => null)
  return { response, contentType, body }
}

function assertNoRenderableMarkupFields(item) {
  assert.equal(item.svg, undefined)
  assert.equal(item.html, undefined)
  assert.equal(item.component, undefined)
  assert.equal(item.markup, undefined)
}

test('icons endpoint returns Iconify URL metadata and no renderable markup fields', async () => {
  await withServer(async (baseUrl) => {
    const result = await getJson(baseUrl, '/api/v1/icons?q=coffee&provider=iconify&limit=10')

    assert.equal(result.response.status, 200)
    assert.match(result.contentType, /application\/json/)
    assert.equal(result.body.success, true)
    assert.equal(result.body.message, 'Icons fetched successfully')
    assert.equal(result.body.data.provider, 'iconify')
    assert.equal(result.body.data.source, 'iconify-api')
    assert.ok(Array.isArray(result.body.data.items))
    assert.ok(result.body.data.items.length >= 1)

    for (const item of result.body.data.items) {
      assert.equal(item.provider, 'iconify')
      assert.equal(typeof item.iconId, 'string')
      assert.match(item.iconId, /^[a-z0-9]+[a-z0-9-]*:[a-z0-9]+[a-z0-9-]*$/)
      assert.equal(item.preview.type, 'svg-url')
      assert.match(item.preview.url, /^https:\/\/api\.iconify\.design\/[a-z0-9-]+\/[a-z0-9-]+\.svg$/)
      assertNoRenderableMarkupFields(item)
    }
  })
})

test('icons endpoint translates Spanish query to English using Google before Iconify search', async () => {
  const seenIconifyQueries = []
  const fetch = async (url, init = {}) => {
    const parsed = new URL(url)
    if (parsed.hostname === 'translation.googleapis.com') {
      return jsonResponse(200, {
        data: {
          translations: [
            { translatedText: 'yellow lamp', detectedSourceLanguage: 'es' },
          ],
        },
      })
    }
    if (parsed.hostname === 'api.iconify.design') {
      seenIconifyQueries.push(parsed.searchParams.get('query'))
      return jsonResponse(200, { icons: ['mdi:lamp'], total: 1 })
    }
    return jsonResponse(404, {})
  }

  await withServer(async (baseUrl) => {
    const result = await getJson(baseUrl, '/api/v1/icons?q=lampara%20amarilla&provider=iconify&limit=10')
    assert.equal(result.response.status, 200)
    assert.equal(result.body.data.originalQuery, 'lampara amarilla')
    assert.equal(result.body.data.translatedQuery, 'yellow lamp')
    assert.equal(result.body.data.translation.provider, 'google')
    assert.equal(result.body.data.translation.detectedSourceLanguage, 'es')
    assert.deepEqual(seenIconifyQueries, ['yellow lamp'])
    assert.equal(result.body.data.items[0].preview.url, 'https://api.iconify.design/mdi/lamp.svg')
  }, { translationProvider: 'google', googleKey: 'fake-google-key', fetch })
})

test('icons endpoint uses local dictionary fallback when Google key is missing', async () => {
  await withServer(async (baseUrl) => {
    const result = await getJson(baseUrl, '/api/v1/icons?q=bicicleta&provider=iconify&limit=10')
    assert.equal(result.response.status, 200)
    assert.equal(result.body.data.originalQuery, 'bicicleta')
    assert.equal(result.body.data.translatedQuery, 'bicycle')
    assert.equal(result.body.data.translation.provider, 'fallback-dictionary')
    assert.equal(result.body.data.items[0].iconId, 'mdi:bicycle')
  }, { fetch: mockFetch({ iconifyIcons: ['mdi:bicycle'] }) })
})

test('provider-specific aliases work for iconify and nounproject', async () => {
  await withServer(async (baseUrl) => {
    let result = await getJson(baseUrl, '/api/v1/icons/iconify?q=cafe&limit=10')
    assert.equal(result.response.status, 200)
    assert.equal(result.body.data.provider, 'iconify')
    assert.equal(result.body.data.translatedQuery, 'coffee')

    result = await getJson(baseUrl, '/api/v1/icons/nounproject?q=lampara%20amarilla&limit=10')
    assert.equal(result.response.status, 200)
    assert.equal(result.body.data.provider, 'nounproject')
    assert.equal(result.body.data.source, 'nounproject-api')
    assert.equal(result.body.data.translatedQuery, 'yellow lamp')
    assert.equal(result.body.data.items[0].id, 'noun:123456')
    assert.equal(result.body.data.items[0].preview.type, 'thumbnail-url')
    assert.equal(result.body.data.items[0].preview.url, 'https://static.thenounproject.com/png/123456-200.png')
    assertNoRenderableMarkupFields(result.body.data.items[0])
  }, {
    nounKey: 'fake-noun-key',
    nounSecret: 'fake-noun-secret',
    fetch: mockFetch({ iconifyIcons: ['mdi:coffee'], nounIcons: [nounLamp()] }),
  })
})

test('nounproject provider returns 503 when credentials are missing', async () => {
  await withServer(async (baseUrl) => {
    const result = await getJson(baseUrl, '/api/v1/icons?q=lamp&provider=nounproject')
    assert.equal(result.response.status, 503)
    assert.equal(result.body.success, false)
    assert.equal(result.body.code, 'ICON_PROVIDER_NOT_CONFIGURED')
    assert.ok(result.body.errors.some((err) => err.field === 'NOUN_PROJECT_API_KEY'))
  })
})

test('icons endpoint returns default video-editor icons without a query', async () => {
  await withServer(async (baseUrl) => {
    const result = await getJson(baseUrl, '/api/v1/icons?provider=iconify&limit=20')

    assert.equal(result.response.status, 200)
    assert.equal(result.body.data.provider, 'iconify')
    assert.equal(result.body.data.source, 'default-catalog')
    assert.ok(result.body.data.items.some((item) => item.iconId === 'mdi:movie-open'))
    assert.ok(result.body.data.items.some((item) => item.iconId === 'mdi:play'))
    assert.ok(result.body.data.items.every((item) => item.provider === 'iconify'))
    assert.ok(result.body.data.items.every((item) => typeof item.preview.url === 'string'))
  })
})

test('icons endpoint supports category, limit, and offset with bounded pagination', async () => {
  await withServer(async (baseUrl) => {
    let result = await getJson(baseUrl, '/api/v1/icons?category=media&limit=2&offset=1')
    assert.equal(result.response.status, 200)
    assert.equal(result.body.data.limit, 2)
    assert.equal(result.body.data.offset, 1)
    assert.ok(result.body.data.total >= result.body.data.items.length)
    assert.ok(result.body.data.items.every((item) => item.category === 'media'))

    result = await getJson(baseUrl, '/api/v1/icons?limit=999')
    assert.equal(result.response.status, 422)
    assert.equal(result.body.message, 'Validation failed')
    assert.ok(result.body.errors.some((err) => err.field === 'limit'))
  })
})

test('icons endpoint rejects unsafe XSS-like search queries before translation', async () => {
  await withServer(async (baseUrl) => {
    const payloads = [
      '<script>alert(1)</script>',
      '\"><img src=x onerror=alert(1)>',
      'javascript:alert(1)',
      '<svg/onload=alert(1)>',
      '＜script＞alert(1)＜/script＞',
      'ｊａｖａｓｃｒｉｐｔ:alert(1)',
      'safe‮cod.exe',
    ]

    for (const payload of payloads) {
      const result = await getJson(baseUrl, `/api/v1/icons?q=${encodeURIComponent(payload)}`)
      assert.equal(result.response.status, 422)
      assert.equal(result.body.success, false)
      assert.equal(result.body.message, 'Validation failed')
      assert.ok(Array.isArray(result.body.errors))
      assert.ok(result.body.errors.some((err) => err.field === 'q'))
    }
  })
})

test('icons endpoint rejects unsafe translated output', async () => {
  const fetch = async (url, init = {}) => {
    const parsed = new URL(url)
    if (parsed.hostname === 'translation.googleapis.com') {
      return jsonResponse(200, {
        data: {
          translations: [
            { translatedText: '<svg/onload=alert(1)>', detectedSourceLanguage: 'es' },
          ],
        },
      })
    }
    return jsonResponse(200, { icons: ['mdi:lamp'], total: 1 })
  }

  await withServer(async (baseUrl) => {
    const result = await getJson(baseUrl, '/api/v1/icons?q=lampara&provider=iconify')
    assert.equal(result.response.status, 422)
    assert.equal(result.body.success, false)
    assert.ok(result.body.errors.some((err) => err.field === 'translatedQuery'))
  }, { translationProvider: 'google', googleKey: 'fake-google-key', fetch })
})

test('icons endpoint rejects malformed provider/category and double-encoded markup', async () => {
  await withServer(async (baseUrl) => {
    let result = await getJson(baseUrl, '/api/v1/icons?provider=remote')
    assert.equal(result.response.status, 422)
    assert.ok(result.body.errors.some((err) => err.field === 'provider'))

    result = await getJson(baseUrl, '/api/v1/icons?category=food%20drink')
    assert.equal(result.response.status, 422)
    assert.ok(result.body.errors.some((err) => err.field === 'category'))

    result = await getJson(baseUrl, '/api/v1/icons?q=%253Cscript%253Ealert(1)%253C/script%253E')
    assert.equal(result.response.status, 422)
    assert.ok(result.body.errors.some((err) => err.field === 'q'))
  })
})
