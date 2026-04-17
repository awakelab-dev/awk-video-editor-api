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

function validateSnapshotPayload(body: unknown): ValidationError[] {
  const errors: ValidationError[] = []

  if (!isObject(body)) {
    errors.push({ field: 'body', message: 'Body must be a JSON object' })
    return errors
  }

  if (body.snapshotVersion !== 1) {
    errors.push({ field: 'snapshotVersion', message: 'snapshotVersion must be 1' })
  }

  if (typeof body.savedAt !== 'string' || Number.isNaN(Date.parse(body.savedAt))) {
    errors.push({ field: 'savedAt', message: 'savedAt must be a valid ISO date string' })
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
      errors.push({
        field: 'selection.selectedElementId',
        message: 'selectedElementId must be string or null'
      })
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
  } else {
    body.assets.forEach((asset: unknown, index: number) => {
      if (!isObject(asset)) {
        errors.push({ field: `assets[${index}]`, message: 'asset must be an object' })
        return
      }
      if (!isValidId(asset.id)) {
        errors.push({ field: `assets[${index}].id`, message: 'id is required' })
      }
      if (
        asset.duration !== null &&
        asset.duration !== undefined &&
        (typeof asset.duration !== 'number' || asset.duration < 0)
      ) {
        errors.push({
          field: `assets[${index}].duration`,
          message: 'duration must be number >= 0 or null'
        })
      }
    })
  }

  if (!Array.isArray(body.tracks)) {
    errors.push({ field: 'tracks', message: 'tracks must be an array' })
  } else {
    body.tracks.forEach((track: unknown, trackIndex: number) => {
      if (!isObject(track)) {
        errors.push({ field: `tracks[${trackIndex}]`, message: 'track must be an object' })
        return
      }
      if (!isValidId(track.id)) {
        errors.push({ field: `tracks[${trackIndex}].id`, message: 'id is required' })
      }
      if (typeof track.duration !== 'number' || track.duration < 0) {
        errors.push({ field: `tracks[${trackIndex}].duration`, message: 'duration must be number >= 0' })
      }
      if (!Array.isArray(track.elements)) {
        errors.push({ field: `tracks[${trackIndex}].elements`, message: 'elements must be an array' })
        return
      }

      track.elements.forEach((element: unknown, elementIndex: number) => {
        if (!isObject(element)) {
          errors.push({
            field: `tracks[${trackIndex}].elements[${elementIndex}]`,
            message: 'element must be an object'
          })
          return
        }
        if (!isValidId(element.id)) {
          errors.push({
            field: `tracks[${trackIndex}].elements[${elementIndex}].id`,
            message: 'id is required'
          })
        }
        if (typeof element.duration !== 'number' || element.duration < 0) {
          errors.push({
            field: `tracks[${trackIndex}].elements[${elementIndex}].duration`,
            message: 'duration must be number >= 0'
          })
        }
      })
    })
  }

  return errors
}

router.put('/', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ success: false, message: 'projectId is required' })
    }

    if (!isMongoConnected()) {
      return res.status(503).json({ success: false, message: 'MongoDB is not connected' })
    }

    const validationErrors = validateSnapshotPayload(req.body)
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

    const snapshotsCollection: any = db.collection('project_snapshots')
    const now = new Date().toISOString()

    const snapshotDocument = {
      projectId,
      snapshotVersion: req.body.snapshotVersion,
      savedAt: req.body.savedAt,
      project: req.body.project,
      playback: req.body.playback,
      selection: req.body.selection,
      assets: req.body.assets,
      tracks: req.body.tracks,
      updatedAt: now
    }

    await snapshotsCollection.updateOne(
      { projectId },
      {
        $set: snapshotDocument,
        $setOnInsert: { createdAt: now }
      },
      { upsert: true }
    )

    const savedSnapshot = await snapshotsCollection.findOne(
      { projectId },
      { projection: { _id: 0 } }
    )

    return res.status(200).json({
      success: true,
      message: 'Snapshot saved successfully',
      data: savedSnapshot
    })
  } catch (error) {
    console.error('Error saving snapshot:', error)
    return res.status(500).json({ success: false, message: 'Server error' })
  }
})

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

    const snapshotsCollection: any = db.collection('project_snapshots')
    const snapshot = await snapshotsCollection.findOne(
      { projectId },
      { projection: { _id: 0 } }
    )

    if (!snapshot) {
      return res.status(404).json({
        success: false,
        message: 'Snapshot not found'
      })
    }

    return res.status(200).json({
      success: true,
      message: 'Snapshot fetched successfully',
      data: snapshot
    })
  } catch (error) {
    console.error('Error fetching snapshot:', error)
    return res.status(500).json({ success: false, message: 'Server error' })
  }
})

export default router
