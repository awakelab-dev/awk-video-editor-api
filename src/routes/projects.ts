import { Router, Request, Response } from 'express'
import { getMongoDb, isMongoConnected } from '../config/mongodb'
import { patchProjectHandler } from '../controllers/projectController'
import {
  buildInitialEditorState,
  generateProjectId,
  normalizeCreateProjectPayload,
  ProjectDocument,
  toApiProject,
  validateCreateProjectPayload
} from '../domain/projects'

const router = Router()

function unavailable(res: Response) {
  return res.status(503).json({ success: false, message: 'MongoDB is not connected' })
}

async function createUniqueProjectId(projectsCollection: any): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const projectId = generateProjectId()
    const existing = await projectsCollection.findOne({ id: projectId }, { projection: { _id: 1 } })

    if (!existing) {
      return projectId
    }
  }

  throw new Error('Could not generate a unique projectId')
}

router.post('/', async (req: Request, res: Response) => {
  try {
    if (!isMongoConnected()) {
      return unavailable(res)
    }

    const validationErrors = validateCreateProjectPayload(req.body)
    if (validationErrors.length > 0) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      })
    }

    const db = getMongoDb()
    if (!db) {
      return unavailable(res)
    }

    const projectsCollection: any = db.collection('projects')
    const editorStatesCollection: any = db.collection('editor_states')
    const normalized = normalizeCreateProjectPayload(req.body)
    const now = new Date().toISOString()
    const projectId = await createUniqueProjectId(projectsCollection)

    const project: ProjectDocument = {
      id: projectId,
      ...normalized,
      createdAt: now,
      updatedAt: now
    }

    const initialEditorState = buildInitialEditorState(project)
    const editorStateDocument = {
      ...initialEditorState,
      revision: 0,
      sessionId: `session_${projectId}`,
      updatedBy: 'system'
    }

    await projectsCollection.insertOne(project)
    await editorStatesCollection.updateOne(
      { projectId },
      { $set: editorStateDocument, $setOnInsert: { createdAt: now } },
      { upsert: true }
    )

    return res.status(201).json({
      success: true,
      message: 'Project created successfully',
      data: {
        project: toApiProject(project),
        initialEditorState
      }
    })
  } catch (error) {
    console.error('Error creating project:', error)
    return res.status(500).json({ success: false, message: 'Server error' })
  }
})

router.get('/', async (_req: Request, res: Response) => {
  try {
    if (!isMongoConnected()) {
      return unavailable(res)
    }

    const db = getMongoDb()
    if (!db) {
      return unavailable(res)
    }

    const projectsCollection: any = db.collection('projects')
    const projects = await projectsCollection
      .find({}, { projection: { _id: 0 } })
      .sort({ updatedAt: -1, createdAt: -1 })
      .toArray()

    return res.status(200).json({
      success: true,
      message: 'Projects fetched successfully',
      data: projects.map(toApiProject)
    })
  } catch (error) {
    console.error('Error fetching projects:', error)
    return res.status(500).json({ success: false, message: 'Server error' })
  }
})

router.get('/:projectId', async (req: Request, res: Response) => {
  try {
    if (!isMongoConnected()) {
      return unavailable(res)
    }

    const db = getMongoDb()
    if (!db) {
      return unavailable(res)
    }

    const projectsCollection: any = db.collection('projects')
    const project = await projectsCollection.findOne(
      { id: req.params.projectId },
      { projection: { _id: 0 } }
    )

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' })
    }

    return res.status(200).json({
      success: true,
      message: 'Project fetched successfully',
      data: toApiProject(project)
    })
  } catch (error) {
    console.error('Error fetching project:', error)
    return res.status(500).json({ success: false, message: 'Server error' })
  }
})

router.patch('/:projectId', patchProjectHandler)

router.get('/:projectId/editor-state', async (req: Request, res: Response) => {
  try {
    if (!isMongoConnected()) {
      return unavailable(res)
    }

    const db = getMongoDb()
    if (!db) {
      return unavailable(res)
    }

    const projectsCollection: any = db.collection('projects')
    const editorStatesCollection: any = db.collection('editor_states')
    const project = await projectsCollection.findOne(
      { id: req.params.projectId },
      { projection: { _id: 0 } }
    )

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' })
    }

    const savedEditorState = await editorStatesCollection.findOne(
      { projectId: req.params.projectId },
      { projection: { _id: 0, createdAt: 0, revision: 0, sessionId: 0, updatedBy: 0 } }
    )

    const editorState = savedEditorState ?? buildInitialEditorState(project)

    return res.status(200).json({
      success: true,
      message: 'Editor state fetched successfully',
      data: editorState
    })
  } catch (error) {
    console.error('Error fetching project editor state:', error)
    return res.status(500).json({ success: false, message: 'Server error' })
  }
})

export default router
