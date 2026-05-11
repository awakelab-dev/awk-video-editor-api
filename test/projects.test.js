const assert = require('node:assert/strict')
const test = require('node:test')

const {
  buildInitialEditorState,
  generateProjectId,
  normalizeCreateProjectPayload,
  toApiProject,
  validateCreateProjectPayload
} = require('../dist/domain/projects')

test('generates backend-owned project ids with proj_ prefix', () => {
  const projectId = generateProjectId()
  assert.match(projectId, /^proj_[a-f0-9]{32}$/)
})

test('validates project creation payload and rejects frontend ids plus unknown fields', () => {
  const errors = validateCreateProjectPayload({
    id: 'bad',
    projectId: 'bad',
    name: '',
    duration: -1,
    resolution: { w: 0, h: 1080, extra: true },
    unknown: true
  })

  const fields = errors.map((error) => error.field)
  assert.ok(fields.includes('id'))
  assert.ok(fields.includes('projectId'))
  assert.ok(fields.includes('name'))
  assert.ok(fields.includes('duration'))
  assert.ok(fields.includes('resolution.w'))
  assert.ok(fields.includes('resolution.extra'))
  assert.ok(fields.includes('unknown'))
})

test('rejects markup-like project names and allows bounded fractional duration', () => {
  const scriptNameErrors = validateCreateProjectPayload({
    name: '<script>alert(1)</script>',
    duration: 0,
    resolution: { w: 1920, h: 1080 }
  })
  assert.ok(scriptNameErrors.some((error) => error.field === 'name'))

  const eventHandlerErrors = validateCreateProjectPayload({
    name: 'hero onerror=alert(1)',
    duration: 0,
    resolution: { w: 1920, h: 1080 }
  })
  assert.ok(eventHandlerErrors.some((error) => error.field === 'name'))

  const encodedTagErrors = validateCreateProjectPayload({
    name: '&lt;script&gt;alert(1)&lt;/script&gt;',
    duration: 0,
    resolution: { w: 1920, h: 1080 }
  })
  assert.ok(encodedTagErrors.some((error) => error.field === 'name'))

  const ambiguousEntityErrors = validateCreateProjectPayload({
    name: 'Project &alt preview',
    duration: 0,
    resolution: { w: 1920, h: 1080 }
  })
  assert.ok(ambiguousEntityErrors.some((error) => error.field === 'name'))

  const fractionalDurationErrors = validateCreateProjectPayload({
    name: 'Safe Project Name',
    duration: 1.5,
    resolution: { w: 1920, h: 1080 }
  })
  assert.equal(fractionalDurationErrors.some((error) => error.field === 'duration'), false)

  const tooPreciseDurationErrors = validateCreateProjectPayload({
    name: 'Safe Project Name',
    duration: 1.2345,
    resolution: { w: 1920, h: 1080 }
  })
  assert.ok(tooPreciseDurationErrors.some((error) => error.field === 'duration'))

  const extremeDurationErrors = validateCreateProjectPayload({
    name: 'Safe Project Name',
    duration: 1e100,
    resolution: { w: 1920, h: 1080 }
  })
  assert.ok(extremeDurationErrors.some((error) => error.field === 'duration'))
})

test('normalizes creation payload with default duration', () => {
  const normalized = normalizeCreateProjectPayload({
    name: '  Campana Primavera 2026  ',
    resolution: { w: 1920, h: 1080 }
  })

  assert.deepEqual(normalized, {
    name: 'Campana Primavera 2026',
    duration: 0,
    resolution: { w: 1920, h: 1080 }
  })
})

test('maps stored project to public API project without exposing Mongo _id', () => {
  const apiProject = toApiProject({
    id: 'proj_abc',
    name: 'Demo',
    duration: 0,
    resolution: { w: 1920, h: 1080 },
    createdAt: '2026-04-27T10:30:00.000Z',
    updatedAt: '2026-04-27T10:30:00.000Z'
  })

  assert.deepEqual(apiProject, {
    projectId: 'proj_abc',
    name: 'Demo',
    duration: 0,
    resolution: { w: 1920, h: 1080 },
    createdAt: '2026-04-27T10:30:00.000Z',
    updatedAt: '2026-04-27T10:30:00.000Z'
  })
})

test('builds initial editor state required by the frontend', () => {
  const state = buildInitialEditorState({
    id: 'proj_abc',
    name: 'Demo',
    duration: 0,
    resolution: { w: 1920, h: 1080 },
    createdAt: '2026-04-27T10:30:00.000Z',
    updatedAt: '2026-04-27T10:30:00.000Z'
  })

  assert.deepEqual(state, {
    projectId: 'proj_abc',
    project: {
      projectName: 'Demo',
      duration: 0,
      resolution: { w: 1920, h: 1080 }
    },
    playback: {
      currentTime: 0,
      isPlaying: false,
      zoomLevel: 100
    },
    selection: {
      selectedElementId: null,
      selectionSource: null
    },
    assets: [],
    tracks: [],
    updatedAt: '2026-04-27T10:30:00.000Z'
  })
})
