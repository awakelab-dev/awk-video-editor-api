export type ValidationError = { field: string; message: string }

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/
const HTML_META_CHARS = /[<>"'`&]/
const EXECUTABLE_META_CHARS = /[<>"'`]/
const HTML_ENTITY_TAG_CHARS = /&(?:lt|gt|#0*60|#x0*3c|#0*62|#x0*3e);?/i
const URL_SCRIPT_PROTOCOL = /\b(?:javascript|data|vbscript):/i
const INLINE_HANDLER_ASSIGNMENT = /\bon[a-z]+\s*=/i
const SAFE_USERNAME = /^[A-Za-z0-9_.-]{3,40}$/

const URL_FIELD_NAMES = new Set([
  'url',
  'src',
  'href',
  'thumbnailurl',
  'previewurl',
  'mediaurl',
  'imageurl',
  'audiourl',
  'videourl',
])

const DISPLAY_FIELD_NAMES = new Set([
  'title',
  'name',
  'label',
  'text',
  'caption',
  'alt',
  'description',
  'projectname',
  'displayname',
  'html',
  'customhtml',
])

export function isSafeDisplayText(value: string): boolean {
  return (
    !CONTROL_CHARS.test(value) &&
    !HTML_META_CHARS.test(value) &&
    !HTML_ENTITY_TAG_CHARS.test(value) &&
    !URL_SCRIPT_PROTOCOL.test(value) &&
    !INLINE_HANDLER_ASSIGNMENT.test(value)
  )
}

export function isSafeUsername(value: string): boolean {
  return SAFE_USERNAME.test(value) && isSafeDisplayText(value)
}

export function isSafeUrlValue(value: string): boolean {
  return (
    value.trim().length > 0 &&
    value.length <= 2048 &&
    !CONTROL_CHARS.test(value) &&
    !EXECUTABLE_META_CHARS.test(value) &&
    !HTML_ENTITY_TAG_CHARS.test(value) &&
    !URL_SCRIPT_PROTOCOL.test(value) &&
    !INLINE_HANDLER_ASSIGNMENT.test(value)
  )
}

function containsExecutableContent(value: string): boolean {
  return (
    CONTROL_CHARS.test(value) ||
    EXECUTABLE_META_CHARS.test(value) ||
    HTML_ENTITY_TAG_CHARS.test(value) ||
    URL_SCRIPT_PROTOCOL.test(value) ||
    INLINE_HANDLER_ASSIGNMENT.test(value)
  )
}

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

function isUrlField(key: string): boolean {
  return URL_FIELD_NAMES.has(normalizeKey(key))
}

function isDisplayField(key: string): boolean {
  const normalized = normalizeKey(key)
  return DISPLAY_FIELD_NAMES.has(normalized) || normalized.endsWith('text') || normalized.endsWith('title') || normalized.endsWith('caption') || normalized.includes('html')
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateSafeDisplayText(value: unknown, field: string, label = field): ValidationError[] {
  if (typeof value !== 'string') return [{ field, message: `${label} must be a string` }]
  const trimmed = value.trim()
  if (!trimmed || !isSafeDisplayText(trimmed)) {
    return [{ field, message: `${label} contains unsafe characters or markup-like content` }]
  }
  return []
}

export function validatePersistedStringFields(value: unknown, path = 'body', key = 'body'): ValidationError[] {
  const errors: ValidationError[] = []
  if (Array.isArray(value)) {
    value.forEach((item, index) => errors.push(...validatePersistedStringFields(item, `${path}[${index}]`, key)))
    return errors
  }

  if (typeof value === 'string') {
    if (isUrlField(key)) {
      if (!isSafeUrlValue(value)) errors.push({ field: path, message: 'URL contains unsafe or unsupported content' })
      return errors
    }
    if (isDisplayField(key)) {
      if (!isSafeDisplayText(value.trim())) errors.push({ field: path, message: 'Text contains unsafe characters or markup-like content' })
      return errors
    }
    if (containsExecutableContent(value)) {
      errors.push({ field: path, message: 'String contains unsafe characters or executable content' })
    }
    return errors
  }

  if (!isObject(value)) return errors

  for (const [childKey, childValue] of Object.entries(value)) {
    errors.push(...validatePersistedStringFields(childValue, `${path}.${childKey}`, childKey))
  }

  return errors
}
