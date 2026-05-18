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

async function getJson(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`)
  const contentType = response.headers.get('content-type') || ''
  const body = await response.json().catch(() => null)
  return { response, contentType, body }
}

test('icons endpoint returns JSON-only emoji records for coffee-style search', async () => {
  await withServer(async (baseUrl) => {
    const { response, contentType, body } = await getJson(baseUrl, '/api/v1/icons?q=taza%20de%20cafe')

    assert.equal(response.status, 200)
    assert.match(contentType, /application\/json/)
    assert.equal(body.success, true)
    assert.equal(body.message, 'Icons fetched successfully')
    assert.equal(body.data.query, 'taza de cafe')
    assert.ok(Array.isArray(body.data.items))
    assert.ok(body.data.items.length >= 1)

    const coffee = body.data.items.find((item) => item.id === 'coffee')
    assert.ok(coffee)
    assert.equal(coffee.emoji, '☕')
    assert.equal(coffee.category, 'food-drink')
    assert.equal(typeof coffee.label, 'string')
    assert.ok(Array.isArray(coffee.keywords))
    assert.equal(coffee.html, undefined)
    assert.equal(coffee.svg, undefined)
    assert.equal(coffee.component, undefined)
    assert.equal(coffee.markup, undefined)
  })
})

test('icons endpoint supports category, limit, and offset with bounded pagination', async () => {
  await withServer(async (baseUrl) => {
    let result = await getJson(baseUrl, '/api/v1/icons?category=food-drink&limit=2&offset=1')
    assert.equal(result.response.status, 200)
    assert.equal(result.body.data.limit, 2)
    assert.equal(result.body.data.offset, 1)
    assert.ok(result.body.data.total >= result.body.data.items.length)
    assert.ok(result.body.data.items.every((item) => item.category === 'food-drink'))

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

test('icons endpoint rejects malformed category and returns no renderable fields', async () => {
  await withServer(async (baseUrl) => {
    let result = await getJson(baseUrl, '/api/v1/icons?category=food%20drink')
    assert.equal(result.response.status, 422)
    assert.ok(result.body.errors.some((err) => err.field === 'category'))

    result = await getJson(baseUrl, '/api/v1/icons?q=icono')
    assert.equal(result.response.status, 200)
    for (const item of result.body.data.items) {
      assert.deepEqual(Object.keys(item).sort(), ['category', 'emoji', 'id', 'keywords', 'label'])
    }
  })
})

test('icons endpoint rejects double-encoded markup', async () => {
  await withServer(async (baseUrl) => {
    const result = await getJson(baseUrl, '/api/v1/icons?q=%253Cscript%253Ealert(1)%253C/script%253E')
    assert.equal(result.response.status, 422)
    assert.equal(result.body.success, false)
    assert.ok(result.body.errors.some((err) => err.field === 'q'))
  })
})
