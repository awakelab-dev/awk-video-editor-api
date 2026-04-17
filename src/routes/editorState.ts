import { Router, Request, Response } from 'express'
import { getMongoDb, isMongoConnected } from '../config/mongodb'

const router = Router({ mergeParams: true })

type ValidationError = {
  field: string
  message: string
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function validateEditorStatePayload(body: unknown): ValidationError[] {
  const errors: ValidationError[] = []

  if (!isObject(body)) {
    errors.push({ field: 'body', message: 'Body must be a JSON object' })
    return errors
  }

  if (typeof body.revision !== 'number' || body.revision < 0) {
    errors.push({ field: 'revision', message: 'revision must be a number >= 0' })
  }

  if (body.sessionId !== undefined && body.sessionId !== null && !isValidId(body.sessionId)) {
    errors.push({ field: 'sessionId', message: 'sessionId must be a non-empty string when provided' })
  }

  if (!isObject(body.project)) {
    errors.push({ field: 'project', message: 'project is required' })
  } else {
    if (typeof body.project.projectName !== 'string' || !body.project.projectName.trim()) {
      errors.push({ field: 'project.projectName', message: 'projectName is required' })
    }
    if (typeof body.project.duration !== 'number' || body.project.duration < 0) {
      errors.push({ field: 'project.duration', message: 'duration must be a number >= 0' })
    }
    if (!isObject(body.project.resolution)) {
      errors.push({ field: 'project.resolution', message: 'resolution is required' })
    } else {
      if (typeof body.project.resolution.w !== 'number' || body.project.resolution.w <= 0) {
        errors.push({ field: 'project.resolution.w', message: 'w must be > 0' })
      }
      if (typeof body.project.resolution.h !== 'number' || body.project.resolution.h <= 0) {
        errors.push({ field: 'project.resolution.h', message: 'h must be > 0' })
      }
    }
  }

  if (!isObject(body.playback)) {
    errors.push({ field: 'playback', message: 'playback is required' })
  } else {
    if (typeof body.playback.currentTime !== 'number' || body.playback.currentTime < 0) {
      errors.push({ field: 'playback.currentTime', message: 'currentTime must be a number >= 0' })
    }
    if (typeof body.playback.isPlaying !== 'boolean') {
      errors.push({ field: 'playback.isPlaying', message: 'isPlaying must be boolean' })
    }
    if (typeof body.playback.zoomLevel !== 'number' || body.playback.zoomLevel < 1) {
      errors.push({ field: 'playback.zoomLevel', message: 'zoomLevel must be a number >= 1' })
    }
  }

  if (!isObject(body.selection)) {
    errors.push({ field: 'selection', message: 'selection is required' })
  } else {
    const source = body.selection.selectionSource
    const validSource =
      source === 'canvas' ||
      source === 'timeline' ||
      source === 'element-library' ||
      source === null

    if (
      body.selection.selectedElementId !== null &&
      body.selection.selectedElementId !== undefined &&
      !isValidId(body.selection.selectedElementId)
    ) {
      errors.push({ field: 'selection.selectedElementId', message: 'selectedElementId must be string or null' })
    }

    if (!validSource) {
      errors.push({
        field: 'selection.selectionSource',
        message: 'selectionSource must be canvas, timeline, element-library or null'
      })
    }
  }

  if (!Array.isArray(body.assets)) {
    errors.push({ field: 'assets', message: 'assets must be an array' })
  }

  if (!Array.isArray(body.tracks)) {
    errors.push({ field: 'tracks', message: 'tracks must be an array' })
  }

  return errors
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ success: false, message: 'projectId is required' })
    }

    if (!isMongoConnected()) {
      return res.status(503).json({ success: false, message: 'MongoDB is not connected' })
    }

    const db = getMongoDb()
    if (!db) {
      return res.status(503).json({ success: false, message: 'MongoDB database is unavailable' })
    }

    const projectsCollection: any = db.collection('projects')
    const editorStatesCollection: any = db.collection('editor_states')

    let project: any = await projectsCollection.findOne({ id: projectId }, { projection: { _id: 0 } })
    let editorState: any = await editorStatesCollection.findOne({ projectId }, { projection: { _id: 0 } })

    const now = new Date().toISOString()

    if (!project) {
      project = {
        id: projectId,
        name: projectId === 'demo-project' ? 'Demo Project' : 'Untitled Project',
        duration: 0,
        resolution: { w: 1920, h: 1080 },
        createdAt: now,
        updatedAt: now
      }
      await projectsCollection.updateOne({ id: projectId }, { $set: project }, { upsert: true })
    }

    if (!editorState) {
      editorState = {
        projectId,
        revision: 0,
        sessionId: `session_${projectId}`,
        playback: { currentTime: 0, isPlaying: false, zoomLevel: 100 },
        selection: { selectedElementId: null, selectionSource: null },
        assets: [],
        tracks: [],
        updatedAt: now,
        updatedBy: 'system'
      }
      await editorStatesCollection.updateOne({ projectId }, { $set: editorState }, { upsert: true })
    }

    return res.status(200).json({
      success: true,
      message: 'Editor state fetched successfully',
      data: {
        projectId: project.id,
        project: {
          projectName: project.name,
          duration: project.duration,
          resolution: project.resolution
        },
        revision: editorState.revision,
        sessionId: editorState.sessionId,
        playback: editorState.playback,
        selection: editorState.selection,
        assets: editorState.assets,
        tracks: editorState.tracks,
        updatedAt: editorState.updatedAt
      }
    })
  } catch (error) {
    console.error('Error fetching editor state:', error)
    return res.status(500).json({ success: false, message: 'Server error' })
  }
})

router.patch('/', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ success: false, message: 'projectId is required' })
    }

    if (!isMongoConnected()) {
      return res.status(503).json({ success: false, message: 'MongoDB is not connected' })
    }

    const validationErrors = validateEditorStatePayload(req.body)
    if (validationErrors.length > 0) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      })
    }

    const db = getMongoDb()
    if (!db) {
      return res.status(503).json({ success: false, message: 'MongoDB database is unavailable' })
    }

    const projectsCollection: any = db.collection('projects')
    const editorStatesCollection: any = db.collection('editor_states')

    const currentState: any = await editorStatesCollection.findOne({ projectId })

    if (currentState && req.body.revision !== currentState.revision) {
      return res.status(409).json({
        success: false,
        message: 'Editor state revision conflict'
      })
    }

    const now = new Date().toISOString()

    await projectsCollection.updateOne(
      { id: projectId },
      {
        $set: {
          id: projectId,
          name: req.body.project.projectName,
          duration: req.body.project.duration,
          resolution: req.body.project.resolution,
          updatedAt: now
        },
        $setOnInsert: { createdAt: now }
      },
      { upsert: true }
    )

    const nextRevision = currentState ? currentState.revision + 1 : 0

    const nextEditorState = {
      projectId,
      revision: nextRevision,
      sessionId: req.body.sessionId ?? `session_${projectId}`,
      playback: req.body.playback,
      selection: req.body.selection,
      assets: req.body.assets,
      tracks: req.body.tracks,
      updatedAt: now,
      updatedBy: 'anonymous-user'
    }

    await editorStatesCollection.updateOne(
      { projectId },
      { $set: nextEditorState },
      { upsert: true }
    )

    return res.status(200).json({
      success: true,
      message: 'Editor state updated successfully',
      data: {
        projectId,
        revision: nextRevision,
        sessionId: nextEditorState.sessionId,
        playback: nextEditorState.playback,
        selection: nextEditorState.selection,
        assets: nextEditorState.assets,
        tracks: nextEditorState.tracks,
        project: req.body.project,
        updatedAt: nextEditorState.updatedAt
      }
    })
  } catch (error) {
    console.error('Error updating editor state:', error)
    return res.status(500).json({ success: false, message: 'Server error' })
  }
})

export default router
