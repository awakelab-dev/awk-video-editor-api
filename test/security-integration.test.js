const test = require('node:test')
const assert = require('node:assert/strict')
const jwt = require('jsonwebtoken')
const request = require('supertest')
const path = require('node:path')
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')
const { FakeDb } = require('./helpers/fake-db')

function clearDistCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes(path.join('dist', ''))) delete require.cache[key]
  }
}

function loadApp({ production = false, enableTestRoutes = false } = {}) {
  process.env.NODE_ENV = production ? 'production' : 'test'
  process.env.JWT_SECRET = production ? 'super-secret-production-key-1234567890' : 'test-secret-1234567890'
  process.env.JWT_ISSUER = 'awk-video-editor-api'
  process.env.JWT_AUDIENCE = 'awk-video-editor-client'
  process.env.CORS_ORIGIN = 'http://allowed.example'
  process.env.MONGODB_URI = 'mongodb://fake'
  process.env.MONGODB_DB_NAME = 'awk_video_editor'
  process.env.LOG_HASH_PEPPER = 'test-log-hash-pepper-1234567890'
  if (enableTestRoutes) {
    process.env.ENABLE_TEST_ROUTES = 'true'
  } else {
    delete process.env.ENABLE_TEST_ROUTES
  }
  clearDistCache()
  const { __setTestMongoState, ensureIndexes } = require('../dist/config/mongodb.js')
  const fakeDb = new FakeDb()
  ensureIndexes(fakeDb)
  __setTestMongoState(fakeDb, true)
  const app = require('../dist/app.js').default
  const { env } = require('../dist/config/env.js')
  return { app, fakeDb, env }
}

function issueToken(userId, role = 'editor', secret = 'test-secret-1234567890', overrides = {}) {
  return jwt.sign({ sub: userId, email: `${userId}@example.com`, role, username: userId, tokenVersion: 0, ...overrides }, secret, {
    algorithm: 'HS256',
    issuer: 'awk-video-editor-api',
    audience: 'awk-video-editor-client',
    expiresIn: overrides.expiresIn || '1h',
  })
}

async function seedUsers(fakeDb) {
  const users = fakeDb.collection('users')
  const now = new Date().toISOString()
  await users.insertOne({ id: 'usr_admin', email: 'admin@example.com', username: 'admin', passwordHash: '$2a$12$abcdefghijklmnopqrstuv', role: 'admin', status: 'active', createdAt: now, updatedAt: now, lastLoginAt: null })
  await users.insertOne({ id: 'usr_editorA', email: 'a@example.com', username: 'editorA', passwordHash: '$2a$12$abcdefghijklmnopqrstuv', role: 'editor', status: 'active', createdAt: now, updatedAt: now, lastLoginAt: null })
  await users.insertOne({ id: 'usr_editorB', email: 'b@example.com', username: 'editorB', passwordHash: '$2a$12$abcdefghijklmnopqrstuv', role: 'editor', status: 'active', createdAt: now, updatedAt: now, lastLoginAt: null })
  await users.insertOne({ id: 'usr_viewer', email: 'viewer@example.com', username: 'viewer', passwordHash: '$2a$12$abcdefghijklmnopqrstuv', role: 'viewer', status: 'active', createdAt: now, updatedAt: now, lastLoginAt: null })
}

async function seedProjects(fakeDb) {
  const projects = fakeDb.collection('projects')
  const states = fakeDb.collection('editor_states')
  const snaps = fakeDb.collection('project_snapshots')
  const now = new Date().toISOString()
  await projects.insertOne({ id: 'proj_A', name: 'Project A', duration: 10, resolution: { w: 1920, h: 1080 }, ownerUserId: 'usr_editorA', createdAt: now, updatedAt: now })
  await projects.insertOne({ id: 'proj_B', name: 'Project B', duration: 10, resolution: { w: 1920, h: 1080 }, ownerUserId: 'usr_editorB', createdAt: now, updatedAt: now })
  await states.insertOne({ projectId: 'proj_A', revision: 0, sessionId: 'session_proj_A', playback: { currentTime: 0, isPlaying: false, zoomLevel: 100 }, selection: { selectedElementId: null, selectionSource: null }, assets: [], tracks: [], updatedAt: now, updatedBy: 'usr_editorA', createdAt: now })
  await states.insertOne({ projectId: 'proj_B', revision: 0, sessionId: 'session_proj_B', playback: { currentTime: 0, isPlaying: false, zoomLevel: 100 }, selection: { selectedElementId: null, selectionSource: null }, assets: [], tracks: [], updatedAt: now, updatedBy: 'usr_editorB', createdAt: now })
  await snaps.insertOne({ projectId: 'proj_B', snapshotVersion: 1, savedAt: now, project: { projectName: 'Project B', duration: 10, resolution: { w: 1920, h: 1080 } }, playback: { currentTime: 0, isPlaying: false, zoomLevel: 100 }, selection: { selectedElementId: null, selectionSource: null }, assets: [], tracks: [], createdAt: now, updatedAt: now })
}

test('route exposure drift: chat/images remain intentionally unmounted', async () => {
  const appSource = fs.readFileSync(path.join(process.cwd(), 'src/app.ts'), 'utf8')
  assert.equal(appSource.includes("./routes/chat"), false)
  assert.equal(appSource.includes("./routes/images"), false)
})

test('production app does not mount /api/test and health is minimal', async () => {
  const { app } = loadApp({ production: true, enableTestRoutes: true })
  let res = await request(app).get('/api/test')
  assert.equal(res.status, 404)
  res = await request(app).get('/health')
  assert.equal(res.status, 200)
  assert.deepEqual(Object.keys(res.body.data), ['status'])
  assert.ok(res.body.requestId)
})

test('/api/test is disabled by default and only mounts when explicitly enabled outside production', async () => {
  let loaded = loadApp()
  let res = await request(loaded.app).get('/api/test')
  assert.equal(res.status, 404)

  loaded = loadApp({ enableTestRoutes: true })
  res = await request(loaded.app).get('/api/test')
  assert.equal(res.status, 200)
  assert.equal(res.body.success, true)

  loaded = loadApp({ production: true, enableTestRoutes: true })
  res = await request(loaded.app).get('/api/test')
  assert.equal(res.status, 404)
})

test('security headers and CORS behavior are present', async () => {
  const { app } = loadApp()
  let res = await request(app).get('/health').set('Origin', 'http://allowed.example')
  assert.equal(res.status, 200)
  assert.equal(res.headers['x-content-type-options'], 'nosniff')
  assert.equal(res.headers['referrer-policy'], 'no-referrer')
  assert.ok(res.headers['x-frame-options'] || res.headers['content-security-policy'])
  res = await request(app).get('/health').set('Origin', 'http://evil.example')
  assert.equal(res.status, 403)
  assert.equal(res.body.message, 'Origin not allowed by CORS')
})

test('production env fails hard when JWT secret is missing or placeholder', async () => {
  const script = "process.env.NODE_ENV='production'; delete process.env.JWT_SECRET; process.env.JWT_ISSUER='x'; process.env.JWT_AUDIENCE='y'; process.env.CORS_ORIGIN='https://app.example'; process.env.MONGODB_URI='mongodb://x'; require('./dist/config/env.js')"
  assert.throws(() => execFileSync(process.execPath, ['-e', script], { cwd: process.cwd() }))
  const script2 = "process.env.NODE_ENV='production'; process.env.JWT_SECRET='change-me-in-production'; process.env.JWT_ISSUER='x'; process.env.JWT_AUDIENCE='y'; process.env.CORS_ORIGIN='https://app.example'; process.env.MONGODB_URI='mongodb://x'; require('./dist/config/env.js')"
  assert.throws(() => execFileSync(process.execPath, ['-e', script2], { cwd: process.cwd() }))
  const shortSecret = "process.env.NODE_ENV='production'; process.env.JWT_SECRET='too-short'; process.env.JWT_ISSUER='x'; process.env.JWT_AUDIENCE='y'; process.env.CORS_ORIGIN='https://app.example'; process.env.MONGODB_URI='mongodb://x'; require('./dist/config/env.js')"
  assert.throws(() => execFileSync(process.execPath, ['-e', shortSecret], { cwd: process.cwd() }))
  const repeatedSecret = "process.env.NODE_ENV='production'; process.env.JWT_SECRET='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; process.env.JWT_ISSUER='x'; process.env.JWT_AUDIENCE='y'; process.env.CORS_ORIGIN='https://app.example'; process.env.MONGODB_URI='mongodb://x'; require('./dist/config/env.js')"
  assert.throws(() => execFileSync(process.execPath, ['-e', repeatedSecret], { cwd: process.cwd() }))
  const validSecret = "process.env.NODE_ENV='production'; process.env.JWT_SECRET='prod_7B9c2F6h8J1k4M0q3T5v8X2z9R4s6W1y'; process.env.JWT_ISSUER='x'; process.env.JWT_AUDIENCE='y'; process.env.CORS_ORIGIN='https://app.example'; process.env.MONGODB_URI='mongodb://x'; require('./dist/config/env.js')"
  assert.doesNotThrow(() => execFileSync(process.execPath, ['-e', validSecret], { cwd: process.cwd() }))
})

test('JWT rejects wrong secret, alg none, wrong issuer/audience, expired, bad sub, disabled/deleted users', async () => {
  const { app, fakeDb } = loadApp()
  await seedUsers(fakeDb)

  const wrongSecret = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${issueToken('usr_editorA', 'editor', 'wrong-secret-1234567890')}`)
  assert.equal(wrongSecret.status, 401)

  const noneToken = [Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: 'usr_editorA' })).toString('base64url'), ''].join('.')
  const noneRes = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${noneToken}`)
  assert.equal(noneRes.status, 401)

  const badIssuer = jwt.sign({ sub: 'usr_editorA', email: 'a@example.com', role: 'editor', username: 'editorA' }, 'test-secret-1234567890', { algorithm: 'HS256', issuer: 'bad', audience: 'awk-video-editor-client', expiresIn: '1h' })
  assert.equal((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${badIssuer}`)).status, 401)

  const badAudience = jwt.sign({ sub: 'usr_editorA', email: 'a@example.com', role: 'editor', username: 'editorA' }, 'test-secret-1234567890', { algorithm: 'HS256', issuer: 'awk-video-editor-api', audience: 'bad', expiresIn: '1h' })
  assert.equal((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${badAudience}`)).status, 401)

  const expired = jwt.sign({ sub: 'usr_editorA', email: 'a@example.com', role: 'editor', username: 'editorA' }, 'test-secret-1234567890', { algorithm: 'HS256', issuer: 'awk-video-editor-api', audience: 'awk-video-editor-client', expiresIn: -10 })
  assert.equal((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${expired}`)).status, 401)

  const badSub = jwt.sign({ sub: '', email: 'a@example.com', role: 'editor', username: 'editorA' }, 'test-secret-1234567890', { algorithm: 'HS256', issuer: 'awk-video-editor-api', audience: 'awk-video-editor-client', expiresIn: '1h' })
  assert.equal((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${badSub}`)).status, 401)

  const missingTokenVersion = jwt.sign({ sub: 'usr_admin' }, 'test-secret-1234567890', { algorithm: 'HS256', issuer: 'awk-video-editor-api', audience: 'awk-video-editor-client', expiresIn: '1h' })
  assert.equal((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${missingTokenVersion}`)).status, 401)

  await fakeDb.collection('users').updateOne({ id: 'usr_editorA' }, { $set: { status: 'disabled' } })
  const oldToken = issueToken('usr_editorA')
  assert.equal((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${oldToken}`)).status, 401)

  const deletedToken = issueToken('usr_deleted')
  assert.equal((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${deletedToken}`)).status, 401)
})

test('logout invalidates the presented access token through tokenVersion', async () => {
  const { app, fakeDb } = loadApp()
  await seedUsers(fakeDb)
  const token = issueToken('usr_editorA')
  const logoutRes = await request(app).post('/api/v1/auth/logout').set('Authorization', `Bearer ${token}`)
  assert.equal(logoutRes.status, 200)
  const meRes = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`)
  assert.equal(meRes.status, 401)
})

test('auth and authorization matrix for admin/editor/viewer and projects', async () => {
  const { app, fakeDb } = loadApp()
  await seedUsers(fakeDb)
  await seedProjects(fakeDb)

  const tokenA = issueToken('usr_editorA')
  const tokenB = issueToken('usr_editorB')
  const tokenAdmin = issueToken('usr_admin', 'admin')
  const tokenViewer = issueToken('usr_viewer', 'viewer')

  assert.equal((await request(app).get('/api/v1/projects/proj_B').set('Authorization', `Bearer ${tokenA}`)).status, 403)
  assert.equal((await request(app).patch('/api/v1/projects/proj_B/editor-state').set('Authorization', `Bearer ${tokenA}`).send({ revision: 0, sessionId: 's', project: { projectName: 'x', duration: 1, resolution: { w: 1920, h: 1080 } }, playback: { currentTime: 0, isPlaying: false, zoomLevel: 100 }, selection: { selectedElementId: null, selectionSource: null }, assets: [], tracks: [] })).status, 403)
  assert.equal((await request(app).put('/api/v1/projects/proj_B/snapshot').set('Authorization', `Bearer ${tokenA}`).send({ snapshotVersion: 1, savedAt: new Date().toISOString(), project: { projectName: 'Project B', duration: 10, resolution: { w: 1920, h: 1080 } }, playback: { currentTime: 0, isPlaying: false, zoomLevel: 100 }, selection: { selectedElementId: null, selectionSource: null }, assets: [], tracks: [] })).status, 403)
  assert.equal((await request(app).get('/api/v1/projects/proj_B/snapshot').set('Authorization', `Bearer ${tokenA}`)).status, 403)
  assert.equal((await request(app).patch('/api/v1/users/usr_editorB/admin').set('Authorization', `Bearer ${tokenA}`).send({ status: 'disabled' })).status, 403)
  assert.equal((await request(app).delete('/api/v1/users/usr_editorB').set('Authorization', `Bearer ${tokenA}`)).status, 403)

  assert.equal((await request(app).patch('/api/v1/users/usr_editorA').set('Authorization', `Bearer ${tokenA}`).send({ username: 'editorA2' })).status, 200)
  const selfEsc = await request(app).patch('/api/v1/users/usr_editorA').set('Authorization', `Bearer ${tokenA}`).send({ role: 'admin', status: 'active' })
  assert.equal(selfEsc.status, 422)

  assert.equal((await request(app).get('/api/v1/projects/proj_B').set('Authorization', `Bearer ${tokenAdmin}`)).status, 200)

  const viewerCreate = await request(app).post('/api/v1/projects').set('Authorization', `Bearer ${tokenViewer}`).send({ name: 'Viewer Project', duration: 0, resolution: { w: 1920, h: 1080 } })
  assert.equal(viewerCreate.status, 403)
})

test('duplicate registration and normalization work, passwordHash not returned, generic login failures, auth rate limit', async () => {
  const { app, fakeDb } = loadApp()
  await seedUsers(fakeDb)

  let res = await request(app).post('/api/v1/auth/register').send({ email: 'user@example.com', username: 'newuser', password: 'Sup3r!StrongPass' })
  assert.equal(res.status, 201)
  res = await request(app).post('/api/v1/auth/register').send({ email: 'USER@EXAMPLE.COM', username: 'newuser2', password: 'Sup3r!StrongPass' })
  assert.equal(res.status, 409)

  res = await request(app).post('/api/v1/auth/register').send({ email: 'new@example.com', username: ' admin ', password: 'Sup3r!StrongPass' })
  assert.equal(res.status, 409)

  res = await request(app).post('/api/v1/auth/register').send({ email: { $ne: null }, password: { $ne: null }, username: 'abc' })
  assert.equal(res.status, 422)

  res = await request(app).post('/api/v1/auth/register').send({ email: 'ok@example.com', username: 'okuser', password: 'Sup3r!StrongPass' })
  assert.equal(res.status, 201)
  assert.equal(res.body.data.user.passwordHash, undefined)

  const badExisting = await request(app).post('/api/v1/auth/login').send({ email: 'admin@example.com', password: 'wrong' })
  const badMissing = await request(app).post('/api/v1/auth/login').send({ email: 'missing@example.com', password: 'wrong' })
  assert.equal(badExisting.status, 401)
  assert.equal(badMissing.status, 401)
  assert.equal(badExisting.body.message, badMissing.body.message)

  await fakeDb.collection('users').updateOne({ id: 'usr_admin' }, { $set: { status: 'disabled' } })
  const disabledLogin = await request(app).post('/api/v1/auth/login').send({ email: 'admin@example.com', password: 'wrong' })
  assert.equal(disabledLogin.status, 401)

  let last
  for (let i = 0; i < 11; i += 1) {
    last = await request(app).post('/api/v1/auth/login').send({ email: 'someone@example.com', password: 'wrong' })
  }
  assert.equal(last.status, 429)
})

test('login failures are generic for unknown, wrong-password, disabled, and deleted users', async () => {
  const { app, fakeDb } = loadApp()
  await seedUsers(fakeDb)

  const normalizeFailureBody = (body) => {
    const clone = { ...body }
    delete clone.requestId
    return clone
  }

  const knownWrong = await request(app).post('/api/v1/auth/login').send({ email: 'admin@example.com', password: 'wrong' })
  const unknown = await request(app).post('/api/v1/auth/login').send({ email: 'missing@example.com', password: 'wrong' })

  await fakeDb.collection('users').updateOne({ id: 'usr_editorA' }, { $set: { status: 'disabled' } })
  const disabled = await request(app).post('/api/v1/auth/login').send({ email: 'a@example.com', password: 'wrong' })

  await fakeDb.collection('users').updateOne({ id: 'usr_editorB' }, { $set: { status: 'deleted' } })
  const deleted = await request(app).post('/api/v1/auth/login').send({ email: 'b@example.com', password: 'wrong' })

  for (const res of [knownWrong, unknown, disabled, deleted]) {
    assert.equal(res.status, 401)
    assert.deepEqual(normalizeFailureBody(res.body), { success: false, message: 'Invalid credentials' })
  }
})

test('unknown-user login performs bcrypt compare against the fixed dummy hash', async () => {
  const bcrypt = require('bcryptjs')
  const originalCompare = bcrypt.compare
  const calls = []
  bcrypt.compare = async (password, hash) => {
    calls.push({ password, hash })
    return false
  }

  try {
    const { app } = loadApp()
    const { getDummyLoginPasswordHash } = require('../dist/routes/auth.js')
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'missing-dummy-path@example.com',
      password: 'WrongPass123!',
    })

    assert.equal(res.status, 401)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].hash, getDummyLoginPasswordHash())
  } finally {
    bcrypt.compare = originalCompare
  }
})

test('auth logs do not include raw email or password values', async () => {
  const { app, fakeDb } = loadApp()
  await seedUsers(fakeDb)
  const logs = []
  const originalInfo = console.info
  console.info = (...args) => logs.push(JSON.stringify(args))

  try {
    await request(app).post('/api/v1/auth/login').send({
      email: 'attacker+probe@example.com',
      password: 'WrongPass123!'
    })
    await request(app).post('/api/v1/auth/register').send({
      email: 'new-sensitive@example.com',
      username: 'safeloguser',
      password: 'Sup3r!StrongPass',
    })
  } finally {
    console.info = originalInfo
  }

  const flat = logs.join('\n')
  assert.equal(flat.includes('attacker+probe@example.com'), false)
  assert.equal(flat.includes('new-sensitive@example.com'), false)
  assert.equal(flat.includes('WrongPass123!'), false)
  assert.equal(flat.includes('Sup3r!StrongPass'), false)
  assert.match(flat, /emailHash|userId/)
})

test('strict input boundary rejects login extras and stored-XSS project names', async () => {
  const { app } = loadApp()

  let res = await request(app).post('/api/v1/auth/register').send({
    email: 'strict@example.com',
    username: 'strictuser',
    password: 'Sup3r!StrongPass'
  })
  assert.equal(res.status, 201)

  res = await request(app).post('/api/v1/auth/login').send({
    email: 'strict@example.com',
    password: 'Sup3r!StrongPass',
    injected: 'x'
  })
  assert.equal(res.status, 422)
  assert.ok(res.body.errors.some((error) => error.field === 'injected'))

  res = await request(app).post('/api/v1/auth/login').send({
    email: 'strict@example.com',
    password: 'Sup3r!StrongPass'
  })
  assert.equal(res.status, 200)
  const token = res.body.data.accessToken

  res = await request(app).post('/api/v1/projects').set('Authorization', `Bearer ${token}`).send({
    name: '<script>alert(1)</script>',
    duration: 0,
    resolution: { w: 1920, h: 1080 }
  })
  assert.equal(res.status, 422)
  assert.ok(res.body.errors.some((error) => error.field === 'name'))

  res = await request(app).post('/api/v1/projects').set('Authorization', `Bearer ${token}`).send({
    name: '&lt;script&gt;alert(1)&lt;/script&gt;',
    duration: 0,
    resolution: { w: 1920, h: 1080 }
  })
  assert.equal(res.status, 422)
  assert.ok(res.body.errors.some((error) => error.field === 'name'))

  res = await request(app).post('/api/v1/projects').set('Authorization', `Bearer ${token}`).send({
    name: 'Safe Project Name',
    duration: 1.5,
    resolution: { w: 1920, h: 1080 }
  })
  assert.equal(res.status, 201)
  assert.equal(res.body.data.project.duration, 1.5)

  res = await request(app).post('/api/v1/projects').set('Authorization', `Bearer ${token}`).send({
    name: 'Unsafe Duration Project',
    duration: 1e100,
    resolution: { w: 1920, h: 1080 }
  })
  assert.equal(res.status, 422)
  assert.ok(res.body.errors.some((error) => error.field === 'duration'))
})

test('tokenVersion lifecycle invalidates old access tokens after logout-all and password changes', async () => {
  const { app } = loadApp()

  let res = await request(app).post('/api/v1/auth/register').send({
    email: 'token-life@example.com',
    username: 'tokenlife',
    password: 'Sup3r!StrongPass'
  })
  assert.equal(res.status, 201)
  const userId = res.body.data.user.userId

  res = await request(app).post('/api/v1/auth/login').send({
    email: 'token-life@example.com',
    password: 'Sup3r!StrongPass'
  })
  assert.equal(res.status, 200)
  const firstToken = res.body.data.accessToken
  assert.equal(res.body.data.token, firstToken)
  assert.equal(res.body.data.bearerToken, firstToken)

  res = await request(app).post('/api/v1/auth/logout-all').set('Authorization', `Bearer ${firstToken}`)
  assert.equal(res.status, 200)

  res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${firstToken}`)
  assert.equal(res.status, 401)

  res = await request(app).post('/api/v1/auth/login').send({
    email: 'token-life@example.com',
    password: 'Sup3r!StrongPass'
  })
  assert.equal(res.status, 200)
  const secondToken = res.body.data.accessToken

  res = await request(app).patch(`/api/v1/users/${userId}`).set('Authorization', `Bearer ${secondToken}`).send({
    password: 'N3w!StrongPassForMe'
  })
  assert.equal(res.status, 200)

  res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${secondToken}`)
  assert.equal(res.status, 401)

  res = await request(app).post('/api/v1/auth/login').send({
    email: 'token-life@example.com',
    password: 'N3w!StrongPassForMe'
  })
  assert.equal(res.status, 200)
})

test('admin role or status mutation invalidates the target user old token', async () => {
  const { app, fakeDb } = loadApp()
  await seedUsers(fakeDb)

  const tokenAdmin = issueToken('usr_admin', 'admin')
  const tokenA = issueToken('usr_editorA')

  let res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${tokenA}`)
  assert.equal(res.status, 200)

  res = await request(app).patch('/api/v1/users/usr_editorA/admin').set('Authorization', `Bearer ${tokenAdmin}`).send({ role: 'viewer' })
  assert.equal(res.status, 200)

  res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${tokenA}`)
  assert.equal(res.status, 401)
})

test('user self patch rejects stored-XSS username payloads', async () => {
  const { app, fakeDb } = loadApp()
  await seedUsers(fakeDb)
  const tokenA = issueToken('usr_editorA')

  const res = await request(app).patch('/api/v1/users/usr_editorA').set('Authorization', `Bearer ${tokenA}`).send({
    username: '<svg/onload=alert(1)>'
  })

  assert.equal(res.status, 422)
  assert.ok(res.body.errors.some((error) => error.field === 'username'))
})

test('editor-state rejects stored-XSS projectName and nested text payloads', async () => {
  const { app, fakeDb } = loadApp()
  await seedUsers(fakeDb)
  await seedProjects(fakeDb)
  const tokenA = issueToken('usr_editorA')
  const xss = '<svg/onload=alert(1)>'

  const res = await request(app)
    .patch('/api/v1/projects/proj_A/editor-state')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({
      revision: 0,
      sessionId: 'session_proj_A',
      project: {
        projectName: xss,
        duration: 10,
        resolution: { w: 1920, h: 1080 }
      },
      playback: { currentTime: 0, isPlaying: false, zoomLevel: 100 },
      selection: { selectedElementId: null, selectionSource: null },
      assets: [{ id: 'asset1', title: xss, url: 'javascript:alert(1)' }],
      tracks: [{ id: 'track1', elements: [{ id: 'el1', text: xss }] }]
    })

  assert.equal(res.status, 422)
  const fields = res.body.errors.map((error) => error.field)
  assert.ok(fields.includes('project.projectName'))
  assert.ok(fields.includes('assets[0].title'))
  assert.ok(fields.includes('assets[0].url'))
  assert.ok(fields.includes('tracks[0].elements[0].text'))
})

test('editor-state rejects unknown top-level fields', async () => {
  const { app, fakeDb } = loadApp()
  await seedUsers(fakeDb)
  await seedProjects(fakeDb)
  const tokenA = issueToken('usr_editorA')

  const res = await request(app)
    .patch('/api/v1/projects/proj_A/editor-state')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({
      revision: 0,
      sessionId: 'session_proj_A',
      project: { projectName: 'Project A', duration: 10, resolution: { w: 1920, h: 1080 } },
      playback: { currentTime: 0, isPlaying: false, zoomLevel: 100 },
      selection: { selectedElementId: null, selectionSource: null },
      assets: [],
      tracks: [],
      ownerUserId: 'usr_admin'
    })

  assert.equal(res.status, 422)
  assert.ok(res.body.errors.some((error) => error.field === 'ownerUserId'))
})

test('editor-state read uses canonical project metadata after update', async () => {
  const { app, fakeDb } = loadApp()
  await seedUsers(fakeDb)
  await seedProjects(fakeDb)
  const tokenA = issueToken('usr_editorA')

  const update = await request(app)
    .patch('/api/v1/projects/proj_A/editor-state')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({
      revision: 0,
      sessionId: 'session_proj_A',
      project: {
        projectName: 'Project A Updated',
        duration: 150.5,
        resolution: { w: 1280, h: 720 }
      },
      playback: { currentTime: 12, isPlaying: false, zoomLevel: 100 },
      selection: { selectedElementId: null, selectionSource: null },
      assets: [{ id: 'asset1', title: 'Intro clip', url: 'https://example.test/media/intro.mp4' }],
      tracks: [{ id: 'track1', elements: [{ id: 'el1', text: 'Hello world title' }] }]
    })
  assert.equal(update.status, 200)

  const project = await request(app).get('/api/v1/projects/proj_A').set('Authorization', `Bearer ${tokenA}`)
  assert.equal(project.status, 200)
  assert.equal(project.body.data.name, 'Project A Updated')
  assert.equal(project.body.data.duration, 150.5)
  assert.deepEqual(project.body.data.resolution, { w: 1280, h: 720 })

  const editorState = await request(app).get('/api/v1/projects/proj_A/editor-state').set('Authorization', `Bearer ${tokenA}`)
  assert.equal(editorState.status, 200)
  assert.equal(editorState.body.data.project.projectName, project.body.data.name)
  assert.equal(editorState.body.data.project.duration, project.body.data.duration)
  assert.deepEqual(editorState.body.data.project.resolution, project.body.data.resolution)
  assert.equal(editorState.body.data.playback.currentTime, 12)
  assert.deepEqual(editorState.body.data.assets, [{ id: 'asset1', title: 'Intro clip', url: 'https://example.test/media/intro.mp4' }])
  assert.deepEqual(editorState.body.data.tracks, [{ id: 'track1', elements: [{ id: 'el1', text: 'Hello world title' }] }])
  assert.equal(editorState.body.data.revision, 1)
})

test('snapshot rejects stored-XSS and extreme numeric payloads', async () => {
  const { app, fakeDb } = loadApp()
  await seedUsers(fakeDb)
  await seedProjects(fakeDb)
  const tokenA = issueToken('usr_editorA')
  const xss = '<svg/onload=alert(1)>'

  const res = await request(app)
    .put('/api/v1/projects/proj_A/snapshot')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({
      snapshotVersion: 1,
      savedAt: new Date().toISOString(),
      project: {
        projectName: xss,
        duration: 1e100,
        resolution: { w: 999999999, h: 999999999 }
      },
      playback: {
        currentTime: 0,
        isPlaying: false,
        zoomLevel: 100,
        customHtml: xss
      },
      selection: { selectedElementId: null, selectionSource: null },
      assets: [{ html: xss, url: 'javascript:alert(1)' }],
      tracks: [{ id: 'track1', elements: [{ id: 'el1', caption: xss }] }]
    })

  assert.equal(res.status, 422)
  const fields = res.body.errors.map((error) => error.field)
  assert.ok(fields.includes('project.projectName'))
  assert.ok(fields.includes('project.duration'))
  assert.ok(fields.includes('project.resolution.w'))
  assert.ok(fields.includes('project.resolution.h'))
  assert.ok(fields.includes('playback.customHtml'))
  assert.ok(fields.includes('assets[0].html'))
  assert.ok(fields.includes('assets[0].url'))
  assert.ok(fields.includes('tracks[0].elements[0].caption'))
})

test('snapshot rejects unknown top-level fields', async () => {
  const { app, fakeDb } = loadApp()
  await seedUsers(fakeDb)
  await seedProjects(fakeDb)
  const tokenA = issueToken('usr_editorA')

  const res = await request(app)
    .put('/api/v1/projects/proj_A/snapshot')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({
      snapshotVersion: 1,
      savedAt: new Date().toISOString(),
      project: { projectName: 'Project A', duration: 10, resolution: { w: 1920, h: 1080 } },
      playback: { currentTime: 0, isPlaying: false, zoomLevel: 100 },
      selection: { selectedElementId: null, selectionSource: null },
      assets: [],
      tracks: [],
      ownerUserId: 'usr_admin'
    })

  assert.equal(res.status, 422)
  assert.ok(res.body.errors.some((error) => error.field === 'ownerUserId'))
})

test('project creation validation, listing, pagination cap, no ownerUserId exposed', async () => {
  const { app, fakeDb } = loadApp()
  await seedUsers(fakeDb)
  const tokenA = issueToken('usr_editorA')
  const tokenAdmin = issueToken('usr_admin', 'admin')
  assert.equal((await request(app).post('/api/v1/projects').send({ name: 'x', resolution: { w: 1, h: 1 } })).status, 401)
  let res = await request(app).post('/api/v1/projects').set('Authorization', `Bearer ${tokenA}`).send({ projectId: 'bad', ownerUserId: 'bad', createdAt: 'x', updatedAt: 'x', name: '', resolution: { w: 0, h: -1 } })
  assert.equal(res.status, 422)
  res = await request(app).post('/api/v1/projects').set('Authorization', `Bearer ${tokenA}`).send({ name: '  My Project  ', duration: 0, resolution: { w: 1920, h: 1080 } })
  assert.equal(res.status, 201)
  assert.equal(res.body.data.project.name, 'My Project')
  for (let i = 0; i < 120; i += 1) {
    await request(app).post('/api/v1/projects').set('Authorization', `Bearer ${tokenAdmin}`).send({ name: `P${i}`, duration: 0, resolution: { w: 1920, h: 1080 } })
  }
  res = await request(app).get('/api/v1/projects?limit=999999').set('Authorization', `Bearer ${tokenAdmin}`)
  assert.equal(res.status, 200)
  assert.equal(res.body.data.length, 100)
  assert.equal(res.body.data.some((p) => 'ownerUserId' in p || '_id' in p), false)
})

test('editor project quota blocks unbounded project creation while admins bypass quota', async () => {
  const { app, fakeDb, env } = loadApp()
  await seedUsers(fakeDb)
  const tokenA = issueToken('usr_editorA')
  const tokenAdmin = issueToken('usr_admin', 'admin')

  for (let i = 0; i < env.MAX_PROJECTS_PER_USER; i += 1) {
    const res = await request(app).post('/api/v1/projects').set('Authorization', `Bearer ${tokenA}`).send({
      name: `Quota Project ${i}`,
      duration: 1.5,
      resolution: { w: 1920, h: 1080 }
    })
    assert.equal(res.status, 201)
  }

  const overQuota = await request(app).post('/api/v1/projects').set('Authorization', `Bearer ${tokenA}`).send({
    name: 'Over quota',
    duration: 1.5,
    resolution: { w: 1920, h: 1080 }
  })
  assert.equal(overQuota.status, 403)
  assert.equal(overQuota.body.message, 'Project limit reached')

  const adminCreate = await request(app).post('/api/v1/projects').set('Authorization', `Bearer ${tokenAdmin}`).send({
    name: 'Admin quota bypass',
    duration: 1.5,
    resolution: { w: 1920, h: 1080 }
  })
  assert.equal(adminCreate.status, 201)
})

test('editor-state security and atomic revision conflict behavior', async () => {
  const { app, fakeDb } = loadApp()
  await seedUsers(fakeDb)
  await seedProjects(fakeDb)
  const tokenA = issueToken('usr_editorA')
  const tokenB = issueToken('usr_editorB')

  const body = { revision: 0, sessionId: 'session_proj_A', project: { projectName: 'Project A', duration: 10, resolution: { w: 1920, h: 1080 } }, playback: { currentTime: 0, isPlaying: false, zoomLevel: 100 }, selection: { selectedElementId: null, selectionSource: null }, assets: [], tracks: [] }
  const [r1, r2] = await Promise.all([
    request(app).patch('/api/v1/projects/proj_A/editor-state').set('Authorization', `Bearer ${tokenA}`).send(body),
    request(app).patch('/api/v1/projects/proj_A/editor-state').set('Authorization', `Bearer ${tokenA}`).send(body),
  ])
  assert.deepEqual([r1.status, r2.status].sort(), [200, 409])
  assert.equal((await request(app).patch('/api/v1/projects/proj_A/editor-state').set('Authorization', `Bearer ${tokenB}`).send(body)).status, 403)
  assert.equal((await request(app).patch('/api/v1/projects/unknown/editor-state').set('Authorization', `Bearer ${tokenA}`).send(body)).status, 404)
})

test('snapshot security, auth required, owner enforced, idempotent save', async () => {
  const { app, fakeDb } = loadApp()
  await seedUsers(fakeDb)
  await seedProjects(fakeDb)
  const tokenA = issueToken('usr_editorA')
  const tokenB = issueToken('usr_editorB')
  const snapshotBody = { snapshotVersion: 1, savedAt: new Date().toISOString(), project: { projectName: 'Project A', duration: 10, resolution: { w: 1920, h: 1080 } }, playback: { currentTime: 0, isPlaying: false, zoomLevel: 100 }, selection: { selectedElementId: null, selectionSource: null }, assets: [], tracks: [] }
  assert.equal((await request(app).get('/api/v1/projects/proj_A/snapshot')).status, 401)
  assert.equal((await request(app).put('/api/v1/projects/proj_A/snapshot').set('Authorization', `Bearer ${tokenB}`).send(snapshotBody)).status, 403)
  const first = await request(app).put('/api/v1/projects/proj_A/snapshot').set('Authorization', `Bearer ${tokenA}`).send(snapshotBody)
  const second = await request(app).put('/api/v1/projects/proj_A/snapshot').set('Authorization', `Bearer ${tokenA}`).send(snapshotBody)
  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  assert.equal((await request(app).get('/api/v1/projects/proj_A/snapshot').set('Authorization', `Bearer ${tokenA}`)).status, 200)
})

test('invalid JSON, large body, and clean error shape', async () => {
  const { app } = loadApp()
  let res = await request(app).post('/api/v1/auth/register').set('Content-Type', 'application/json').send('{bad json')
  assert.equal(res.status, 400)
  assert.equal(typeof res.body.requestId, 'string')
  const huge = 'A'.repeat(1024 * 1024 + 100)
  res = await request(app).post('/api/v1/auth/register').set('Content-Type', 'application/json').send(JSON.stringify({ email: 'x@example.com', username: 'xuser', password: huge }))
  assert.equal(res.status, 413)
  assert.equal(typeof res.body.requestId, 'string')
})
