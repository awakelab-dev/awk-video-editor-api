import { Router, Response } from 'express'
import { getMongoDb, isMongoConnected } from '../config/mongodb'
import { env } from '../config/env'
import { buildInitialEditorState, generateProjectId, normalizeCreateProjectPayload, ProjectDocument, toApiProject, validateCreateProjectPayload } from '../domain/projects'
import { authenticateRequest, AuthenticatedRequest, requireRole } from '../middleware/authenticate'

const router = Router()
const DEFAULT_PAGE_LIMIT = 20
const MAX_PAGE_LIMIT = 100

function unavailable(res: Response) {
  return res.status(503).json({ success: false, message: 'MongoDB is not connected' })
}

async function createUniqueProjectId(projectsCollection: any): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const projectId = generateProjectId()
    const existing = await projectsCollection.findOne({ id: projectId }, { projection: { _id: 1 } })
    if (!existing) return projectId
  }
  throw new Error('Could not generate a unique projectId')
}

async function getOwnedProject(projectsCollection: any, projectId: string, req: AuthenticatedRequest) {
  const project = await projectsCollection.findOne({ id: projectId }, { projection: { _id: 0 } }) as ProjectDocument | null
  if (!project) return { notFound: true as const, project: null }
  if (req.user?.role !== 'admin' && project.ownerUserId !== req.user?.id) return { forbidden: true as const, project: null }
  return { project }
}

function canonicalEditorStateProject(project: ProjectDocument) {
  return {
    projectName: project.name,
    duration: project.duration,
    resolution: project.resolution,
  }
}

router.post('/', authenticateRequest, requireRole(['admin', 'editor']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isMongoConnected()) return unavailable(res)
    const validationErrors = validateCreateProjectPayload(req.body)
    if (validationErrors.length > 0) return res.status(422).json({ success: false, message: 'Validation failed', errors: validationErrors })
    const db = getMongoDb(); if (!db) return unavailable(res)

    const projectsCollection: any = db.collection('projects')
    const editorStatesCollection: any = db.collection('editor_states')
    const normalized = normalizeCreateProjectPayload(req.body)
    const now = new Date().toISOString()

    if (req.user!.role !== 'admin') {
      const existingCount = await projectsCollection.countDocuments({ ownerUserId: req.user!.id })
      if (existingCount >= env.MAX_PROJECTS_PER_USER) {
        return res.status(403).json({ success: false, message: 'Project limit reached' })
      }
    }

    const projectId = await createUniqueProjectId(projectsCollection)

    const project: ProjectDocument = { id: projectId, ...normalized, ownerUserId: req.user!.id, createdAt: now, updatedAt: now }
    const initialEditorState = buildInitialEditorState(project)
    const editorStateDocument = { ...initialEditorState, revision: 0, sessionId: `session_${projectId}`, updatedBy: req.user!.id, createdAt: now }

    await projectsCollection.insertOne(project)
    try {
      await editorStatesCollection.insertOne(editorStateDocument)
    } catch (error) {
      await projectsCollection.deleteOne({ id: projectId })
      throw error
    }

    console.info('project_create', { actorUserId: req.user?.id, projectId })
    return res.status(201).json({ success: true, message: 'Project created successfully', data: { project: toApiProject(project), initialEditorState } })
  } catch (error: any) {
    console.error('Error creating project:', { message: error?.message })
    return res.status(500).json({ success: false, message: 'Server error' })
  }
})

router.get('/', authenticateRequest, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isMongoConnected()) return unavailable(res)
    const db = getMongoDb(); if (!db) return unavailable(res)
    const projectsCollection: any = db.collection('projects')
    const requestedLimit = Number(req.query.limit ?? DEFAULT_PAGE_LIMIT)
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(Math.floor(requestedLimit), MAX_PAGE_LIMIT) : DEFAULT_PAGE_LIMIT
    const filter = req.user!.role === 'admin' ? {} : { ownerUserId: req.user!.id }
    const projects = await projectsCollection.find(filter, { projection: { _id: 0, ownerUserId: 0 } }).sort({ updatedAt: -1, createdAt: -1, id: 1 }).limit(limit).toArray()
    return res.status(200).json({ success: true, message: 'Projects fetched successfully', data: projects.map(toApiProject) })
  } catch (error: any) {
    console.error('Error fetching projects:', { message: error?.message })
    return res.status(500).json({ success: false, message: 'Server error' })
  }
})

router.get('/:projectId', authenticateRequest, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isMongoConnected()) return unavailable(res)
    const db = getMongoDb(); if (!db) return unavailable(res)
    const projectsCollection: any = db.collection('projects')
    const result = await getOwnedProject(projectsCollection, String(req.params.projectId), req)
    if ('notFound' in result) return res.status(404).json({ success: false, message: 'Project not found' })
    if ('forbidden' in result) return res.status(403).json({ success: false, message: 'Forbidden' })
    return res.status(200).json({ success: true, message: 'Project fetched successfully', data: toApiProject(result.project!) })
  } catch (error: any) {
    console.error('Error fetching project:', { message: error?.message })
    return res.status(500).json({ success: false, message: 'Server error' })
  }
})

router.get('/:projectId/editor-state', authenticateRequest, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isMongoConnected()) return unavailable(res)
    const db = getMongoDb(); if (!db) return unavailable(res)
    const projectsCollection: any = db.collection('projects')
    const editorStatesCollection: any = db.collection('editor_states')
    const result = await getOwnedProject(projectsCollection, String(req.params.projectId), req)
    if ('notFound' in result) return res.status(404).json({ success: false, message: 'Project not found' })
    if ('forbidden' in result) return res.status(403).json({ success: false, message: 'Forbidden' })
    const project = result.project!
    const savedEditorState = await editorStatesCollection.findOne({ projectId: req.params.projectId }, { projection: { _id: 0, createdAt: 0, updatedBy: 0 } })
    const editorState = {
      ...(savedEditorState ?? { ...buildInitialEditorState(project), revision: 0, sessionId: `session_${project.id}` }),
      project: canonicalEditorStateProject(project),
    }
    return res.status(200).json({ success: true, message: 'Editor state fetched successfully', data: editorState })
  } catch (error: any) {
    console.error('Error fetching project editor state:', { message: error?.message })
    return res.status(500).json({ success: false, message: 'Server error' })
  }
})

export default router
