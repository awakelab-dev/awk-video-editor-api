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
  return { app }
}

async function createProject(app, name = 'Original Project') {
  const response = await request(app).post('/api/v1/projects').send({
    name,
    resolution: { w: 1920, h: 1080 }
  })

  assert.equal(response.status, 201)
  return response.body.data.project
}

test('renames a project with PATCH /api/v1/projects/:projectId', async () => {
  const { app } = await loadApp()
  const project = await createProject(app)

  const renameResponse = await request(app)
    .patch(`/api/v1/projects/${project.projectId}`)
    .send({ name: '  Renamed Project  ' })

  assert.equal(renameResponse.status, 200)
  assert.equal(renameResponse.body.success, true)
  assert.equal(renameResponse.body.data.projectId, project.projectId)
  assert.equal(renameResponse.body.data.name, 'Renamed Project')
  assert.equal(renameResponse.body.data.revision, 1)

  const fetchResponse = await request(app).get(`/api/v1/projects/${project.projectId}`)
  assert.equal(fetchResponse.status, 200)
  assert.equal(fetchResponse.body.data.name, 'Renamed Project')
  assert.equal(fetchResponse.body.data.revision, 1)
})

test('rejects invalid project rename payloads', async () => {
  const { app } = await loadApp()
  const project = await createProject(app)

  const response = await request(app)
    .patch(`/api/v1/projects/${project.projectId}`)
    .send({ name: '   ' })

  assert.equal(response.status, 422)
  assert.equal(response.body.success, false)
  assert.ok(response.body.errors.some((error) => error.field === 'name'))
})
