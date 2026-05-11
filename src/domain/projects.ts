import { randomUUID } from 'crypto'
import { isSafeDisplayText } from './safeText'

export type Resolution = {
  w: number
  h: number
}

export type ProjectDocument = {
  id: string
  name: string
  duration: number
  resolution: Resolution
  ownerUserId: string
  createdAt: string
  updatedAt: string
}

export type ApiProject = {
  projectId: string
  name: string
  duration: number
  resolution: Resolution
  createdAt: string
  updatedAt: string
}

export type InitialEditorState = {
  projectId: string
  project: {
    projectName: string
    duration: number
    resolution: Resolution
  }
  playback: { currentTime: number; isPlaying: boolean; zoomLevel: number }
  selection: { selectedElementId: string | null; selectionSource: string | null }
  assets: unknown[]
  tracks: unknown[]
  updatedAt: string
}

export type ValidationError = { field: string; message: string }

type ProjectCreatePayload = { name: string; duration?: number; resolution: Resolution }

const allowedCreateFields = new Set(['name', 'duration', 'resolution'])
const MAX_WIDTH = 7680
const MAX_HEIGHT = 4320
const MAX_DURATION = 60 * 60 * 24
const DURATION_DECIMAL_PLACES = 3
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFinitePositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value > 0
}

export function isSafeDurationSeconds(value: unknown, max = MAX_DURATION): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) return false
  const scaled = value * 10 ** DURATION_DECIMAL_PLACES
  return Math.abs(scaled - Math.round(scaled)) < 1e-9 && Number.isSafeInteger(Math.round(scaled))
}

export function generateProjectId(): string {
  return `proj_${randomUUID().replace(/-/g, '')}`
}

export function validateCreateProjectPayload(body: unknown): ValidationError[] {
  const errors: ValidationError[] = []
  if (!isObject(body)) return [{ field: 'body', message: 'Body must be a JSON object' }]

  for (const key of Object.keys(body)) {
    if (RESERVED_KEYS.has(key)) errors.push({ field: key, message: 'Reserved key is not allowed' })
    if (!allowedCreateFields.has(key)) errors.push({ field: key, message: `${key} is not allowed` })
  }

  if ('id' in body) errors.push({ field: 'id', message: 'id must not be provided' })
  if ('projectId' in body) errors.push({ field: 'projectId', message: 'projectId must not be provided' })
  if ('ownerUserId' in body) errors.push({ field: 'ownerUserId', message: 'ownerUserId must not be provided' })
  if ('createdAt' in body) errors.push({ field: 'createdAt', message: 'createdAt must not be provided' })
  if ('updatedAt' in body) errors.push({ field: 'updatedAt', message: 'updatedAt must not be provided' })

  if (typeof body.name !== 'string') {
    errors.push({ field: 'name', message: 'Name is required' })
  } else {
    const trimmed = body.name.trim()
    if (!trimmed) errors.push({ field: 'name', message: 'Name is required' })
    if (trimmed.length > 120) errors.push({ field: 'name', message: 'Name must be between 1 and 120 characters' })
    if (!isSafeDisplayText(trimmed)) errors.push({ field: 'name', message: 'Name contains unsafe characters or markup-like content' })
  }

  if (body.duration !== undefined) {
    if (!isSafeDurationSeconds(body.duration)) {
      errors.push({ field: 'duration', message: `Duration must be a finite number of seconds between 0 and ${MAX_DURATION} with up to ${DURATION_DECIMAL_PLACES} decimal places` })
    }
  }

  if (!isObject(body.resolution)) {
    errors.push({ field: 'resolution', message: 'Resolution is required' })
  } else {
    for (const key of Object.keys(body.resolution)) {
      if (RESERVED_KEYS.has(key)) errors.push({ field: `resolution.${key}`, message: 'Reserved key is not allowed' })
      if (key !== 'w' && key !== 'h') errors.push({ field: `resolution.${key}`, message: `${key} is not allowed` })
    }
    if (!isFinitePositiveInteger(body.resolution.w)) errors.push({ field: 'resolution.w', message: 'Width must be a positive integer' })
    else if (body.resolution.w > MAX_WIDTH) errors.push({ field: 'resolution.w', message: `Width must be less than or equal to ${MAX_WIDTH}` })
    if (!isFinitePositiveInteger(body.resolution.h)) errors.push({ field: 'resolution.h', message: 'Height must be a positive integer' })
    else if (body.resolution.h > MAX_HEIGHT) errors.push({ field: 'resolution.h', message: `Height must be less than or equal to ${MAX_HEIGHT}` })
  }

  return errors
}

export function normalizeCreateProjectPayload(body: ProjectCreatePayload): Pick<ProjectDocument, 'name' | 'duration' | 'resolution'> {
  return {
    name: body.name.trim(),
    duration: body.duration ?? 0,
    resolution: { w: body.resolution.w, h: body.resolution.h }
  }
}

export function toApiProject(project: ProjectDocument): ApiProject {
  return {
    projectId: project.id,
    name: project.name,
    duration: project.duration,
    resolution: project.resolution,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  }
}

export function buildInitialEditorState(project: ProjectDocument): InitialEditorState {
  return {
    projectId: project.id,
    project: { projectName: project.name, duration: project.duration, resolution: project.resolution },
    playback: { currentTime: 0, isPlaying: false, zoomLevel: 100 },
    selection: { selectedElementId: null, selectionSource: null },
    assets: [],
    tracks: [],
    updatedAt: project.updatedAt
  }
}
