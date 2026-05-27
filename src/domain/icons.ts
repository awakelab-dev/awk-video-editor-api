import { createHmac, randomBytes } from 'node:crypto'
import { translateQueryToEnglish, TranslationFetch, TranslationResult } from './iconTranslation'

export type IconProvider = 'iconify' | 'nounproject'
export type NounProjectFiletype = 'svg' | 'png'

export type IconSearchParams = {
  q?: string
  provider?: IconProvider
  category?: string
  limit?: number
  offset?: number
  color?: string | null
}

export type NormalizedIconSearchParams = {
  q: string
  provider: IconProvider
  category: string
  limit: number
  offset: number
  color: string | null
}

export type NounProjectDownloadParams = {
  iconId: string
  color: string
  filetype: NounProjectFiletype
  size?: number
}

export type IconPreview = {
  type: 'svg-url' | 'thumbnail-url'
  url: string
  value?: string
}

export type IconRecord = {
  id: string
  provider: IconProvider
  iconId: string
  prefix: string | null
  name: string
  label: string
  category: string
  tags: string[]
  styles?: string[]
  license: string | null
  attribution?: string | null
  preview: IconPreview
}

export type IconSearchResult = {
  provider: IconProvider
  source: 'iconify-api' | 'nounproject-api' | 'default-catalog'
  items: IconRecord[]
  total: number
  limit: number
  offset: number
  originalQuery: string
  translatedQuery: string
  translation: TranslationResult['translation']
}

export type NounProjectDownloadResult = {
  provider: 'nounproject'
  iconId: string
  color: string
  filetype: NounProjectFiletype
  size?: number
  base64EncodedFile: string
  contentType: 'image/svg+xml' | 'image/png'
}

export type IconFetch = (url: string, init?: {
  method?: string
  headers?: Record<string, string>
  body?: string
}) => Promise<{
  ok: boolean
  status: number
  headers?: { get(name: string): string | null }
  json(): Promise<any>
}>

export class IconProviderConfigurationError extends Error {
  status = 503
  code = 'ICON_PROVIDER_NOT_CONFIGURED'
  details: Array<{ field: string, message: string }>

  constructor(message: string, details: Array<{ field: string, message: string }> = []) {
    super(message)
    this.details = details
  }
}

const MAX_QUERY_LENGTH = 64
const MAX_CATEGORY_LENGTH = 32
const DEFAULT_LIMIT = 24
const MAX_LIMIT = 100
const MAX_UPSTREAM_RESULTS = 100
const MAX_OFFSET = 10000
const MAX_NOUN_ICON_ID_LENGTH = 32
const MAX_NOUN_FILE_BYTES = 2 * 1024 * 1024
const DEFAULT_NOUN_COLOR = '000000'
const DEFAULT_NOUN_FILETYPE: NounProjectFiletype = 'svg'

const ICONIFY_SEARCH_URL = 'https://api.iconify.design/search'
const NOUN_PROJECT_API_HOST = 'api.thenounproject.com'
const NOUN_PROJECT_SEARCH_URL = `https://${NOUN_PROJECT_API_HOST}/v2/icon`
const PROVIDER_PATTERN = /^(iconify|nounproject)$/
const CATEGORY_PATTERN = /^[a-z0-9-]+$/
const ICONIFY_ID_PATTERN = /^[a-z0-9]+[a-z0-9-]*:[a-z0-9]+[a-z0-9-]*$/
const NOUN_ICON_ID_PATTERN = /^\d+$/
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/
const BIDI_CONTROLS = /[\u202A-\u202E\u2066-\u2069]/
const MARKUP_LIKE = /<|>|javascript:|data:|vbscript:|on[a-z]+\s*=|&(?:lt|gt|#0*60|#x0*3c|#0*62|#x0*3e);?/i
const PERCENT_ENCODED_MARKUP = /%(?:25)*(?:3c|3e|22|27|28|29|2f)/i
const HEX_COLOR_PATTERN = /^#?(?:[a-f0-9]{3}|[a-f0-9]{6})$/i
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/
const UNSAFE_SVG_CONTENT = /<\s*script\b|<\s*foreignObject\b|\son[a-z]+\s*=|javascript\s*:|data\s*:|(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|\/\/|data:|javascript:)/i
const STOP_WORDS = new Set(['de', 'la', 'el', 'y', 'a', 'the', 'of', 'and'])

const DEFAULT_ICONIFY_CATALOG: IconRecord[] = [
  createDefaultIcon('mdi:movie-open', 'Movie Open', 'media', ['video', 'movie', 'film', 'editor', 'cine']),
  createDefaultIcon('mdi:play', 'Play', 'media', ['play', 'video', 'reproducir']),
  createDefaultIcon('mdi:pause', 'Pause', 'media', ['pause', 'pausa']),
  createDefaultIcon('mdi:stop', 'Stop', 'media', ['stop', 'detener']),
  createDefaultIcon('mdi:volume-high', 'Volume High', 'media', ['volume', 'audio', 'sound', 'sonido']),
  createDefaultIcon('mdi:music', 'Music', 'media', ['music', 'musica', 'audio']),
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
  createDefaultIcon('mdi:heart', 'Heart', 'objects', ['heart', 'love', 'like', 'corazon']),
  createDefaultIcon('mdi:coffee', 'Coffee', 'objects', ['coffee', 'cafe', 'cup', 'mug', 'taza', 'bebida']),
  createDefaultIcon('mdi:lamp', 'Lamp', 'objects', ['lamp', 'light', 'lampara', 'yellow lamp']),
  createDefaultIcon('mdi:bicycle', 'Bicycle', 'objects', ['bicycle', 'bike', 'bicicleta', 'bici']),
  createDefaultIcon('mdi:brick', 'Brick', 'objects', ['brick', 'bricks', 'ladrillo']),
  createDefaultIcon('mdi:office-building', 'Building', 'objects', ['building', 'construction', 'edificio', 'construccion']),
]

export function validateIconSearchParams(raw: any, providerOverride?: IconProvider) {
  const errors: Array<{ field: string, message: string }> = []
  const normalized: NormalizedIconSearchParams = {
    q: '',
    provider: providerOverride || 'iconify',
    category: '',
    limit: DEFAULT_LIMIT,
    offset: 0,
    color: null,
  }

  if (providerOverride) {
    normalized.provider = providerOverride
  } else if (raw.provider !== undefined) {
    if (typeof raw.provider !== 'string') {
      errors.push({ field: 'provider', message: 'provider must be a string' })
    } else {
      const value = normalizePublicInput(raw.provider).toLowerCase()
      if (!PROVIDER_PATTERN.test(value)) {
        errors.push({ field: 'provider', message: 'provider must be iconify or nounproject' })
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

  if (raw.color !== undefined) {
    if (typeof raw.color !== 'string') {
      errors.push({ field: 'color', message: 'color must be a string' })
    } else {
      const value = normalizePublicInput(raw.color)
      const color = normalizeIconColor(value)
      if (!color || hasUnsafePublicText(value)) {
        errors.push({ field: 'color', message: 'color must be #rgb, #rrggbb, rgb, or rrggbb hex' })
      } else {
        normalized.color = color
      }
    }
  }

  normalized.limit = parseIntegerField(raw.limit, 'limit', 1, MAX_LIMIT, DEFAULT_LIMIT, errors)
  normalized.offset = parseIntegerField(raw.offset, 'offset', 0, MAX_OFFSET, 0, errors)

  return { errors, params: normalized }
}

export function validateNounProjectDownloadParams(rawParams: any, rawQuery: any) {
  const errors: Array<{ field: string, message: string }> = []
  const normalized: NounProjectDownloadParams = {
    iconId: '',
    color: DEFAULT_NOUN_COLOR,
    filetype: DEFAULT_NOUN_FILETYPE,
  }

  if (
    typeof rawParams.iconId !== 'string'
    || !NOUN_ICON_ID_PATTERN.test(rawParams.iconId)
    || rawParams.iconId.length > MAX_NOUN_ICON_ID_LENGTH
  ) {
    errors.push({ field: 'iconId', message: `iconId must contain 1-${MAX_NOUN_ICON_ID_LENGTH} digits only` })
  } else {
    normalized.iconId = rawParams.iconId
  }

  if (rawQuery.color !== undefined) {
    if (typeof rawQuery.color !== 'string') {
      errors.push({ field: 'color', message: 'color must be a string' })
    } else {
      const value = normalizePublicInput(rawQuery.color)
      const color = normalizeIconColor(value)
      if (!color || hasUnsafePublicText(value)) {
        errors.push({ field: 'color', message: 'color must be #rgb, #rrggbb, rgb, or rrggbb hex' })
      } else {
        normalized.color = color
      }
    }
  }

  if (rawQuery.filetype !== undefined) {
    if (typeof rawQuery.filetype !== 'string') {
      errors.push({ field: 'filetype', message: 'filetype must be a string' })
    } else {
      const value = normalizePublicInput(rawQuery.filetype).toLowerCase()
      if (value !== 'svg' && value !== 'png') {
        errors.push({ field: 'filetype', message: 'filetype must be svg or png' })
      } else {
        normalized.filetype = value
      }
    }
  }

  const size = parseOptionalIntegerField(rawQuery.size, 'size', 20, 1200, errors)
  if (size !== undefined) normalized.size = size
  if (normalized.filetype === 'svg' && rawQuery.size !== undefined) {
    errors.push({ field: 'size', message: 'size is only supported for png downloads' })
    delete normalized.size
  }

  return { errors, params: normalized }
}

export async function searchIcons(
  rawParams: NormalizedIconSearchParams,
  iconFetch: IconFetch = defaultFetch,
  translationFetch: TranslationFetch = defaultFetch,
): Promise<IconSearchResult> {
  const translated = await translateQueryToEnglish(rawParams.q, translationFetch)
  const translatedQuery = normalizePublicInput(translated.translatedQuery)

  if (translatedQuery.length > MAX_QUERY_LENGTH) {
    throwValidationError('translatedQuery', `translatedQuery must be at most ${MAX_QUERY_LENGTH} characters`)
  }
  if (hasUnsafePublicText(translatedQuery)) {
    throwValidationError('translatedQuery', 'translatedQuery contains unsafe content')
  }

  const searchParams = { ...rawParams, q: translatedQuery }

  if (rawParams.provider === 'nounproject') {
    return searchNounProject(searchParams, translated, iconFetch)
  }

  const localResult = searchDefaultCatalog(searchParams, translated)

  if (!searchParams.q) return localResult

  try {
    const upstream = await searchIconify(searchParams, translated, iconFetch)
    if (upstream.items.length > 0) return upstream
    return localResult
  } catch {
    return localResult
  }
}

export function searchDefaultCatalog(rawParams: NormalizedIconSearchParams, translated?: TranslationResult): IconSearchResult {
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
    items: filtered.slice(offset, offset + limit).map((record) => applyIconifyColor(cloneIconRecord(record), rawParams.color)),
    total: filtered.length,
    limit,
    offset,
    ...translationFields(translated, rawParams.q),
  }
}

export async function downloadNounProjectIcon(
  params: NounProjectDownloadParams,
  iconFetch: IconFetch = defaultFetch,
): Promise<NounProjectDownloadResult> {
  const { apiKey, apiSecret } = getNounProjectCredentials()
  const url = new URL(nounProjectDownloadUrl(params.iconId))
  url.searchParams.set('color', params.color)
  url.searchParams.set('filetype', params.filetype)
  if (params.filetype === 'png' && params.size !== undefined) {
    url.searchParams.set('size', String(params.size))
  }

  const response = await iconFetch(url.toString(), {
    headers: {
      accept: 'application/json',
      authorization: createNounProjectOAuthHeader('GET', nounProjectDownloadUrl(params.iconId), url.searchParams, apiKey, apiSecret),
    },
  })

  if (!response.ok) throw new Error(`Noun Project download failed: ${response.status}`)

  const payload = await response.json()
  const base64EncodedFile = normalizeBase64(payload?.base64_encoded_file)
  const expectedContentType = params.filetype === 'svg' ? 'image/svg+xml' : 'image/png'
  const returnedContentType = safeText(payload?.content_type || '')

  if (!base64EncodedFile) {
    throwValidationError('base64EncodedFile', 'Noun Project download did not return a valid base64 file')
  }
  if (returnedContentType && !returnedContentType.toLowerCase().startsWith(expectedContentType)) {
    throwValidationError('contentType', `Noun Project download returned unexpected content type for ${params.filetype}`)
  }
  if (decodedBase64Size(base64EncodedFile) > MAX_NOUN_FILE_BYTES) {
    throwValidationError('base64EncodedFile', 'Downloaded icon file exceeds the maximum allowed size')
  }

  const fileBytes = Buffer.from(base64EncodedFile, 'base64')
  if (params.filetype === 'svg') {
    const svg = fileBytes.toString('utf8')
    if (!looksLikeSvg(svg)) {
      throwValidationError('svg', 'Downloaded SVG did not contain an SVG document')
    }
    if (hasUnsafeSvgContent(svg)) {
      throwValidationError('svg', 'Downloaded SVG contains unsafe active content')
    }
  } else if (!hasPngSignature(fileBytes)) {
    throwValidationError('png', 'Downloaded PNG did not contain a PNG image')
  }

  return {
    provider: 'nounproject',
    iconId: params.iconId,
    color: params.color,
    filetype: params.filetype,
    size: params.filetype === 'png' ? params.size : undefined,
    base64EncodedFile,
    contentType: expectedContentType,
  }
}

export function createNounProjectOAuthHeader(
  method: string,
  baseUrl: string,
  queryParams: URLSearchParams,
  apiKey: string,
  apiSecret: string,
  options: { nonce?: string, timestamp?: string } = {},
) {
  const nonce = options.nonce || randomBytes(16).toString('hex')
  if (nonce.length < 8) throw new Error('OAuth nonce must be at least 8 characters')

  const timestamp = options.timestamp || Math.floor(Date.now() / 1000).toString()
  const oauthParams: Array<[string, string]> = [
    ['oauth_consumer_key', apiKey],
    ['oauth_nonce', nonce],
    ['oauth_signature_method', 'HMAC-SHA1'],
    ['oauth_timestamp', timestamp],
    ['oauth_version', '1.0'],
  ]

  const normalizedParams = [...Array.from(queryParams.entries()), ...oauthParams]
    .map(([name, value]) => [oauthPercentEncode(name), oauthPercentEncode(value)])
    .sort(([leftName, leftValue], [rightName, rightValue]) => {
      const nameComparison = leftName.localeCompare(rightName)
      return nameComparison === 0 ? leftValue.localeCompare(rightValue) : nameComparison
    })
    .map(([name, value]) => `${name}=${value}`)
    .join('&')

  const baseString = [
    method.toUpperCase(),
    oauthPercentEncode(baseUrl),
    oauthPercentEncode(normalizedParams),
  ].join('&')
  const signingKey = `${oauthPercentEncode(apiSecret)}&`
  const signature = createHmac('sha1', signingKey).update(baseString).digest('base64')

  const headerParams: Array<[string, string]> = [
    ['oauth_consumer_key', apiKey],
    ['oauth_nonce', nonce],
    ['oauth_signature', signature],
    ['oauth_signature_method', 'HMAC-SHA1'],
    ['oauth_timestamp', timestamp],
    ['oauth_version', '1.0'],
  ]

  return `OAuth ${headerParams
    .map(([name, value]) => `${oauthPercentEncode(name)}="${oauthPercentEncode(value)}"`)
    .join(', ')}`
}

async function searchIconify(rawParams: NormalizedIconSearchParams, translated: TranslationResult, iconFetch: IconFetch): Promise<IconSearchResult> {
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
    .map((iconId) => iconifyIdToRecord(iconId, rawParams.color))
    .filter((record): record is IconRecord => Boolean(record))

  return {
    provider: 'iconify',
    source: 'iconify-api',
    items,
    total: Number.isInteger(payload?.total) && payload.total >= 0 ? payload.total : items.length,
    limit,
    offset,
    ...translationFields(translated, rawParams.q),
  }
}

async function searchNounProject(rawParams: NormalizedIconSearchParams, translated: TranslationResult, iconFetch: IconFetch): Promise<IconSearchResult> {
  const { apiKey, apiSecret } = getNounProjectCredentials()
  const limit = Math.min(rawParams.limit, MAX_UPSTREAM_RESULTS)
  const url = new URL(NOUN_PROJECT_SEARCH_URL)
  url.searchParams.set('query', rawParams.q)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('thumbnail_size', '200')
  url.searchParams.set('blacklist', '1')

  const response = await iconFetch(url.toString(), {
    headers: {
      accept: 'application/json',
      authorization: createNounProjectOAuthHeader('GET', NOUN_PROJECT_SEARCH_URL, url.searchParams, apiKey, apiSecret),
    },
  })

  if (!response.ok) throw new Error(`Noun Project search failed: ${response.status}`)

  const payload = await response.json()
  const rawIcons: unknown[] = Array.isArray(payload?.icons) ? payload.icons : Array.isArray(payload?.items) ? payload.items : []
  const items = rawIcons
    .map(nounProjectIconToRecord)
    .filter((record): record is IconRecord => Boolean(record))
    .slice(0, limit)

  return {
    provider: 'nounproject',
    source: 'nounproject-api',
    items,
    total: safeTotal(payload, items.length),
    limit,
    offset: rawParams.offset,
    ...translationFields(translated, rawParams.q),
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

function iconifyIdToRecord(iconId: string, color: string | null = null): IconRecord | null {
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
      type: 'svg-url',
      value: iconId,
      url: iconifySvgUrl(prefix, name, color),
    },
  }
}

function nounProjectIconToRecord(raw: any): IconRecord | null {
  const rawId = raw?.id ?? raw?.icon_id ?? raw?.iconId
  const id = normalizePublicInput(String(rawId || ''))
  if (!NOUN_ICON_ID_PATTERN.test(id)) return null

  const label = safeText(raw?.term || raw?.name || raw?.label || `Icon ${id}`)
  const thumbnailUrl = safeNounThumbnailUrl(raw?.thumbnail_url || raw?.thumbnailUrl || raw?.preview_url || raw?.previewUrl)
  if (!label || !thumbnailUrl) return null

  const tags = Array.isArray(raw?.tags)
    ? raw.tags.map((tag: any) => safeText(typeof tag === 'string' ? tag : tag?.slug || tag?.name || tag?.term)).filter(Boolean)
    : []
  const styles = Array.isArray(raw?.styles)
    ? raw.styles.map((style: any) => safeText(typeof style === 'string' ? style : style?.name || style?.slug)).filter(Boolean)
    : []

  const attribution = safeText(raw?.attribution || raw?.creator?.name || '') || null
  const license = safeText(raw?.license_description || raw?.license || raw?.license_type || '') || null

  return {
    id: `noun:${id}`,
    provider: 'nounproject',
    iconId: id,
    prefix: null,
    name: normalizeSearchText(label).replace(/\s+/g, '-'),
    label,
    category: 'nounproject',
    tags: uniqueTags(tags.length > 0 ? tags : [label]),
    styles: styles.length > 0 ? uniqueTags(styles) : undefined,
    license,
    attribution,
    preview: {
      type: 'thumbnail-url',
      value: id,
      url: thumbnailUrl,
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
      type: 'svg-url',
      value: iconId,
      url: iconifySvgUrl(prefix, name),
    },
  }
}

function cloneIconRecord(record: IconRecord): IconRecord {
  return {
    ...record,
    tags: [...record.tags],
    styles: record.styles ? [...record.styles] : undefined,
    preview: { ...record.preview },
  }
}

function applyIconifyColor(record: IconRecord, color: string | null) {
  if (record.provider !== 'iconify' || !record.prefix || !color) return record
  record.preview.url = iconifySvgUrl(record.prefix, record.name, color)
  return record
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

function hasUnsafeSvgContent(value: string) {
  return UNSAFE_SVG_CONTENT.test(value)
}

function parseIntegerField(rawValue: any, field: string, min: number, max: number, fallback: number, errors: Array<{ field: string, message: string }>) {
  if (rawValue === undefined) return fallback
  const parsed = parseInteger(rawValue)
  if (parsed === null) {
    errors.push({ field, message: `${field} must be an integer` })
    return fallback
  }
  if (parsed < min || parsed > max) {
    errors.push({ field, message: `${field} must be between ${min} and ${max}` })
    return fallback
  }
  return parsed
}

function parseOptionalIntegerField(rawValue: any, field: string, min: number, max: number, errors: Array<{ field: string, message: string }>) {
  if (rawValue === undefined) return undefined
  const parsed = parseInteger(rawValue)
  if (parsed === null) {
    errors.push({ field, message: `${field} must be an integer` })
    return undefined
  }
  if (parsed < min || parsed > max) {
    errors.push({ field, message: `${field} must be between ${min} and ${max}` })
    return undefined
  }
  return parsed
}

function parseInteger(rawValue: any) {
  if (typeof rawValue !== 'string' && typeof rawValue !== 'number') return null
  const value = String(rawValue).trim()
  if (!/^-?\d+$/.test(value)) return null
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) return null
  return parsed
}

function normalizeIconColor(value: string) {
  const normalized = value.trim().replace(/^#/, '').toLowerCase()
  if (!HEX_COLOR_PATTERN.test(normalized)) return null
  return normalized
}

function normalizeSearchText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function uniqueTags(tags: string[]) {
  return [...new Set(tags.map((tag) => normalizeSearchText(tag)).filter(Boolean).filter((tag) => !hasUnsafePublicText(tag)))]
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

function iconifySvgUrl(prefix: string, name: string, color: string | null = null) {
  const baseUrl = `https://api.iconify.design/${prefix}/${name}.svg`
  return color ? `${baseUrl}?color=%23${color}` : baseUrl
}

function safeNounThumbnailUrl(value: any) {
  const url = safeUrl(value)
  if (!url) return null
  const parsed = new URL(url)
  if (parsed.hostname !== 'static.thenounproject.com') return null
  return parsed.toString()
}

function safeUrl(value: any) {
  if (typeof value !== 'string') return null
  const normalized = normalizePublicInput(value)
  if (hasUnsafePublicText(normalized)) return null
  try {
    const url = new URL(normalized)
    if (url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

function safeText(value: any) {
  if (typeof value !== 'string') return ''
  const normalized = normalizePublicInput(value)
  if (!normalized || hasUnsafePublicText(normalized)) return ''
  return normalized
}

function safeTotal(payload: any, fallback: number) {
  const total = payload?.total
  return Number.isInteger(total) && total >= 0 ? total : fallback
}

function normalizeBase64(value: any) {
  if (typeof value !== 'string') return null
  const compact = value.replace(/\s+/g, '')
  if (!compact || compact.length % 4 === 1 || !BASE64_PATTERN.test(compact)) return null
  return compact
}

function decodedBase64Size(value: string) {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return Math.floor(value.length * 3 / 4) - padding
}

function looksLikeSvg(value: string) {
  return /^\s*(?:<\?xml\b[^>]*>\s*)?<svg[\s>]/i.test(value)
}

function hasPngSignature(value: Buffer) {
  return value.length >= 8
    && value[0] === 0x89
    && value[1] === 0x50
    && value[2] === 0x4e
    && value[3] === 0x47
    && value[4] === 0x0d
    && value[5] === 0x0a
    && value[6] === 0x1a
    && value[7] === 0x0a
}

function getNounProjectCredentials() {
  const apiKey = (process.env.NOUN_PROJECT_API_KEY || '').trim()
  const apiSecret = (process.env.NOUN_PROJECT_API_SECRET || '').trim()

  if (!apiKey || !apiSecret) {
    throw new IconProviderConfigurationError('Noun Project provider is not configured', [
      { field: 'NOUN_PROJECT_API_KEY', message: 'NOUN_PROJECT_API_KEY is required for provider=nounproject' },
      { field: 'NOUN_PROJECT_API_SECRET', message: 'NOUN_PROJECT_API_SECRET is required for provider=nounproject' },
    ])
  }

  return { apiKey, apiSecret }
}

function nounProjectDownloadUrl(iconId: string) {
  return `https://${NOUN_PROJECT_API_HOST}/v2/icon/${iconId}/download`
}

function oauthPercentEncode(value: string) {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
}

function translationFields(translated: TranslationResult | undefined, fallbackQuery: string) {
  if (translated) {
    return {
      originalQuery: translated.originalQuery,
      translatedQuery: translated.translatedQuery,
      translation: translated.translation,
    }
  }
  return {
    originalQuery: fallbackQuery || '',
    translatedQuery: fallbackQuery || '',
    translation: {
      provider: 'none' as const,
      target: 'en' as const,
      detectedSourceLanguage: null,
      usedFallback: false,
    },
  }
}

function throwValidationError(field: string, message: string): never {
  const error = new Error('Validation failed') as Error & { status: number, code: string, details: Array<{ field: string, message: string }> }
  error.status = 422
  error.code = 'VALIDATION_ERROR'
  error.details = [{ field, message }]
  throw error
}

export function listIconCategories() {
  return [...new Set(DEFAULT_ICONIFY_CATALOG.map((record) => record.category))].sort()
}

async function defaultFetch(url: string, init?: { method?: string, headers?: Record<string, string>, body?: string }) {
  if (typeof fetch !== 'function') throw new Error('Global fetch is not available')
  return fetch(url, init) as any
}
