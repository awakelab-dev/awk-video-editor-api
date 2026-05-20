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

test('icons endpoint returns Iconify metadata and no renderable markup fields', async () => {
  await withServer(async (baseUrl) => {
    const result = await getJson(baseUrl, '/api/v1/icons?q=coffee&provider=iconify&limit=10')

    assert.equal(result.response.status, 200)
    assert.match(result.contentType, /application\/json/)
    assert.equal(result.body.success, true)
    assert.equal(result.body.message, 'Icons fetched successfully')
    assert.equal(result.body.data.provider, 'iconify')
    assert.ok(['iconify-api', 'default-catalog'].includes(result.body.data.source))
    assert.ok(Array.isArray(result.body.data.items))
    assert.ok(result.body.data.items.length >= 1)

    for (const item of result.body.data.items) {
      assert.equal(item.provider, 'iconify')
      assert.equal(typeof item.iconId, 'string')
      assert.match(item.iconId, /^[a-z0-9]+[a-z0-9-]*:[a-z0-9]+[a-z0-9-]*$/)
      assert.equal(item.preview.type, 'iconify-id')
      assert.equal(item.preview.value, item.iconId)

      assert.equal(item.svg, undefined)
      assert.equal(item.html, undefined)
      assert.equal(item.component, undefined)
      assert.equal(item.markup, undefined)
    }
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

test('icons endpoint rejects unsafe XSS-like search queries', async () => {
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

