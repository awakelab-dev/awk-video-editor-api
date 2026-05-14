import { randomUUID } from 'crypto'

export type Resolution = {
  w: number
  h: number
}

export type ProjectDocument = {
  id: string
  name: string
  duration: number
  resolution: Resolution
  revision?: number
  sessionId?: string | null
  playback?: ProjectPlayback
  selection?: ProjectSelection
  assets?: Record<string, unknown>
  tracks?: ProjectTrack[]
  elements?: Record<string, ProjectElement>
  createdAt: string
  updatedAt: string
}

export type ProjectPlayback = {
  currentTime: number
  isPlaying: boolean
  zoomLevel: number
}

export type ProjectSelection = {
  selectedElementId: string | null
  selectedTrackId?: string | null
  selectionSource: 'canvas' | 'timeline' | 'element-library' | null
}

export type ProjectTrack = {
  id: string
  name: string
  type?: 'video' | 'image' | 'audio' | 'text' | 'shape' | 'mixed'
  elementIds: string[]
}

export type ProjectElement = {
  id?: string
  type?: string
  name?: string
  startTime?: number
  duration?: number
  opacity?: number
  trackId?: string
  [key: string]: unknown
}

export type ApiProject = {
  projectId: string
  name: string
  duration: number
  resolution: Resolution
  revision: number
  sessionId?: string | null
  playback: ProjectPlayback
  selection: ProjectSelection
  assets: Record<string, unknown>
  tracks: ProjectTrack[]
  elements: Record<string, ProjectElement>
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
  playback: {
    currentTime: number
    isPlaying: boolean
    zoomLevel: number
  }
  selection: {
    selectedElementId: string | null
    selectionSource: string | null
  }
  assets: unknown[]
  tracks: unknown[]
  updatedAt: string
}

export type ValidationError = {
  field: string
  message: string
}

type ProjectCreatePayload = {
  name: string
  duration?: number
  resolution: Resolution
}

const allowedCreateFields = new Set(['name', 'duration', 'resolution'])

export function createDefaultProjectTracks(): ProjectTrack[] {
  return [
    {
      id: 'track-text',
      name: 'Text',
      type: 'text',
      elementIds: []
    },
    {
      id: 'track-audio',
      name: 'Audio',
      type: 'audio',
      elementIds: []
    },
    {
      id: 'track-media',
      name: 'Media',
      type: 'mixed',
      elementIds: []
    }
  ]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

export function generateProjectId(): string {
  return `proj_${randomUUID().replace(/-/g, '')}`
}

export function validateCreateProjectPayload(body: unknown): ValidationError[] {
  const errors: ValidationError[] = []

  if (!isObject(body)) {
    return [{ field: 'body', message: 'Body must be a JSON object' }]
  }

  for (const key of Object.keys(body)) {
    if (!allowedCreateFields.has(key)) {
      errors.push({ field: key, message: `${key} is not allowed` })
    }
  }

  if ('id' in body) {
    errors.push({ field: 'id', message: 'id must not be provided' })
  }

  if ('projectId' in body) {
    errors.push({ field: 'projectId', message: 'projectId must not be provided' })
  }

  if (typeof body.name !== 'string' || body.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Name is required' })
  } else if (body.name.trim().length > 120) {
    errors.push({ field: 'name', message: 'Name must be between 1 and 120 characters' })
  }

  if (body.duration !== undefined && (typeof body.duration !== 'number' || body.duration < 0)) {
    errors.push({ field: 'duration', message: 'Duration must be a number greater than or equal to 0' })
  }

  if (!isObject(body.resolution)) {
    errors.push({ field: 'resolution', message: 'Resolution is required' })
  } else {
    for (const key of Object.keys(body.resolution)) {
      if (key !== 'w' && key !== 'h') {
        errors.push({ field: `resolution.${key}`, message: `${key} is not allowed` })
      }
    }

    if (!isPositiveInteger(body.resolution.w)) {
      errors.push({ field: 'resolution.w', message: 'Width must be a positive integer' })
    }

    if (!isPositiveInteger(body.resolution.h)) {
      errors.push({ field: 'resolution.h', message: 'Height must be a positive integer' })
    }
  }

  return errors
}

export function normalizeCreateProjectPayload(body: ProjectCreatePayload): Pick<ProjectDocument, 'name' | 'duration' | 'resolution'> {
  return {
    name: body.name.trim(),
    duration: body.duration ?? 0,
    resolution: {
      w: body.resolution.w,
      h: body.resolution.h
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizePlayback(playback: unknown): ProjectPlayback {
  if (!isRecord(playback)) {
    return {
      currentTime: 0,
      isPlaying: false,
      zoomLevel: 100
    }
  }

  return {
    currentTime: typeof playback.currentTime === 'number' ? playback.currentTime : 0,
    isPlaying: typeof playback.isPlaying === 'boolean' ? playback.isPlaying : false,
    zoomLevel: typeof playback.zoomLevel === 'number' ? playback.zoomLevel : 100
  }
}

function normalizeSelection(selection: unknown): ProjectSelection {
  if (!isRecord(selection)) {
    return {
      selectedElementId: null,
      selectedTrackId: null,
      selectionSource: null
    }
  }

  const source = selection.selectionSource
  return {
    selectedElementId:
      typeof selection.selectedElementId === 'string' ? selection.selectedElementId : null,
    selectedTrackId:
      typeof selection.selectedTrackId === 'string' ? selection.selectedTrackId : null,
    selectionSource:
      source === 'canvas' || source === 'timeline' || source === 'element-library'
        ? source
        : null
  }
}

function normalizeAssets(assets: unknown): Record<string, unknown> {
  return isRecord(assets) ? assets : {}
}

function normalizeElements(elements: unknown): Record<string, ProjectElement> {
  if (!isRecord(elements)) {
    return {}
  }

  const normalized: Record<string, ProjectElement> = {}

  for (const [elementId, element] of Object.entries(elements)) {
    if (!isRecord(element)) {
      continue
    }

    normalized[elementId] = {
      ...element,
      id: typeof element.id === 'string' ? element.id : elementId
    } as ProjectElement
  }

  return normalized
}

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return []
  }

  return [...new Set(values.filter((value): value is string => typeof value === 'string'))]
}

function getTrackElementIds(track: Record<string, unknown>): string[] {
  const explicitElementIds = uniqueStrings(track.elementIds)
  if (explicitElementIds.length > 0) {
    return explicitElementIds
  }

  if (!Array.isArray(track.elements)) {
    return []
  }

  return uniqueStrings(
    track.elements
      .filter(isRecord)
      .map((element) => element.id)
  )
}

function normalizeTracks(
  tracks: unknown,
  elements: Record<string, ProjectElement>
): ProjectTrack[] {
  const rawTracks = Array.isArray(tracks) ? tracks.filter(isRecord) : []
  const normalizedTracks = rawTracks.map((track): ProjectTrack => ({
    id: typeof track.id === 'string' ? track.id : 'track-media',
    name: typeof track.name === 'string' ? track.name : String(track.id ?? 'Media'),
    type:
      track.type === 'video' ||
      track.type === 'image' ||
      track.type === 'audio' ||
      track.type === 'text' ||
      track.type === 'shape' ||
      track.type === 'mixed'
        ? track.type
        : undefined,
    elementIds: getTrackElementIds(track)
  }))

  for (const defaultTrack of createDefaultProjectTracks()) {
    if (!normalizedTracks.some((track) => track.id === defaultTrack.id)) {
      normalizedTracks.push(defaultTrack)
    }
  }

  for (const [elementId, element] of Object.entries(elements)) {
    if (normalizedTracks.some((track) => track.elementIds.includes(elementId))) {
      continue
    }

    if (typeof element.trackId !== 'string') {
      continue
    }

    const track = normalizedTracks.find((candidate) => candidate.id === element.trackId)
    if (track) {
      track.elementIds = [...track.elementIds, elementId]
    }
  }

  return normalizedTracks
}

export function toApiProject(project: ProjectDocument): ApiProject {
  const elements = normalizeElements(project.elements)

  return {
    projectId: project.id,
    name: project.name,
    duration: project.duration,
    resolution: project.resolution,
    revision: typeof project.revision === 'number' ? project.revision : 0,
    ...(project.sessionId !== undefined ? { sessionId: project.sessionId } : {}),
    playback: normalizePlayback(project.playback),
    selection: normalizeSelection(project.selection),
    assets: normalizeAssets(project.assets),
    tracks: normalizeTracks(project.tracks, elements),
    elements,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  }
}

export function buildInitialEditorState(project: ProjectDocument): InitialEditorState {
  return {
    projectId: project.id,
    project: {
      projectName: project.name,
      duration: project.duration,
      resolution: project.resolution
    },
    playback: {
      currentTime: 0,
      isPlaying: false,
      zoomLevel: 100
    },
    selection: {
      selectedElementId: null,
      selectionSource: null
    },
    assets: [],
    tracks: normalizeTracks(project.tracks, normalizeElements(project.elements)),
    updatedAt: project.updatedAt
  }
}
