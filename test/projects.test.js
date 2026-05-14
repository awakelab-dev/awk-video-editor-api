const assert = require('node:assert/strict')
const test = require('node:test')

const {
  buildInitialEditorState,
  createDefaultProjectTracks,
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
    revision: 0,
    playback: {
      currentTime: 0,
      isPlaying: false,
      zoomLevel: 100
    },
    selection: {
      selectedElementId: null,
      selectedTrackId: null,
      selectionSource: null
    },
    assets: {},
    tracks: createDefaultProjectTracks(),
    elements: {},
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
    tracks: createDefaultProjectTracks(),
    updatedAt: '2026-04-27T10:30:00.000Z'
  })
})

test('normalizes project track relationships for frontend timeline restore', () => {
  const apiProject = toApiProject({
    id: 'proj_abc',
    name: 'Demo',
    duration: 5,
    resolution: { w: 1920, h: 1080 },
    revision: 3,
    tracks: [
      {
        id: 'track-media',
        name: 'Media',
        type: 'mixed',
        elementIds: []
      }
    ],
    elements: {
      shape_abc: {
        id: 'shape_abc',
        trackId: 'track-media',
        type: 'shape',
        name: 'Rectangulo',
        startTime: 0,
        duration: 5,
        opacity: 100
      }
    },
    createdAt: '2026-04-27T10:30:00.000Z',
    updatedAt: '2026-04-27T10:30:00.000Z'
  })

  assert.equal(apiProject.elements.shape_abc.type, 'shape')
  assert.deepEqual(apiProject.tracks[0].elementIds, ['shape_abc'])
})

test('derives track elementIds from legacy track elements arrays', () => {
  const apiProject = toApiProject({
    id: 'proj_abc',
    name: 'Demo',
    duration: 5,
    resolution: { w: 1920, h: 1080 },
    tracks: [
      {
        id: 'track-media',
        name: 'Media',
        type: 'mixed',
        elements: [
          {
            id: 'shape_abc',
            type: 'shape',
            name: 'Rectangulo'
          }
        ]
      }
    ],
    elements: {
      shape_abc: {
        id: 'shape_abc',
        type: 'shape',
        name: 'Rectangulo'
      }
    },
    createdAt: '2026-04-27T10:30:00.000Z',
    updatedAt: '2026-04-27T10:30:00.000Z'
  })

  assert.deepEqual(apiProject.tracks[0].elementIds, ['shape_abc'])
  assert.ok(apiProject.tracks.some((track) => track.id === 'track-text'))
  assert.ok(apiProject.tracks.some((track) => track.id === 'track-audio'))
})
