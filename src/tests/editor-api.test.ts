import request from 'supertest'
import { createApp } from '../app'
import type {
  EditorStateRecord,
  MediaAssetRecord,
  ProjectRecord,
  SceneRecord,
  SessionRecord,
  SnapshotRecord,
  VideoEditorRepository
} from '../modules/editor/editor.repository'

class MemoryRepository implements VideoEditorRepository {
  private readonly projects = new Map<string, ProjectRecord>()
  private readonly editorStates = new Map<string, EditorStateRecord>()
  private readonly snapshots = new Map<string, SnapshotRecord>()
  private readonly sessions = new Map<string, SessionRecord>()
  private readonly media = new Map<string, MediaAssetRecord>()
  private readonly scenes = new Map<string, SceneRecord>()

  async findProjects(): Promise<ProjectRecord[]> {
    return [...this.projects.values()]
  }

  async findProjectById(projectId: string): Promise<ProjectRecord | null> {
    return this.projects.get(projectId) ?? null
  }

  async upsertProject(project: ProjectRecord): Promise<ProjectRecord> {
    this.projects.set(project.id, project)
    return project
  }

  async patchProject(projectId: string, patch: Partial<ProjectRecord>): Promise<ProjectRecord | null> {
    const current = this.projects.get(projectId)
    if (!current) return null
    const next = { ...current, ...patch }
    this.projects.set(projectId, next)
    return next
  }

  async findEditorState(projectId: string): Promise<EditorStateRecord | null> {
    return this.editorStates.get(projectId) ?? null
  }

  async upsertEditorState(editorState: EditorStateRecord): Promise<EditorStateRecord> {
    this.editorStates.set(editorState.projectId, editorState)
    return editorState
  }

  async findSnapshot(projectId: string): Promise<SnapshotRecord | null> {
    return this.snapshots.get(projectId) ?? null
  }

  async upsertSnapshot(snapshot: SnapshotRecord): Promise<SnapshotRecord> {
    this.snapshots.set(snapshot.projectId, snapshot)
    return snapshot
  }

  async findSession(projectId: string): Promise<SessionRecord | null> {
    return this.sessions.get(projectId) ?? null
  }

  async upsertSession(session: SessionRecord): Promise<SessionRecord> {
    this.sessions.set(session.projectId, session)
    return session
  }

  async listMedia(filters: {
    projectId?: string
    type?: 'video' | 'image' | 'audio'
    search?: string
    page: number
    limit: number
  }): Promise<{ items: MediaAssetRecord[]; total: number }> {
    let items = [...this.media.values()]
    if (filters.projectId) items = items.filter((item) => item.projectId === filters.projectId)
    if (filters.type) items = items.filter((item) => item.type === filters.type)
    if (filters.search) {
      const needle = filters.search.toLowerCase()
      items = items.filter((item) => item.fileName.toLowerCase().includes(needle))
    }

    const total = items.length
    const start = (filters.page - 1) * filters.limit
    return {
      items: items.slice(start, start + filters.limit),
      total
    }
  }

  async upsertMediaBatch(items: MediaAssetRecord[]): Promise<void> {
    items.forEach((item) => this.media.set(item.id, item))
  }

  async findScene(projectId: string, sceneId: string): Promise<SceneRecord | null> {
    return this.scenes.get(`${projectId}:${sceneId}`) ?? null
  }

  async upsertScene(scene: SceneRecord): Promise<SceneRecord> {
    this.scenes.set(`${scene.projectId}:${scene.sceneId}`, scene)
    return scene
  }
}

describe('AWK Video Editor API', () => {
  const repository = new MemoryRepository()
  const app = createApp(repository)

  it('GET /health returns success envelope', async () => {
    const response = await request(app).get('/health')
    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
  })

  it('creates a default project and returns editor state', async () => {
    const response = await request(app).get('/api/v1/projects/demo-project/editor-state')
    expect(response.status).toBe(200)
    expect(response.body.data.projectId).toBe('demo-project')
  })

  it('creates text and persists through editor-state', async () => {
    await request(app)
      .post('/api/v1/projects/demo-project/session/join')
      .send({ participantId: 'user_1', displayName: 'Editor One' })

    const createTextResponse = await request(app)
      .post('/api/v1/projects/demo-project/elements')
      .send({
        type: 'text',
        trackId: 'track-text',
        text: 'Hello world',
        position: { x: 0.5, y: 0.5 },
        style: { fontSize: 42, fontWeight: 700, color: '#FFFFFF' },
        timing: { startMs: 0, durationMs: 4000 }
      })

    expect(createTextResponse.status).toBe(201)

    const stateResponse = await request(app).get('/api/v1/projects/demo-project/editor-state')
    expect(stateResponse.status).toBe(200)
    expect(stateResponse.body.data.tracks.length).toBeGreaterThan(0)
  })

  it('saves and fetches scene payload', async () => {
    await request(app)
      .post('/api/v1/projects')
      .send({
        id: 'proj_scene_test',
        name: 'Scene Project',
        duration: 150,
        resolution: { w: 1920, h: 1080 }
      })

    const saveResponse = await request(app)
      .put('/api/v1/projects/proj_scene_test/scenes/scene_main')
      .send({
        projectId: 'proj_scene_test',
        sceneId: 'scene_main',
        metadata: {
          name: 'Main Scene',
          editorVersion: '1.0.0'
        },
        payload: {
          canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
          layerOrder: ['track-video-1', 'track-text-1'],
          timeline: {
            fps: 30,
            duration: 12,
            tracks: [
              {
                id: 'track-video-1',
                name: 'Video',
                layerOrder: 0,
                duration: 12,
                elements: [
                  {
                    id: 'video-1',
                    type: 'video',
                    name: 'Main Video',
                    layerOrder: 0,
                    timing: { start: 0, duration: 12 },
                    transform: {
                      x: 960,
                      y: 540,
                      width: 1920,
                      height: 1080,
                      rotation: 0,
                      scaleX: 1,
                      scaleY: 1
                    },
                    style: {},
                    content: {},
                    resourceRef: {
                      id: 'asset-video-001',
                      kind: 'video',
                      url: 'https://example.com/video.mp4'
                    }
                  }
                ]
              }
            ]
          },
          resources: [],
          selection: { selectedElementId: null, selectedTrackId: null }
        }
      })

    expect(saveResponse.status).toBe(200)
    expect(saveResponse.body.data.sceneId).toBe('scene_main')
    expect(saveResponse.body.data.version).toBe(1)

    const getResponse = await request(app).get('/api/v1/projects/proj_scene_test/scenes/scene_main')
    expect(getResponse.status).toBe(200)
    expect(getResponse.body.data.sceneId).toBe('scene_main')
  })

  it('returns 422 for invalid scene payload', async () => {
    const response = await request(app)
      .put('/api/v1/projects/demo-project/scenes/scene_bad')
      .send({
        projectId: 'demo-project',
        sceneId: 'scene_bad',
        metadata: {},
        payload: {}
      })

    expect(response.status).toBe(422)
  })

  it('returns 409 on stale editor-state revision', async () => {
    const stateResponse = await request(app).get('/api/v1/projects/demo-project/editor-state')
    const wrongRevision = stateResponse.body.data.revision - 1

    const response = await request(app)
      .patch('/api/v1/projects/demo-project/editor-state')
      .send({
        revision: wrongRevision,
        playback: { currentTime: 0, isPlaying: false, zoomLevel: 100 },
        selection: { selectedElementId: null, selectionSource: null },
        assets: [],
        tracks: []
      })

    expect(response.status).toBe(409)
  })
})
