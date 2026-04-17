import { Collection, Db, Filter } from 'mongodb'

export type ProjectRecord = {
  id: string
  name: string
  duration: number
  resolution: { w: number; h: number }
  createdAt: string
  updatedAt: string
}

export type EditorStateRecord = {
  projectId: string
  revision: number
  sessionId: string | null
  playback: { currentTime: number; isPlaying: boolean; zoomLevel: number }
  selection: { selectedElementId: string | null; selectionSource: 'canvas' | 'timeline' | 'element-library' | null }
  assets: Array<Record<string, unknown>>
  tracks: Array<Record<string, unknown>>
  updatedAt: string
  updatedBy: string
}

export type SnapshotRecord = {
  projectId: string
  snapshotVersion: 1
  savedAt: string
  project: { projectName: string; duration: number; resolution: { w: number; h: number } }
  playback: { currentTime: number; isPlaying: boolean; zoomLevel: number }
  selection: { selectedElementId: string | null; selectionSource: 'canvas' | 'timeline' | 'element-library' | null }
  assets: Array<{ id: string; duration: number | null }>
  tracks: Array<{ id: string; duration: number; elements: Array<{ id: string; duration: number }> }>
  updatedAt: string
}

export type SessionRecord = {
  sessionId: string
  projectId: string
  participants: Array<{ participantId: string; displayName: string; joinedAt: string }>
  revision: number
  lastActivityAt: string
}

export type MediaAssetRecord = {
  id: string
  projectId: string
  fileName: string
  type: 'video' | 'image' | 'audio'
  source: string
  mimeType?: string
  duration?: number | null
  width?: number
  height?: number
  updatedAt: string
}

export type SceneRecord = {
  projectId: string
  sceneId: string
  version: number
  metadata: {
    name: string
    description?: string
    editorVersion?: string
    createdBy?: string
    updatedBy?: string
  }
  payload: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface VideoEditorRepository {
  findProjects(): Promise<ProjectRecord[]>
  findProjectById(projectId: string): Promise<ProjectRecord | null>
  upsertProject(project: ProjectRecord): Promise<ProjectRecord>
  patchProject(projectId: string, patch: Partial<ProjectRecord>): Promise<ProjectRecord | null>

  findEditorState(projectId: string): Promise<EditorStateRecord | null>
  upsertEditorState(editorState: EditorStateRecord): Promise<EditorStateRecord>

  findSnapshot(projectId: string): Promise<SnapshotRecord | null>
  upsertSnapshot(snapshot: SnapshotRecord): Promise<SnapshotRecord>

  findSession(projectId: string): Promise<SessionRecord | null>
  upsertSession(session: SessionRecord): Promise<SessionRecord>

  listMedia(filters: {
    projectId?: string
    type?: 'video' | 'image' | 'audio'
    search?: string
    page: number
    limit: number
  }): Promise<{ items: MediaAssetRecord[]; total: number }>
  upsertMediaBatch(items: MediaAssetRecord[]): Promise<void>

  findScene(projectId: string, sceneId: string): Promise<SceneRecord | null>
  upsertScene(scene: SceneRecord): Promise<SceneRecord>
}

class MongoVideoEditorRepository implements VideoEditorRepository {
  private readonly projects: Collection<ProjectRecord>
  private readonly editorStates: Collection<EditorStateRecord>
  private readonly snapshots: Collection<SnapshotRecord>
  private readonly sessions: Collection<SessionRecord>
  private readonly mediaAssets: Collection<MediaAssetRecord>
  private readonly scenes: Collection<SceneRecord>

  constructor(db: Db) {
    this.projects = db.collection<ProjectRecord>('projects')
    this.editorStates = db.collection<EditorStateRecord>('editor_states')
    this.snapshots = db.collection<SnapshotRecord>('snapshots')
    this.sessions = db.collection<SessionRecord>('sessions')
    this.mediaAssets = db.collection<MediaAssetRecord>('media_assets')
    this.scenes = db.collection<SceneRecord>('scenes')
  }

  async findProjects(): Promise<ProjectRecord[]> {
    return this.projects.find({}, { projection: { _id: 0 } }).sort({ updatedAt: -1 }).toArray()
  }

  async findProjectById(projectId: string): Promise<ProjectRecord | null> {
    return this.projects.findOne({ id: projectId }, { projection: { _id: 0 } })
  }

  async upsertProject(project: ProjectRecord): Promise<ProjectRecord> {
    await this.projects.updateOne({ id: project.id }, { $set: project }, { upsert: true })
    return project
  }

  async patchProject(projectId: string, patch: Partial<ProjectRecord>): Promise<ProjectRecord | null> {
    await this.projects.updateOne({ id: projectId }, { $set: patch })
    return this.findProjectById(projectId)
  }

  async findEditorState(projectId: string): Promise<EditorStateRecord | null> {
    return this.editorStates.findOne({ projectId }, { projection: { _id: 0 } })
  }

  async upsertEditorState(editorState: EditorStateRecord): Promise<EditorStateRecord> {
    await this.editorStates.updateOne(
      { projectId: editorState.projectId },
      { $set: editorState },
      { upsert: true }
    )
    return editorState
  }

  async findSnapshot(projectId: string): Promise<SnapshotRecord | null> {
    return this.snapshots.findOne({ projectId }, { projection: { _id: 0 } })
  }

  async upsertSnapshot(snapshot: SnapshotRecord): Promise<SnapshotRecord> {
    await this.snapshots.updateOne(
      { projectId: snapshot.projectId },
      { $set: snapshot },
      { upsert: true }
    )
    return snapshot
  }

  async findSession(projectId: string): Promise<SessionRecord | null> {
    return this.sessions.findOne({ projectId }, { projection: { _id: 0 } })
  }

  async upsertSession(session: SessionRecord): Promise<SessionRecord> {
    await this.sessions.updateOne(
      { projectId: session.projectId },
      { $set: session },
      { upsert: true }
    )
    return session
  }

  async listMedia(filters: {
    projectId?: string
    type?: 'video' | 'image' | 'audio'
    search?: string
    page: number
    limit: number
  }): Promise<{ items: MediaAssetRecord[]; total: number }> {
    const query: Filter<MediaAssetRecord> = {}

    if (filters.projectId) query.projectId = filters.projectId
    if (filters.type) query.type = filters.type
    if (filters.search) query.fileName = { $regex: escapeRegExp(filters.search), $options: 'i' }

    const skip = (filters.page - 1) * filters.limit
    const [items, total] = await Promise.all([
      this.mediaAssets
        .find(query, { projection: { _id: 0 } })
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(filters.limit)
        .toArray(),
      this.mediaAssets.countDocuments(query)
    ])

    return { items, total }
  }

  async upsertMediaBatch(items: MediaAssetRecord[]): Promise<void> {
    if (items.length === 0) return
    const operations = items.map((item) => ({
      updateOne: {
        filter: { id: item.id },
        update: { $set: item },
        upsert: true
      }
    }))
    await this.mediaAssets.bulkWrite(operations)
  }

  async findScene(projectId: string, sceneId: string): Promise<SceneRecord | null> {
    return this.scenes.findOne({ projectId, sceneId }, { projection: { _id: 0 } })
  }

  async upsertScene(scene: SceneRecord): Promise<SceneRecord> {
    await this.scenes.updateOne(
      { projectId: scene.projectId, sceneId: scene.sceneId },
      { $set: scene },
      { upsert: true }
    )
    return scene
  }
}

export function createMongoVideoEditorRepository(db: Db): VideoEditorRepository {
  return new MongoVideoEditorRepository(db)
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
