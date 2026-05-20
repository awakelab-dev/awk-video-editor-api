export type IconProvider = 'iconify'

export type IconSearchParams = {
  q?: string
  provider?: IconProvider
  category?: string
  limit?: number
  offset?: number
}

export type IconRecord = {
  id: string
  provider: IconProvider
  iconId: string
  prefix: string
  name: string
  label: string
  category: string
  tags: string[]
  license: string | null
  preview: {
    type: 'iconify-id'
    value: string
  }
}

export type IconSearchResult = {
  provider: IconProvider
  source: 'iconify-api' | 'default-catalog'
  items: IconRecord[]
  total: number
  limit: number
  offset: number
}

export type IconFetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean
  status: number
  headers?: { get(name: string): string | null }
  json(): Promise<any>
}>

const MAX_QUERY_LENGTH = 64
const MAX_CATEGORY_LENGTH = 32
const DEFAULT_LIMIT = 24
const MAX_LIMIT = 100
const MAX_UPSTREAM_RESULTS = 100

const ICONIFY_SEARCH_URL = 'https://api.iconify.design/search'
const PROVIDER_PATTERN = /^iconify$/
const CATEGORY_PATTERN = /^[a-z0-9-]+$/
const ICONIFY_ID_PATTERN = /^[a-z0-9]+[a-z0-9-]*:[a-z0-9]+[a-z0-9-]*$/
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/
const BIDI_CONTROLS = /[\u202A-\u202E\u2066-\u2069]/
const MARKUP_LIKE = /<|>|javascript:|data:|vbscript:|on[a-z]+\s*=|&(?:lt|gt|#0*60|#x0*3c|#0*62|#x0*3e);?/i
const PERCENT_ENCODED_MARKUP = /%(?:25)*(?:3c|3e|22|27|28|29|2f)/i
const STOP_WORDS = new Set(['de', 'la', 'el', 'y', 'a', 'the', 'of', 'and'])

const DEFAULT_ICONIFY_CATALOG: IconRecord[] = [
  createDefaultIcon('mdi:movie-open', 'Movie Open', 'media', ['video', 'movie', 'film', 'editor', 'cine']),
  createDefaultIcon('mdi:play', 'Play', 'media', ['play', 'video', 'reproducir']),
  createDefaultIcon('mdi:pause', 'Pause', 'media', ['pause', 'pausa']),
  createDefaultIcon('mdi:stop', 'Stop', 'media', ['stop', 'detener']),
  createDefaultIcon('mdi:volume-high', 'Volume High', 'media', ['volume', 'audio', 'sound', 'sonido']),
  createDefaultIcon('mdi:music', 'Music', 'media', ['music', 'musica', 'música', 'audio']),
  createDefaultIcon('mdi:microphone', 'Microphone', 'media', ['microphone', 'mic', 'voice', 'voz']),
  createDefaultIcon('mdi:camera', 'Camera', 'media', ['camera', 'photo', 'foto', 'image']),
  createDefaultIcon('mdi:image', 'Image', 'media', ['image', 'picture', 'photo', 'imagen']),
  createDefaultIcon('mdi:content-cut', 'Cut', 'editing', ['cut', 'scissors', 'trim', 'cortar']),
  createDefaultIcon('mdi:format-text', 'Text', 'editing', ['text', 'caption', 'title', 'texto']),
  createDefaultIcon('mdi:closed-caption', 'Closed Caption', 'editing', ['caption', 'subtitles', 'subtitle', 'subtitulos']),
  createDefaultIcon('mdi:upload', 'Upload', 'actions', ['upload', 'subir']),
  createDefaultIcon('mdi:download', 'Download', 'actions', ['download', 'descargar']),
  createDefaultIcon('mdi:trash-can', 'Trash Can', 'actions', ['trash', 'delete', 'remove', 'borrar']),
  createDefaultIcon('mdi:cog', 'Settings', 'actions', ['settings', 'config', 'configuration', 'ajustes']),
  createDefaultIcon('mdi:magnify', 'Search', 'actions', ['search', 'find', 'buscar']),
  createDefaultIcon('mdi:alert', 'Alert', 'status', ['alert', 'warning', 'danger', 'alerta']),
  createDefaultIcon('mdi:check', 'Check', 'status', ['check', 'ok', 'done', 'success']),
  createDefaultIcon('mdi:close', 'Close', 'status', ['close', 'cancel', 'error', 'cerrar']),
  createDefaultIcon('mdi:heart', 'Heart', 'objects', ['heart', 'love', 'like', 'corazon', 'corazón']),
  createDefaultIcon('mdi:coffee', 'Coffee', 'objects', ['coffee', 'cafe', 'café', 'cup', 'mug', 'taza', 'bebida']),
]

export function validateIconSearchParams(raw: any) {
  const errors: Array<{ field: string, message: string }> = []
  const normalized: Required<IconSearchParams> = {
    q: '',
    provider: 'iconify',
    category: '',
    limit: DEFAULT_LIMIT,
    offset: 0,
  }

  if (raw.provider !== undefined) {
    if (typeof raw.provider !== 'string') {
      errors.push({ field: 'provider', message: 'provider must be a string' })
    } else {
      const value = normalizePublicInput(raw.provider).toLowerCase()
      if (!PROVIDER_PATTERN.test(value)) {
        errors.push({ field: 'provider', message: 'provider must be iconify' })
      } else {
        normalized.provider = value as IconProvider
      }
    }
  }

  if (raw.q !== undefined) {
    if (typeof raw.q !== 'string') {
      errors.push({ field: 'q', message: 'q must be a string' })
    } else {
      const value = normalizePublicInput(raw.q)
      if (value.length > MAX_QUERY_LENGTH) errors.push({ field: 'q', message: `q must be at most ${MAX_QUERY_LENGTH} characters` })
      if (hasUnsafePublicText(value)) errors.push({ field: 'q', message: 'q contains unsafe content' })
      normalized.q = value
    }
  }

  if (raw.category !== undefined) {
    if (typeof raw.category !== 'string') {
      errors.push({ field: 'category', message: 'category must be a string' })
    } else {
      const value = normalizePublicInput(raw.category).toLowerCase()
      if (!value) {
        errors.push({ field: 'category', message: 'category cannot be empty' })
      } else {
        if (value.length > MAX_CATEGORY_LENGTH) errors.push({ field: 'category', message: `category must be at most ${MAX_CATEGORY_LENGTH} characters` })
        if (hasUnsafePublicText(value)) errors.push({ field: 'category', message: 'category contains unsafe content' })
        if (!CATEGORY_PATTERN.test(value)) errors.push({ field: 'category', message: 'category must contain only lowercase letters, digits, and hyphens' })
        normalized.category = value
      }
    }
  }

  normalized.limit = parseIntegerField(raw.limit, 'limit', 1, MAX_LIMIT, DEFAULT_LIMIT, errors)
  normalized.offset = parseIntegerField(raw.offset, 'offset', 0, Number.MAX_SAFE_INTEGER, 0, errors)

  return { errors, params: normalized }
}

export async function searchIcons(rawParams: Required<IconSearchParams>, iconFetch: IconFetch = defaultFetch): Promise<IconSearchResult> {
  const localResult = searchDefaultCatalog(rawParams)

  if (!rawParams.q) return localResult

  try {
    const upstream = await searchIconify(rawParams, iconFetch)
    if (upstream.items.length > 0) return upstream
    return localResult
  } catch {
    return localResult
  }
}

export function searchDefaultCatalog(rawParams: Required<IconSearchParams>): IconSearchResult {
  const q = normalizeSearchText(rawParams.q ?? '')
  const category = normalizeSearchText(rawParams.category ?? '')
  const limit = rawParams.limit ?? DEFAULT_LIMIT
  const offset = rawParams.offset ?? 0
  const tokens = q ? q.split(/\s+/).filter((token) => token && !STOP_WORDS.has(token)) : []

  const filtered = DEFAULT_ICONIFY_CATALOG.filter((record) => {
    if (category && record.category !== category) return false
    if (tokens.length === 0) return true
    const haystack = normalizeSearchText([record.id, record.iconId, record.label, record.category, ...record.tags].join(' '))
    return tokens.every((token) => haystack.includes(token))
  })

  return {
    provider: 'iconify',
    source: 'default-catalog',
    items: filtered.slice(offset, offset + limit).map(cloneIconRecord),
    total: filtered.length,
    limit,
    offset,
  }
}

async function searchIconify(rawParams: Required<IconSearchParams>, iconFetch: IconFetch): Promise<IconSearchResult> {
  const limit = Math.min(rawParams.limit, MAX_UPSTREAM_RESULTS)
  const offset = rawParams.offset
  const url = new URL(ICONIFY_SEARCH_URL)
  url.searchParams.set('query', rawParams.q)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('start', String(offset))

  const response = await iconFetch(url.toString(), {
    headers: { accept: 'application/json' },
  })

  if (!response.ok) throw new Error(`Iconify search failed: ${response.status}`)

  const payload = await response.json()
  const iconIds = extractIconifyIds(payload)
  const items = iconIds
    .map((iconId) => iconifyIdToRecord(iconId))
    .filter((record): record is IconRecord => Boolean(record))

  return {
    provider: 'iconify',
    source: 'iconify-api',
    items,
    total: Number.isInteger(payload?.total) && payload.total >= 0 ? payload.total : items.length,
    limit,
    offset,
  }
}

function extractIconifyIds(payload: any): string[] {
  const rawIcons: unknown[] = Array.isArray(payload?.icons) ? payload.icons : []
  const iconIds: string[] = rawIcons
    .filter((value): value is string => typeof value === 'string')
    .map((value) => normalizePublicInput(value).toLowerCase())
    .filter((value) => ICONIFY_ID_PATTERN.test(value))
    .filter((value) => !hasUnsafePublicText(value))

  return [...new Set(iconIds)].slice(0, MAX_UPSTREAM_RESULTS)
}

function iconifyIdToRecord(iconId: string): IconRecord | null {
  if (!ICONIFY_ID_PATTERN.test(iconId)) return null
  const [prefix, name] = iconId.split(':')
  if (!prefix || !name) return null
  const label = titleCase(name.replace(/[-_]+/g, ' '))
  return {
    id: iconId,
    provider: 'iconify',
    iconId,
    prefix,
    name,
    label,
    category: inferCategory(name),
    tags: uniqueTags([prefix, ...name.split(/[-_]+/g)]),
    license: null,
    preview: {
      type: 'iconify-id',
      value: iconId,
    },
  }
}

function createDefaultIcon(iconId: string, label: string, category: string, tags: string[]): IconRecord {
  const [prefix, name] = iconId.split(':')
  return {
    id: iconId,
    provider: 'iconify',
    iconId,
    prefix,
    name,
    label,
    category,
    tags: uniqueTags(tags),
    license: null,
    preview: {
      type: 'iconify-id',
      value: iconId,
    },
  }
}

function cloneIconRecord(record: IconRecord): IconRecord {
  return {
    ...record,
    tags: [...record.tags],
    preview: { ...record.preview },
  }
}

function normalizePublicInput(value: string) {
  return value.normalize('NFKC').trim()
}

function hasUnsafePublicText(value: string) {
  return CONTROL_CHARS.test(value)
    || BIDI_CONTROLS.test(value)
    || PERCENT_ENCODED_MARKUP.test(value)
    || MARKUP_LIKE.test(value)
}

function parseIntegerField(rawValue: any, field: string, min: number, max: number, fallback: number, errors: Array<{ field: string, message: string }>) {
  if (rawValue === undefined) return fallback
  const value = Number(rawValue)
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    errors.push({ field, message: `${field} must be an integer` })
    return fallback
  }
  if (value < min || value > max) {
    errors.push({ field, message: `${field} must be between ${min} and ${max}` })
    return fallback
  }
  return value
}

function normalizeSearchText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function uniqueTags(tags: string[]) {
  return [...new Set(tags.map((tag) => normalizeSearchText(tag)).filter(Boolean))]
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function inferCategory(name: string) {
  const normalized = normalizeSearchText(name)
  if (/play|pause|stop|video|movie|film|music|audio|volume|microphone|camera|image/.test(normalized)) return 'media'
  if (/cut|edit|text|caption|format|timeline|scissors/.test(normalized)) return 'editing'
  if (/check|close|alert|warning|info|error|success/.test(normalized)) return 'status'
  if (/upload|download|trash|delete|settings|cog|search|magnify/.test(normalized)) return 'actions'
  return 'iconify'
}

export function listIconCategories() {
  return [...new Set(DEFAULT_ICONIFY_CATALOG.map((record) => record.category))].sort()
}

async function defaultFetch(url: string, init?: { headers?: Record<string, string> }) {
  if (typeof fetch !== 'function') throw new Error('Global fetch is not available')
  return fetch(url, init) as any
}
