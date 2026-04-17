import { Request, Response } from 'express'
import { sendSuccess } from '../../lib/response'
import { VideoEditorService } from './editor.service'

type ValidatedRequest = Request & {
  validated?: {
    params?: Record<string, unknown>
    query?: Record<string, unknown>
    body?: unknown
  }
}

function getParam(req: Request, key: string): string {
  const request = req as ValidatedRequest
  const fromValidated = request.validated?.params?.[key]

  if (typeof fromValidated === 'string') return fromValidated

  const raw = req.params[key]
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0]

  throw new Error(`Expected route param "${key}" to be a string`)
}

function getQuery(req: Request): Record<string, unknown> {
  const request = req as ValidatedRequest
  return request.validated?.query ?? (req.query as Record<string, unknown>)
}

export class EditorController {
  constructor(private readonly service: VideoEditorService) {}

  listProjects = async (_req: Request, res: Response): Promise<void> => {
    const projects = await this.service.listProjects()
    sendSuccess(res, 200, 'Projects fetched successfully', projects)
  }

  createProject = async (req: Request, res: Response): Promise<void> => {
    const project = await this.service.createProject(req.body as never)
    sendSuccess(res, 201, 'Project created successfully', project)
  }

  getProject = async (req: Request, res: Response): Promise<void> => {
    const projectId = getParam(req, 'projectId')
    const project = await this.service.getProject(projectId)
    sendSuccess(res, 200, 'Project fetched successfully', project)
  }

  patchProject = async (req: Request, res: Response): Promise<void> => {
    const projectId = getParam(req, 'projectId')
    const project = await this.service.patchProject(projectId, req.body as never)
    sendSuccess(res, 200, 'Project updated successfully', project)
  }

  getEditorState = async (req: Request, res: Response): Promise<void> => {
    const projectId = getParam(req, 'projectId')
    const result = await this.service.getEditorState(projectId)
    sendSuccess(res, 200, 'Editor state fetched successfully', {
      projectId: result.project.id,
      project: {
        projectName: result.project.name,
        duration: result.project.duration,
        resolution: result.project.resolution
      },
      revision: result.editorState.revision,
      sessionId: result.editorState.sessionId,
      playback: result.editorState.playback,
      selection: result.editorState.selection,
      assets: result.editorState.assets,
      tracks: result.editorState.tracks,
      updatedAt: result.editorState.updatedAt
    })
  }

  patchEditorState = async (req: Request, res: Response): Promise<void> => {
    const projectId = getParam(req, 'projectId')
    const result = await this.service.patchEditorState(projectId, req.body as never, {
      actorId: req.actorId || 'anonymous-user'
    })

    sendSuccess(res, 200, 'Editor state updated successfully', {
      projectId: result.project.id,
      revision: result.editorState.revision,
      sessionId: result.editorState.sessionId,
      playback: result.editorState.playback,
      selection: result.editorState.selection,
      assets: result.editorState.assets,
      tracks: result.editorState.tracks,
      project: {
        projectName: result.project.name,
        duration: result.project.duration,
        resolution: result.project.resolution
      },
      updatedAt: result.editorState.updatedAt
    })
  }

  putSnapshot = async (req: Request, res: Response): Promise<void> => {
    const projectId = getParam(req, 'projectId')
    const snapshot = await this.service.putSnapshot(projectId, req.body as never)
    sendSuccess(res, 200, 'Snapshot saved successfully', snapshot)
  }

  getSnapshot = async (req: Request, res: Response): Promise<void> => {
    const projectId = getParam(req, 'projectId')
    const snapshot = await this.service.getSnapshot(projectId)
    sendSuccess(res, 200, 'Snapshot fetched successfully', snapshot)
  }

  getSession = async (req: Request, res: Response): Promise<void> => {
    const projectId = getParam(req, 'projectId')
    const session = await this.service.getSession(projectId)
    sendSuccess(res, 200, 'Session fetched successfully', session)
  }

  joinSession = async (req: Request, res: Response): Promise<void> => {
    const projectId = getParam(req, 'projectId')
    const session = await this.service.joinSession(projectId, req.body as never)
    sendSuccess(res, 200, 'Session joined successfully', session)
  }

  createTextElement = async (req: Request, res: Response): Promise<void> => {
    const projectId = getParam(req, 'projectId')
    const result = await this.service.createTextElement(projectId, req.body as never, {
      actorId: req.actorId || 'anonymous-user'
    })
    sendSuccess(res, 201, 'Text element created successfully', result)
  }

  upsertScene = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.upsertScene(req.body as never, {
      actorId: req.actorId || 'anonymous-user'
    })
    sendSuccess(res, 200, 'Scene saved successfully', {
      sceneId: result.sceneId,
      projectId: result.projectId,
      version: result.version,
      updatedAt: result.updatedAt
    })
  }

  getScene = async (req: Request, res: Response): Promise<void> => {
    const projectId = getParam(req, 'projectId')
    const sceneId = getParam(req, 'sceneId')
    const result = await this.service.getScene(projectId, sceneId)
    sendSuccess(res, 200, 'Scene fetched successfully', result)
  }

  listMedia = async (req: Request, res: Response): Promise<void> => {
    const query = getQuery(req)
    const typeValue = query.type
    const projectIdValue = query.projectId
    const searchValue = query.search
    const pageValue = query.page
    const limitValue = query.limit

    const result = await this.service.listMedia({
      projectId: typeof projectIdValue === 'string' ? projectIdValue : undefined,
      type:
        typeValue === 'video' || typeValue === 'image' || typeValue === 'audio'
          ? typeValue
          : undefined,
      page: Number(pageValue),
      limit: Number(limitValue),
      search: typeof searchValue === 'string' ? searchValue : undefined
    })

    sendSuccess(res, 200, 'Media assets fetched successfully', result.items, {
      page: Number(pageValue),
      limit: Number(limitValue),
      total: result.total
    })
  }

  getRender = async (req: Request, res: Response): Promise<void> => {
    const renderId = getParam(req, 'renderId')
    const render = await this.service.getRender(renderId)
    sendSuccess(res, 200, 'Render fetched successfully', render)
  }

  cancelRender = async (req: Request, res: Response): Promise<void> => {
    const renderId = getParam(req, 'renderId')
    const render = await this.service.cancelRender(renderId)
    sendSuccess(res, 200, 'Render cancelled successfully', render)
  }
}
