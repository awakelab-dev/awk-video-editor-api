import { Router, Response } from 'express'
import { getMongoDb, isMongoConnected } from '../config/mongodb'
import { authenticateRequest, AuthenticatedRequest, requireRole } from '../middleware/authenticate'
import { isSafeDisplayText, validatePersistedStringFields } from '../domain/safeText'
import { isSafeDurationSeconds } from '../domain/projects'

const router = Router({ mergeParams: true })
const MAX_ASSETS = 200
const MAX_TRACKS = 50
const MAX_ELEMENTS_PER_TRACK = 200
const MAX_ID_LENGTH = 120
const MAX_PROJECT_NAME = 120
const MAX_DURATION = 60 * 60 * 24
const MAX_WIDTH = 7680
const MAX_HEIGHT = 4320
const MAX_ZOOM = 400
const SNAPSHOT_ALLOWED_FIELDS = new Set([
  'snapshotVersion',
  'savedAt',
  'project',
  'playback',
  'selection',
  'assets',
  'tracks',
])

type ValidationError = { field: string; message: string }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasDangerousKeys(value: unknown, path = 'body'): ValidationError[] {
  const errors: ValidationError[] = []
  if (Array.isArray(value)) {
    value.forEach((item, index) => errors.push(...hasDangerousKeys(item, `${path}[${index}]`)))
    return errors
  }
  if (!isObject(value)) return errors
  for (const [key, child] of Object.entries(value)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype' || key.startsWith('$') || key.includes('.')) {
      errors.push({ field: `${path}.${key}`, message: 'Dangerous key is not allowed' })
    }
    errors.push(...hasDangerousKeys(child, `${path}.${key}`))
  }
  return errors
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isSafePositiveInteger(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && Number.isSafeInteger(value) && value > 0 && value <= max
}

function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= MAX_ID_LENGTH
}

function validateSnapshotPayload(body: unknown): ValidationError[] {
  const errors: ValidationError[] = []
  if (!isObject(body)) return [{ field: 'body', message: 'Body must be a JSON object' }]
  for (const key of Object.keys(body)) {
    if (!SNAPSHOT_ALLOWED_FIELDS.has(key)) errors.push({ field: key, message: 'Unknown field is not allowed' })
  }
  errors.push(...hasDangerousKeys(body))
  if (body.snapshotVersion !== 1) errors.push({ field: 'snapshotVersion', message: 'snapshotVersion must be 1' })
  if (typeof body.savedAt !== 'string' || Number.isNaN(Date.parse(body.savedAt))) errors.push({ field: 'savedAt', message: 'savedAt must be a valid ISO date string' })

  if (!isObject(body.project)) errors.push({ field: 'project', message: 'project is required' })
  else {
    const projectName = typeof body.project.projectName === 'string' ? body.project.projectName.trim() : ''
    if (!projectName || projectName.length > MAX_PROJECT_NAME || !isSafeDisplayText(projectName)) errors.push({ field: 'project.projectName', message: 'projectName contains unsafe characters or markup-like content' })
    if (!isSafeDurationSeconds(body.project.duration, MAX_DURATION)) errors.push({ field: 'project.duration', message: `duration must be a finite number of seconds between 0 and ${MAX_DURATION} with up to 3 decimal places` })
    if (!isObject(body.project.resolution)) errors.push({ field: 'project.resolution', message: 'resolution is required' })
    else {
      if (!isSafePositiveInteger(body.project.resolution.w, MAX_WIDTH)) errors.push({ field: 'project.resolution.w', message: `w must be a positive integer <= ${MAX_WIDTH}` })
      if (!isSafePositiveInteger(body.project.resolution.h, MAX_HEIGHT)) errors.push({ field: 'project.resolution.h', message: `h must be a positive integer <= ${MAX_HEIGHT}` })
    }
  }

  if (!isObject(body.playback)) {
    errors.push({ field: 'playback', message: 'playback is required' })
  } else {
    errors.push(...validatePersistedStringFields(body.playback, 'playback', 'playback'))
    if (!isFiniteNumber(body.playback.currentTime) || body.playback.currentTime < 0) errors.push({ field: 'playback.currentTime', message: 'currentTime must be a finite number >= 0' })
    if (typeof body.playback.isPlaying !== 'boolean') errors.push({ field: 'playback.isPlaying', message: 'isPlaying must be boolean' })
    if (!isFiniteNumber(body.playback.zoomLevel) || body.playback.zoomLevel < 1 || body.playback.zoomLevel > MAX_ZOOM) errors.push({ field: 'playback.zoomLevel', message: `zoomLevel must be between 1 and ${MAX_ZOOM}` })
  }
  if (!isObject(body.selection)) errors.push({ field: 'selection', message: 'selection is required' })
  else {
    const source = body.selection.selectionSource
    const validSource = source === 'canvas' || source === 'timeline' || source === 'element-library' || source === null
    if (body.selection.selectedElementId !== null && body.selection.selectedElementId !== undefined && !isValidId(body.selection.selectedElementId)) errors.push({ field: 'selection.selectedElementId', message: 'selectedElementId must be string or null' })
    if (!validSource) errors.push({ field: 'selection.selectionSource', message: 'selectionSource must be canvas, timeline, element-library or null' })
  }

  if (!Array.isArray(body.assets)) errors.push({ field: 'assets', message: 'assets must be an array' })
  else if (body.assets.length > MAX_ASSETS) errors.push({ field: 'assets', message: `assets must contain at most ${MAX_ASSETS} items` })
  else errors.push(...validatePersistedStringFields(body.assets, 'assets', 'assets'))
  if (!Array.isArray(body.tracks)) errors.push({ field: 'tracks', message: 'tracks must be an array' })
  else {
    if (body.tracks.length > MAX_TRACKS) errors.push({ field: 'tracks', message: `tracks must contain at most ${MAX_TRACKS} items` })
    else errors.push(...validatePersistedStringFields(body.tracks, 'tracks', 'tracks'))
    body.tracks.forEach((track: any, index: number) => {
      if (!isObject(track)) return errors.push({ field: `tracks[${index}]`, message: 'track must be an object' })
      if (!isValidId(track.id)) errors.push({ field: `tracks[${index}].id`, message: 'id is required' })
      if (!Array.isArray(track.elements)) errors.push({ field: `tracks[${index}].elements`, message: 'elements must be an array' })
      else if (track.elements.length > MAX_ELEMENTS_PER_TRACK) errors.push({ field: `tracks[${index}].elements`, message: `elements must contain at most ${MAX_ELEMENTS_PER_TRACK} items` })
    })
  }
  return errors
}

router.put('/', authenticateRequest, requireRole(['admin', 'editor']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = req.params.projectId
    if (!projectId || typeof projectId !== 'string') return res.status(400).json({ success: false, message: 'projectId is required' })
    if (!isMongoConnected()) return res.status(503).json({ success: false, message: 'MongoDB is not connected' })

    const validationErrors = validateSnapshotPayload(req.body)
    if (validationErrors.length > 0) return res.status(422).json({ success: false, message: 'Validation failed', errors: validationErrors })

    const db = getMongoDb(); if (!db) return res.status(503).json({ success: false, message: 'MongoDB database is unavailable' })
    const projectsCollection: any = db.collection('projects')
    const project = await projectsCollection.findOne({ id: projectId })
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' })
    if (req.user?.role !== 'admin' && project.ownerUserId !== req.user?.id) return res.status(403).json({ success: false, message: 'Forbidden' })

    const snapshotsCollection: any = db.collection('project_snapshots')
    const now = new Date().toISOString()
    const snapshotDocument = { projectId, snapshotVersion: req.body.snapshotVersion, savedAt: req.body.savedAt, project: req.body.project, playback: req.body.playback, selection: req.body.selection, assets: req.body.assets, tracks: req.body.tracks, updatedAt: now }

    await snapshotsCollection.updateOne({ projectId }, { $set: snapshotDocument, $setOnInsert: { createdAt: now } }, { upsert: true })
    const savedSnapshot = await snapshotsCollection.findOne({ projectId }, { projection: { _id: 0 } })
    console.info('snapshot_save', { actorUserId: req.user?.id, projectId })
    return res.status(200).json({ success: true, message: 'Snapshot saved successfully', data: savedSnapshot })
  } catch (error: any) {
    console.error('Error saving snapshot:', { message: error?.message })
    return res.status(500).json({ success: false, message: 'Server error' })
  }
})

router.get('/', authenticateRequest, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = req.params.projectId
    if (!projectId || typeof projectId !== 'string') return res.status(400).json({ success: false, message: 'projectId is required' })
    if (!isMongoConnected()) return res.status(503).json({ success: false, message: 'MongoDB is not connected' })
    const db = getMongoDb(); if (!db) return res.status(503).json({ success: false, message: 'MongoDB database is unavailable' })

    const projectsCollection: any = db.collection('projects')
    const project = await projectsCollection.findOne({ id: projectId })
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' })
    if (req.user?.role !== 'admin' && project.ownerUserId !== req.user?.id) return res.status(403).json({ success: false, message: 'Forbidden' })

    const snapshotsCollection: any = db.collection('project_snapshots')
    const snapshot = await snapshotsCollection.findOne({ projectId }, { projection: { _id: 0 } })
    if (!snapshot) return res.status(404).json({ success: false, message: 'Snapshot not found' })
    return res.status(200).json({ success: true, message: 'Snapshot fetched successfully', data: snapshot })
  } catch (error: any) {
    console.error('Error fetching snapshot:', { message: error?.message })
    return res.status(500).json({ success: false, message: 'Server error' })
  }
})

export default router
