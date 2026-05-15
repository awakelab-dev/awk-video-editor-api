const assert = require('node:assert/strict')
const test = require('node:test')
const path = require('node:path')
const request = require('supertest')
const { FakeDb } = require('./helpers/fake-db')

function clearDistCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes(path.join('dist', ''))) delete require.cache[key]
  }
}

async function loadApp() {
  process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = 'test-secret-1234567890'
  process.env.JWT_ISSUER = 'awk-video-editor-api'
  process.env.JWT_AUDIENCE = 'awk-video-editor-client'
  process.env.MONGODB_URI = 'mongodb://fake'
  process.env.MONGODB_DB_NAME = 'awk_video_editor'
  process.env.LOG_HASH_PEPPER = 'test-log-hash-pepper-1234567890'
  process.env.OPENAI_API_KEY = 'test-openai-key'
  process.env.AUTH_RATE_LIMIT_MAX = '100'

  clearDistCache()
  const { __setTestMongoState, ensureIndexes } = require('../dist/config/mongodb.js')
  const fakeDb = new FakeDb()
  await ensureIndexes(fakeDb)
  __setTestMongoState(fakeDb, true)
  const app = require('../dist/app.js').default
  return { app, fakeDb }
}

test('register, login, me, profile update, and logout work with JWT auth', async () => {
  const { app } = await loadApp()

  let res = await request(app).post('/api/v1/auth/register').send({
    email: 'USER@example.com',
    username: 'safeuser',
    password: 'Sup3r!StrongPass',
  })
  assert.equal(res.status, 201)
  assert.equal(res.body.data.user.email, 'user@example.com')
  assert.equal(res.body.data.user.passwordHash, undefined)
  const userId = res.body.data.user.userId

  res = await request(app).post('/api/v1/auth/register').send({
    email: 'user@example.com',
    username: 'otheruser',
    password: 'Sup3r!StrongPass',
  })
  assert.equal(res.status, 409)

  res = await request(app).post('/api/v1/auth/login').send({
    email: 'user@example.com',
    password: 'Sup3r!StrongPass',
  })
  assert.equal(res.status, 200)
  assert.equal(res.body.data.tokenType, 'Bearer')
  const token = res.body.data.accessToken
  assert.ok(token)

  res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
  assert.equal(res.body.data.user.userId, userId)

  res = await request(app).patch(`/api/v1/users/${userId}`).set('Authorization', `Bearer ${token}`).send({
    username: 'safeuser2',
  })
  assert.equal(res.status, 200)
  assert.equal(res.body.data.user.username, 'safeuser2')

  res = await request(app).post('/api/v1/auth/logout').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)

  res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 401)
})
