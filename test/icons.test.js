process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-local-test-placeholder-not-real'

const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const path = require('node:path')

function clearDistCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes(path.join('dist', ''))) delete require.cache[key]
  }
}

async function withServer(run) {
  process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = 'test-secret-1234567890'
  process.env.JWT_ISSUER = 'awk-video-editor-api'
  process.env.JWT_AUDIENCE = 'awk-video-editor-client'
  process.env.CORS_ORIGIN = 'http://allowed.example'
  process.env.MONGODB_URI = 'mongodb://fake'
  process.env.MONGODB_DB_NAME = 'awk_video_editor'
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-local-test-placeholder-not-real'
  process.env.TRANSLATION_PROVIDER = 'none'
  process.env.GOOGLE_TRANSLATE_API_KEY = ''
  process.env.NOUN_PROJECT_API_KEY = ''
  process.env.NOUN_PROJECT_API_SECRET = ''
  delete process.env.ENABLE_TEST_ROUTES
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
  }
}

async function getJson(baseUrl, route) {
  const response = await fetch(`${baseUrl}${route}`)
  const contentType = response.headers.get('content-type') || ''
  const body = await response.json().catch(() => null)
  return { response, contentType, body }
}

test('provider=iconify returns preview URLs and no renderable markup fields', async () => {
  await withServer(async (baseUrl) => {
    const result = await getJson(baseUrl, '/api/v1/icons?q=lampara%20amarilla&provider=iconify&limit=10&color=ffcc00')

    assert.equal(result.response.status, 200)
    assert.match(result.contentType, /application\/json/)
    assert.equal(result.body.success, true)
    assert.equal(result.body.message, 'Icons fetched successfully')
    assert.equal(result.body.data.provider, 'iconify')
    assert.equal(result.body.data.originalQuery, 'lampara amarilla')
    assert.equal(result.body.data.translatedQuery, 'yellow lamp')
    assert.ok(Array.isArray(result.body.data.items))
    assert.ok(result.body.data.items.length >= 1)

    for (const item of result.body.data.items) {
      assert.equal(item.provider, 'iconify')
      assert.equal(typeof item.iconId, 'string')
      assert.match(item.iconId, /^[a-z0-9]+[a-z0-9-]*:[a-z0-9]+[a-z0-9-]*$/)
      assert.equal(item.preview.type, 'svg-url')
      assert.equal(typeof item.preview.url, 'string')
      assert.ok(item.preview.url.startsWith('https://api.iconify.design/'))
      assert.equal(item.svg, undefined)
      assert.equal(item.html, undefined)
      assert.equal(item.component, undefined)
      assert.equal(item.markup, undefined)
    }
  })
})

test('/icons/iconify alias works', async () => {
  await withServer(async (baseUrl) => {
    const result = await getJson(baseUrl, '/api/v1/icons/iconify?q=bicicleta&limit=10')
    assert.equal(result.response.status, 200)
    assert.equal(result.body.data.provider, 'iconify')
    assert.equal(result.body.data.originalQuery, 'bicicleta')
    assert.equal(result.body.data.translatedQuery, 'bicycle')
  })
})

test('local dictionary fallback translates common Spanish terms', async () => {
  await withServer(async (baseUrl) => {
    let result = await getJson(baseUrl, '/api/v1/icons?q=bicicleta&provider=iconify&limit=10')
    assert.equal(result.response.status, 200)
    assert.equal(result.body.data.translatedQuery, 'bicycle')
    assert.equal(result.body.data.translation.provider, 'fallback-dictionary')
    assert.equal(result.body.data.translation.usedFallback, true)

    result = await getJson(baseUrl, '/api/v1/icons?q=lampara%20amarilla&provider=iconify&limit=10')
    assert.equal(result.response.status, 200)
    assert.equal(result.body.data.translatedQuery, 'yellow lamp')

    result = await getJson(baseUrl, '/api/v1/icons?q=cafe&provider=iconify&limit=10')
    assert.equal(result.response.status, 200)
    assert.equal(result.body.data.translatedQuery, 'coffee')
  })
})

test('color=ffcc00 produces Iconify URL with encoded color', async () => {
  await withServer(async (baseUrl) => {
    const result = await getJson(baseUrl, '/api/v1/icons/iconify?q=lamp&limit=10&color=ffcc00')
    assert.equal(result.response.status, 200)
    assert.ok(result.body.data.items.some((item) => String(item.preview.url).includes('color=%23ffcc00')))
  })
})

test('invalid color returns 422', async () => {
  await withServer(async (baseUrl) => {
    const result = await getJson(baseUrl, '/api/v1/icons/iconify?q=lamp&color=javascript%3Aalert(1)')
    assert.equal(result.response.status, 422)
    assert.equal(result.body.success, false)
    assert.ok(result.body.errors.some((err) => err.field === 'color'))
  })
})

test('provider=nounproject returns controlled 503 when credentials are missing', async () => {
  await withServer(async (baseUrl) => {
    const result = await getJson(baseUrl, '/api/v1/icons?q=lamp&provider=nounproject&limit=10')
    assert.equal(result.response.status, 503)
    assert.equal(result.body.success, false)
    assert.match(result.body.message, /Noun Project/i)
  })
})

test('/icons/nounproject alias works and returns controlled 503 without credentials', async () => {
  await withServer(async (baseUrl) => {
    const result = await getJson(baseUrl, '/api/v1/icons/nounproject?q=bicicleta&limit=10')
    assert.equal(result.response.status, 503)
    assert.equal(result.body.success, false)
  })
})

test('unsafe q is rejected before translation or provider search', async () => {
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
      const result = await getJson(baseUrl, `/api/v1/icons?q=${encodeURIComponent(payload)}&provider=iconify`)
      assert.equal(result.response.status, 422)
      assert.equal(result.body.success, false)
      assert.equal(result.body.message, 'Validation failed')
      assert.ok(Array.isArray(result.body.errors))
      assert.ok(result.body.errors.some((err) => err.field === 'q'))
    }
  })
})

test('icons endpoint validates provider, category, limit, and offset', async () => {
  await withServer(async (baseUrl) => {
    let result = await getJson(baseUrl, '/api/v1/icons?provider=web')
    assert.equal(result.response.status, 422)
    assert.ok(result.body.errors.some((err) => err.field === 'provider'))

    result = await getJson(baseUrl, '/api/v1/icons?category=bad%20category')
    assert.equal(result.response.status, 422)
    assert.ok(result.body.errors.some((err) => err.field === 'category'))

    result = await getJson(baseUrl, '/api/v1/icons?limit=999')
    assert.equal(result.response.status, 422)
    assert.ok(result.body.errors.some((err) => err.field === 'limit'))

    result = await getJson(baseUrl, '/api/v1/icons?offset=-1')
    assert.equal(result.response.status, 422)
    assert.ok(result.body.errors.some((err) => err.field === 'offset'))
  })
})
