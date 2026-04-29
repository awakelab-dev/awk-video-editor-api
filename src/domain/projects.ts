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
    tracks: [],
    updatedAt: project.updatedAt
  }
}
