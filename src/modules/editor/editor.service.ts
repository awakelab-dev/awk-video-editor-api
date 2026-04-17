import { env } from '../../config/env'
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors'
import type {
  CreateTextElementInput,
  EditorStatePatchInput,
  SnapshotInput,
  UpsertSceneInput
} from './editor.schemas'
import type {
  EditorStateRecord,
  ProjectRecord,
  SceneRecord,
  SessionRecord,
  VideoEditorRepository
} from './editor.repository'

type Actor = {
  actorId: string
}

export class VideoEditorService {
  constructor(private readonly repository: VideoEditorRepository) {}

  async listProjects(): Promise<ProjectRecord[]> {
    await this.ensureDefaults(env.DEFAULT_PROJECT_ID, 'Demo Project', 150, { w: 1920, h: 1080 })
    return this.repository.findProjects()
  }

  async createProject(input: {
    id?: string
    name: string
    duration: number
    resolution: { w: number; h: number }
  }): Promise<ProjectRecord> {
    const now = new Date().toISOString()
    const projectId = input.id ?? `proj_${Date.now()}`
    const project: ProjectRecord = {
      id: projectId,
      name: input.name,
      duration: input.duration,
      resolution: input.resolution,
      createdAt: now,
      updatedAt: now
    }

    await this.repository.upsertProject(project)
    await this.ensureDefaults(projectId, input.name, input.duration, input.resolution)
    return project
  }

  async getProject(projectId: string): Promise<ProjectRecord> {
    const project = await this.repository.findProjectById(projectId)
    if (!project) {
      throw new NotFoundError('Project not found')
    }
    return project
  }

  async patchProject(
    projectId: string,
    patch: Partial<Pick<ProjectRecord, 'name' | 'duration' | 'resolution'>>
  ): Promise<ProjectRecord> {
    await this.getProject(projectId)
    const updated = await this.repository.patchProject(projectId, {
      ...patch,
      updatedAt: new Date().toISOString()
    })
    if (!updated) {
      throw new NotFoundError('Project not found')
    }
    return updated
  }

  async getEditorState(projectId: string): Promise<{
    project: ProjectRecord
    editorState: EditorStateRecord
  }> {
    const ensured = await this.ensureDefaults(projectId, 'Untitled Project', 0, { w: 1920, h: 1080 })
    return {
      project: ensured.project,
      editorState: ensured.editorState
    }
  }

  async patchEditorState(
    projectId: string,
    payload: EditorStatePatchInput,
    actor: Actor
  ): Promise<{
    project: ProjectRecord
    editorState: EditorStateRecord
  }> {
    const current = await this.getEditorState(projectId)

    if (payload.revision !== current.editorState.revision) {
      throw new ConflictError('Editor state revision conflict')
    }

    const nextRevision = current.editorState.revision + 1
    const updatedProject = await this.repository.upsertProject({
      ...current.project,
      name: payload.project?.projectName ?? current.project.name,
      duration: payload.project?.duration ?? current.project.duration,
      resolution: payload.project?.resolution ?? current.project.resolution,
      updatedAt: new Date().toISOString()
    })

    const updatedEditorState: EditorStateRecord = {
      projectId,
      revision: nextRevision,
      sessionId: payload.sessionId ?? current.editorState.sessionId ?? null,
      playback: payload.playback,
      selection: payload.selection,
      assets: payload.assets as Array<Record<string, unknown>>,
      tracks: payload.tracks as Array<Record<string, unknown>>,
      updatedAt: new Date().toISOString(),
      updatedBy: actor.actorId
    }

    await this.repository.upsertEditorState(updatedEditorState)

    const mediaRecords = payload.assets.map((asset) => ({
      id: asset.id,
      projectId,
      fileName: asset.fileName,
      type: asset.type,
      source: asset.source,
      mimeType: asset.mimeType,
      duration: asset.duration ?? null,
      width: asset.width,
      height: asset.height,
      updatedAt: new Date().toISOString()
    }))
    await this.repository.upsertMediaBatch(mediaRecords)

    const existingSession = await this.repository.findSession(projectId)
    if (existingSession) {
      await this.repository.upsertSession({
        ...existingSession,
        revision: nextRevision,
        lastActivityAt: new Date().toISOString()
      })
    }

    return {
      project: updatedProject,
      editorState: updatedEditorState
    }
  }

  async putSnapshot(projectId: string, snapshot: SnapshotInput) {
    await this.getEditorState(projectId)
    return this.repository.upsertSnapshot({
      projectId,
      ...snapshot,
      updatedAt: new Date().toISOString()
    })
  }

  async getSnapshot(projectId: string) {
    await this.getProject(projectId)
    const snapshot = await this.repository.findSnapshot(projectId)
    if (!snapshot) {
      throw new NotFoundError('Snapshot not found')
    }
    return snapshot
  }

  async getSession(projectId: string): Promise<SessionRecord> {
    const ensured = await this.ensureDefaults(projectId, 'Untitled Project', 0, { w: 1920, h: 1080 })
    const session = await this.repository.findSession(projectId)
    if (!session) {
      return ensured.session
    }
    return session
  }

  async joinSession(
    projectId: string,
    participant: { participantId: string; displayName: string }
  ): Promise<SessionRecord> {
    const session = await this.getSession(projectId)
    const existing = session.participants.find(
      (item) => item.participantId === participant.participantId
    )

    const nextParticipants = existing
      ? session.participants
      : [
          ...session.participants,
          {
            ...participant,
            joinedAt: new Date().toISOString()
          }
        ]

    const updated: SessionRecord = {
      ...session,
      participants: nextParticipants,
      lastActivityAt: new Date().toISOString()
    }

    return this.repository.upsertSession(updated)
  }

  async createTextElement(projectId: string, input: CreateTextElementInput, actor: Actor) {
    const current = await this.getEditorState(projectId)
    const trackIndex = current.editorState.tracks.findIndex(
      (track) => (track as { id: string }).id === input.trackId
    )

    const projectResolution = current.project.resolution
    const elementId = `text_${Date.now()}`
    const textElement = {
      id: elementId,
      type: 'text',
      name: input.text.slice(0, 32) || 'New title',
      startTime: input.timing.startMs / 1000,
      duration: input.timing.durationMs / 1000,
      opacity: 100,
      x: projectResolution.w * input.position.x,
      y: projectResolution.h * input.position.y,
      width: Math.round(projectResolution.w * 0.5),
      height: 160,
      rotation: 0,
      text: input.text,
      fontFamily: 'Inter',
      fontSize: input.style.fontSize,
      fontWeight: input.style.fontWeight,
      textColor: input.style.color,
      backgroundColor: 'transparent',
      lineHeight: 1.1,
      letterSpacing: 0,
      textAlign: 'center'
    }

    const tracks = [...current.editorState.tracks]
    if (trackIndex >= 0) {
      const track = tracks[trackIndex] as { id: string; name: string; elements: unknown[] }
      tracks[trackIndex] = {
        ...track,
        elements: [...track.elements, textElement]
      }
    } else {
      tracks.push({
        id: input.trackId,
        name: 'Text',
        elements: [textElement]
      })
    }

    const result = await this.patchEditorState(
      projectId,
      {
        revision: current.editorState.revision,
        sessionId: current.editorState.sessionId ?? undefined,
        project: {
          projectName: current.project.name,
          duration: Math.max(current.project.duration, textElement.startTime + textElement.duration),
          resolution: current.project.resolution
        },
        playback: current.editorState.playback,
        selection: {
          selectedElementId: elementId,
          selectionSource: 'element-library'
        },
        assets: current.editorState.assets as never[],
        tracks: tracks as never[]
      },
      actor
    )

    return {
      element: textElement,
      revision: result.editorState.revision
    }
  }

  async upsertScene(input: UpsertSceneInput, actor: Actor): Promise<SceneRecord> {
    await this.getProject(input.projectId)

    const payloadString = JSON.stringify(input.payload)
    const payloadSizeBytes = Buffer.byteLength(payloadString, 'utf8')
    if (payloadSizeBytes > 1024 * 1024 * 2) {
      throw new BadRequestError('Scene payload exceeds allowed size', [
        { field: 'payload', message: 'Maximum payload size is 2MB' }
      ])
    }

    const existing = await this.repository.findScene(input.projectId, input.sceneId)
    const now = new Date().toISOString()

    const nextScene: SceneRecord = {
      projectId: input.projectId,
      sceneId: input.sceneId,
      version: existing ? existing.version + 1 : 1,
      metadata: {
        ...input.metadata,
        updatedBy: actor.actorId
      },
      payload: input.payload as unknown as Record<string, unknown>,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }

    return this.repository.upsertScene(nextScene)
  }

  async getScene(projectId: string, sceneId: string): Promise<SceneRecord> {
    await this.getProject(projectId)
    const scene = await this.repository.findScene(projectId, sceneId)
    if (!scene) {
      throw new NotFoundError('Scene not found')
    }
    return scene
  }

  async listMedia(filters: {
    projectId?: string
    type?: 'video' | 'image' | 'audio'
    search?: string
    page: number
    limit: number
  }) {
    return this.repository.listMedia(filters)
  }

  async getRender(renderId: string) {
    return {
      renderId,
      status: 'queued',
      progress: 0,
      message: 'Render pipeline stub ready for future worker integration'
    }
  }

  async cancelRender(renderId: string) {
    return {
      renderId,
      status: 'cancelled'
    }
  }

  private async ensureDefaults(
    projectId: string,
    defaultName: string,
    defaultDuration: number,
    defaultResolution: { w: number; h: number }
  ): Promise<{ project: ProjectRecord; editorState: EditorStateRecord; session: SessionRecord }> {
    const now = new Date().toISOString()

    let project = await this.repository.findProjectById(projectId)
    if (!project) {
      project = await this.repository.upsertProject({
        id: projectId,
        name: projectId === env.DEFAULT_PROJECT_ID ? 'Demo Project' : defaultName,
        duration: defaultDuration,
        resolution: defaultResolution,
        createdAt: now,
        updatedAt: now
      })
    }

    let editorState = await this.repository.findEditorState(projectId)
    if (!editorState) {
      editorState = await this.repository.upsertEditorState({
        projectId,
        revision: 0,
        sessionId: `session_${projectId}`,
        playback: { currentTime: 0, isPlaying: false, zoomLevel: 100 },
        selection: { selectedElementId: null, selectionSource: null },
        assets: [],
        tracks: [],
        updatedAt: now,
        updatedBy: 'system'
      })
    }

    let session = await this.repository.findSession(projectId)
    if (!session) {
      session = await this.repository.upsertSession({
        sessionId: `session_${projectId}`,
        projectId,
        participants: [],
        revision: editorState.revision,
        lastActivityAt: now
      })
    }

    return { project, editorState, session }
  }
}
