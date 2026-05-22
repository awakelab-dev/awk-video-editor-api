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

test('rejects invalid audioUrl in POST /api/subtitles', async () => {
  const { app } = await loadApp()

  const response = await request(app)
    .post('/api/subtitles')
    .send({ audioUrl: 'notaurl' })

  assert.equal(response.status, 400)
  assert.equal(response.body.message, 'audioUrl debe ser una URL valida con protocolo http o https.')
})

test('rejects request without audioUrl or audio file', async () => {
  const { app } = await loadApp()

  const response = await request(app)
    .post('/api/subtitles')
    .send({})

  assert.equal(response.status, 400)
  assert.equal(response.body.message, 'Debes enviar audioUrl o un archivo de audio en el campo "audio".')
})

test('rejects request when both audioUrl and audio file are sent', async () => {
  const { app } = await loadApp()

  const response = await request(app)
    .post('/api/subtitles')
    .field('audioUrl', 'https://example.com/audio.mp3')
    .attach('audio', Buffer.from('fake-audio'), {
      filename: 'audio.mp3',
      contentType: 'audio/mpeg',
    })

  assert.equal(response.status, 400)
  assert.equal(response.body.message, 'Envia solo una fuente de audio: audioUrl o archivo en "audio".')
})
