import fs from 'node:fs'
import path from 'node:path'

type Scope = 'current' | 'next'
type Priority = 'P0' | 'P1' | 'P2'

type ManifestCase = {
  id: string
  scope: Scope
  priority: Priority
  category: string
  method: string
  path: string
  purpose: string
  expected: string
  preconditions: string
  cleanup: string
}

const cases: ManifestCase[] = []

function add(testCase: ManifestCase) {
  cases.push(testCase)
}

function numbered(prefix: string, index: number) {
  return `${prefix}-${String(index).padStart(3, '0')}`
}

const currentRoutes = [
  ['GET', '/health', 'public health check'],
  ['POST', '/api/v1/auth/register', 'public registration'],
  ['POST', '/api/v1/auth/login', 'public login'],
  ['POST', '/api/v1/auth/logout', 'increments tokenVersion and invalidates current access tokens'],
  ['POST', '/api/v1/auth/logout-all', 'invalidate all existing access tokens for current user'],
  ['GET', '/api/v1/auth/me', 'current user lookup'],
  ['PATCH', '/api/v1/users/{userId}', 'self profile mutation'],
  ['PATCH', '/api/v1/users/{userId}/admin', 'admin role or status mutation'],
  ['DELETE', '/api/v1/users/{userId}', 'self or admin user deletion'],
  ['POST', '/api/v1/projects', 'project creation'],
  ['GET', '/api/v1/projects', 'project list'],
  ['GET', '/api/v1/projects/{projectId}', 'project read'],
  ['GET', '/api/v1/projects/{projectId}/editor-state', 'editor-state read'],
  ['PATCH', '/api/v1/projects/{projectId}/editor-state', 'editor-state update'],
  ['PUT', '/api/v1/projects/{projectId}/snapshot', 'snapshot save'],
  ['GET', '/api/v1/projects/{projectId}/snapshot', 'snapshot read'],
] as const

currentRoutes.forEach(([method, routePath, purpose], index) => {
  add({
    id: numbered('ROUTE', index + 1),
    scope: 'current',
    priority: 'P0',
    category: 'contract',
    method,
    path: routePath,
    purpose,
    expected: 'deterministic success or failure envelope with requestId',
    preconditions: routePath.includes('{') || !routePath.includes('/auth/register') ? 'seed auth/user/project fixture as needed' : 'none',
    cleanup: 'delete created resources where applicable',
  })
})

const boundaryCases = [
  ['AUTH-REGISTER', 'POST', '/api/v1/auth/register', 'NoSQL-shaped email/password objects', '422 validation envelope'],
  ['AUTH-LOGIN', 'POST', '/api/v1/auth/login', 'unknown injected field with valid credentials', '422 validation envelope'],
  ['PROJECT-XSS', 'POST', '/api/v1/projects', 'markup-like project name', '422 validation envelope'],
  ['PROJECT-ENTITY-XSS', 'POST', '/api/v1/projects', 'encoded or ambiguous entity-style project name', '422 validation envelope'],
  ['PROJECT-DURATION', 'POST', '/api/v1/projects', 'bounded fractional duration such as 1.5 seconds', '201 success envelope'],
  ['PROJECT-DURATION-EXTREME', 'POST', '/api/v1/projects', 'extreme or overly precise duration', '422 validation envelope'],
  ['PROJECT-QUOTA', 'POST', '/api/v1/projects', 'non-admin user exceeds project quota', '403 project limit reached envelope'],
  ['USER-XSS', 'PATCH', '/api/v1/users/{userId}', 'markup-like username', '422 validation envelope'],
  ['JWT-TOKENVERSION', 'GET', '/api/v1/auth/me', 'signed access token missing tokenVersion claim', '401 unauthorized envelope'],
  ['AUTH-LOG-PII', 'POST', '/api/v1/auth/login', 'failed login and registration logs do not include raw email/password values', 'redacted emailHash or userId only'],
  ['TOKEN-LOGOUT', 'POST', '/api/v1/auth/logout', 'old token rejected after logout tokenVersion increment', '401 on old token'],
  ['TOKEN-VERSION', 'POST', '/api/v1/auth/logout-all', 'old token rejected after tokenVersion increment', '401 on old token'],
  ['EDITOR-STATE-XSS', 'PATCH', '/api/v1/projects/{projectId}/editor-state', 'stored-XSS projectName and nested assets/tracks strings', '422 validation envelope'],
  ['EDITOR-STATE-UNKNOWN', 'PATCH', '/api/v1/projects/{projectId}/editor-state', 'unknown top-level ownerUserId field', '422 validation envelope'],
  ['EDITOR-STATE-CANONICAL', 'GET', '/api/v1/projects/{projectId}/editor-state', 'read-after-write project block matches canonical project metadata', '200 canonical project block with saved editor-only state'],
  ['EDITOR-STATE', 'PATCH', '/api/v1/projects/{projectId}/editor-state', 'stale revision conflict', '409 conflict envelope'],
  ['SNAPSHOT-XSS', 'PUT', '/api/v1/projects/{projectId}/snapshot', 'stored-XSS projectName and nested playback/assets/tracks strings', '422 validation envelope'],
  ['SNAPSHOT-UNKNOWN', 'PUT', '/api/v1/projects/{projectId}/snapshot', 'unknown top-level ownerUserId field', '422 validation envelope'],
  ['SNAPSHOT-NUMERIC', 'PUT', '/api/v1/projects/{projectId}/snapshot', 'extreme duration and resolution values', '422 validation envelope'],
  ['SNAPSHOT-AUTHZ', 'PUT', '/api/v1/projects/{projectId}/snapshot', 'cross-owner save attempt', '403 forbidden envelope'],
] as const

boundaryCases.forEach(([prefix, method, routePath, purpose, expected], index) => {
  add({
    id: numbered(prefix, index + 1),
    scope: 'current',
    priority: 'P0',
    category: 'security',
    method,
    path: routePath,
    purpose,
    expected,
    preconditions: routePath.includes('/projects') ? 'seed editor/admin/viewer users and projects' : 'seed user where needed',
    cleanup: 'delete created resources where applicable',
  })
})

const nextLifecycleCases = [
  ['TOKEN-REFRESH', 'POST', '/api/v1/auth/refresh', 'refresh token rotation'],
  ['TOKEN-REPLAY', 'POST', '/api/v1/auth/refresh', 'refresh token replay detection'],
  ['PASSWORD-FORGOT', 'POST', '/api/v1/auth/forgot-password', 'generic forgot-password response'],
  ['PASSWORD-RESET', 'POST', '/api/v1/auth/reset-password', 'single-use expiring reset token'],
] as const

nextLifecycleCases.forEach(([prefix, method, routePath, purpose], index) => {
  add({
    id: numbered(prefix, index + 1),
    scope: 'next',
    priority: 'P1',
    category: 'auth-lifecycle',
    method,
    path: routePath,
    purpose,
    expected: 'not implemented in current package; design and test before enabling',
    preconditions: 'future auth lifecycle implementation',
    cleanup: 'revoke seeded tokens',
  })
})

const outDir = path.resolve('test-manifest')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(cases, null, 2), 'utf8')
const csvHeader = 'id,scope,priority,category,method,path,purpose,expected,preconditions,cleanup'
const csvRows = cases.map((testCase) =>
  [
    testCase.id,
    testCase.scope,
    testCase.priority,
    testCase.category,
    testCase.method,
    testCase.path,
    testCase.purpose,
    testCase.expected,
    testCase.preconditions,
    testCase.cleanup,
  ].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')
)
fs.writeFileSync(path.join(outDir, 'manifest.csv'), `${csvHeader}\n${csvRows.join('\n')}\n`, 'utf8')

console.log(`Wrote ${cases.length} manifest cases to ${outDir}`)
