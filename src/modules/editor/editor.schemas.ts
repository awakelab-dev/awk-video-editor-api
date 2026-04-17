import { z } from 'zod'

const idSchema = z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/)
const hexColorSchema = z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/)

export const projectIdParamsSchema = z.object({
  projectId: idSchema
})

export const renderIdParamsSchema = z.object({
  renderId: idSchema
})

export const projectAndSceneParamsSchema = z.object({
  projectId: idSchema,
  sceneId: idSchema
})

export const projectCreateSchema = z.object({
  id: idSchema.optional(),
  name: z.string().min(1).max(120),
  duration: z.number().min(0).default(0),
  resolution: z.object({
    w: z.number().int().positive(),
    h: z.number().int().positive()
  })
}).strict()

export const projectPatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  duration: z.number().min(0).optional(),
  resolution: z.object({
    w: z.number().int().positive(),
    h: z.number().int().positive()
  }).optional()
}).strict()

const baseElementSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(200),
  startTime: z.number().min(0),
  duration: z.number().min(0),
  opacity: z.number().min(0).max(100)
})

const textElementSchema = baseElementSchema.extend({
  type: z.literal('text'),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number(),
  text: z.string().min(1).max(5000),
  fontFamily: z.string().min(1).max(120),
  fontSize: z.number().positive(),
  fontWeight: z.number().int().min(100).max(900),
  textColor: hexColorSchema,
  backgroundColor: z.string().min(1).max(30),
  lineHeight: z.number().positive(),
  letterSpacing: z.number(),
  textAlign: z.enum(['left', 'center', 'right', 'justify'])
})

const videoElementSchema = baseElementSchema.extend({
  type: z.literal('video'),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number(),
  source: z.string().min(1),
  trimStart: z.number().min(0),
  trimEnd: z.number().min(0),
  playbackRate: z.number().positive(),
  volume: z.number().min(0).max(1),
  muted: z.boolean()
})

const imageElementSchema = baseElementSchema.extend({
  type: z.literal('image'),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number(),
  source: z.string().min(1),
  fit: z.enum(['cover', 'contain', 'fill'])
})

const audioElementSchema = baseElementSchema.extend({
  type: z.literal('audio'),
  source: z.string().min(1),
  playbackRate: z.number().positive(),
  volume: z.number().min(0).max(1),
  muted: z.boolean(),
  fadeIn: z.number().min(0),
  fadeOut: z.number().min(0)
})

const shapeElementSchema = baseElementSchema.extend({
  type: z.literal('shape'),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number(),
  shapeType: z.enum(['rectangle', 'ellipse', 'line', 'triangle', 'polygon']),
  fillColor: hexColorSchema,
  strokeColor: hexColorSchema,
  strokeWidth: z.number().min(0),
  cornerRadius: z.number().min(0)
})

export const editorElementSchema = z.discriminatedUnion('type', [
  textElementSchema,
  videoElementSchema,
  imageElementSchema,
  audioElementSchema,
  shapeElementSchema
])

export const trackSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(120),
  elements: z.array(editorElementSchema)
})

export const mediaAssetSchema = z.object({
  id: idSchema,
  fileName: z.string().min(1).max(255),
  type: z.enum(['video', 'image', 'audio']),
  source: z.string().min(1),
  mimeType: z.string().optional(),
  duration: z.number().min(0).nullable().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional()
})

export const editorStatePatchSchema = z.object({
  revision: z.number().int().min(0),
  sessionId: idSchema.optional(),
  project: z.object({
    projectName: z.string().min(1).max(120),
    duration: z.number().min(0),
    resolution: z.object({
      w: z.number().int().positive(),
      h: z.number().int().positive()
    })
  }).optional(),
  playback: z.object({
    currentTime: z.number().min(0),
    isPlaying: z.boolean(),
    zoomLevel: z.number().min(1)
  }),
  selection: z.object({
    selectedElementId: idSchema.nullable(),
    selectionSource: z.enum(['canvas', 'timeline', 'element-library']).nullable()
  }),
  assets: z.array(mediaAssetSchema),
  tracks: z.array(trackSchema)
}).strict()

export const snapshotSchema = z.object({
  snapshotVersion: z.literal(1),
  savedAt: z.string().datetime(),
  project: z.object({
    projectName: z.string().min(1).max(120),
    duration: z.number().min(0),
    resolution: z.object({
      w: z.number().int().positive(),
      h: z.number().int().positive()
    })
  }),
  playback: z.object({
    currentTime: z.number().min(0),
    isPlaying: z.boolean(),
    zoomLevel: z.number().min(1)
  }),
  selection: z.object({
    selectedElementId: idSchema.nullable(),
    selectionSource: z.enum(['canvas', 'timeline', 'element-library']).nullable()
  }),
  assets: z.array(
    z.object({
      id: idSchema,
      duration: z.number().min(0).nullable()
    })
  ),
  tracks: z.array(
    z.object({
      id: idSchema,
      duration: z.number().min(0),
      elements: z.array(
        z.object({
          id: idSchema,
          duration: z.number().min(0)
        })
      )
    })
  )
}).strict()

export const joinSessionSchema = z.object({
  participantId: idSchema,
  displayName: z.string().min(1).max(120)
}).strict()

export const createTextElementSchema = z.object({
  type: z.literal('text'),
  trackId: idSchema,
  text: z.string().min(1).max(5000),
  position: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1)
  }),
  style: z.object({
    fontSize: z.number().positive(),
    fontWeight: z.number().int().min(100).max(900),
    color: hexColorSchema
  }),
  timing: z.object({
    startMs: z.number().min(0),
    durationMs: z.number().positive()
  })
}).strict()

export const mediaListQuerySchema = z.object({
  projectId: idSchema.optional(),
  type: z.enum(['video', 'image', 'audio']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(120).optional()
})

const resourceRefSchema = z.object({
  id: idSchema,
  kind: z.enum(['video', 'image', 'audio', 'font', 'template', 'shape', 'unknown']),
  url: z.string().url().optional(),
  source: z.string().optional(),
  mimeType: z.string().optional(),
  duration: z.number().min(0).nullable().optional()
}).strict()

const styleSchema = z.object({
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().min(0).optional(),
  opacity: z.number().min(0).max(1).optional(),
  fontFamily: z.string().optional(),
  fontSize: z.number().positive().optional(),
  fontWeight: z.number().int().min(100).max(900).optional(),
  color: z.string().optional(),
  backgroundColor: z.string().optional(),
  textAlign: z.enum(['left', 'center', 'right', 'justify']).optional()
}).strict()

const transformSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number().default(0),
  scaleX: z.number().positive().default(1),
  scaleY: z.number().positive().default(1),
  anchorX: z.number().min(0).max(1).optional(),
  anchorY: z.number().min(0).max(1).optional()
}).strict()

const sceneElementSchema = z.object({
  id: idSchema,
  type: z.enum(['video', 'image', 'audio', 'text', 'shape']),
  name: z.string().min(1).max(200),
  layerOrder: z.number().int().min(0),
  timing: z.object({
    start: z.number().min(0),
    duration: z.number().min(0)
  }).strict(),
  transform: transformSchema,
  style: styleSchema.default({}),
  content: z.record(z.string(), z.any()).default({}),
  resourceRef: resourceRefSchema.optional()
}).strict()

const sceneTrackSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(120),
  layerOrder: z.number().int().min(0),
  duration: z.number().min(0),
  elements: z.array(sceneElementSchema)
}).strict()

export const upsertSceneSchema = z.object({
  projectId: idSchema,
  sceneId: idSchema,
  metadata: z.object({
    name: z.string().min(1).max(120),
    description: z.string().max(1000).optional(),
    editorVersion: z.string().max(50).optional(),
    createdBy: z.string().max(120).optional(),
    updatedBy: z.string().max(120).optional()
  }).strict(),
  payload: z.object({
    canvas: z.object({
      width: z.number().positive(),
      height: z.number().positive(),
      backgroundColor: z.string().optional()
    }).strict(),
    layerOrder: z.array(idSchema),
    timeline: z.object({
      fps: z.number().positive(),
      duration: z.number().min(0),
      tracks: z.array(sceneTrackSchema)
    }).strict(),
    resources: z.array(resourceRefSchema).default([]),
    selection: z.object({
      selectedElementId: idSchema.nullable().optional(),
      selectedTrackId: idSchema.nullable().optional()
    }).strict().optional(),
    viewport: z.object({
      zoom: z.number().positive().optional(),
      scrollX: z.number().optional(),
      scrollY: z.number().optional()
    }).strict().optional()
  }).strict()
}).strict()

export type EditorStatePatchInput = z.infer<typeof editorStatePatchSchema>
export type SnapshotInput = z.infer<typeof snapshotSchema>
export type CreateTextElementInput = z.infer<typeof createTextElementSchema>
export type UpsertSceneInput = z.infer<typeof upsertSceneSchema>
