export type EmojiRecord = {
  id: string
  emoji: string
  label: string
  category: string
  keywords: string[]
}

export type IconSearchParams = {
  q?: string
  category?: string
  limit?: number
  offset?: number
}

const MAX_QUERY_LENGTH = 64
const MAX_CATEGORY_LENGTH = 32
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/
const BIDI_CONTROLS = /[\u202A-\u202E\u2066-\u2069]/
const MARKUP_LIKE = /<|>|javascript:|data:|vbscript:|on[a-z]+\s*=|&(?:lt|gt|#0*60|#x0*3c|#0*62|#x0*3e);?/i
const PERCENT_ENCODED_MARKUP = /%(?:25)*(?:3c|3e|22|27|28|29|2f)/i
const CATEGORY_PATTERN = /^[a-z0-9-]+$/

const STOP_WORDS = new Set(['de', 'la', 'el', 'y', 'a', 'the', 'of', 'and'])

const EMOJI_CATALOG: EmojiRecord[] = [
  { id: 'coffee', emoji: '☕', label: 'Coffee', category: 'food-drink', keywords: ['coffee', 'cafe', 'café', 'cup', 'mug', 'taza', 'bebida', 'drink', 'breakfast'] },
  { id: 'teacup', emoji: '🍵', label: 'Tea Cup', category: 'food-drink', keywords: ['tea', 'te', 'té', 'cup', 'taza', 'green tea', 'matcha'] },
  { id: 'milk', emoji: '🥛', label: 'Glass of Milk', category: 'food-drink', keywords: ['milk', 'leche', 'glass', 'drink', 'bebida'] },
  { id: 'popcorn', emoji: '🍿', label: 'Popcorn', category: 'food-drink', keywords: ['popcorn', 'cine', 'movie', 'snack'] },
  { id: 'clapper-board', emoji: '🎬', label: 'Clapper Board', category: 'objects', keywords: ['video', 'movie', 'film', 'editor', 'editing', 'clapper', 'cine'] },
  { id: 'camera', emoji: '📷', label: 'Camera', category: 'objects', keywords: ['camera', 'foto', 'photo', 'imagen', 'snapshot'] },
  { id: 'studio-microphone', emoji: '🎙️', label: 'Studio Microphone', category: 'objects', keywords: ['microphone', 'mic', 'audio', 'sound', 'voice', 'voz'] },
  { id: 'musical-note', emoji: '🎵', label: 'Musical Note', category: 'symbols', keywords: ['music', 'musica', 'música', 'note', 'audio', 'sound'] },
  { id: 'sparkles', emoji: '✨', label: 'Sparkles', category: 'symbols', keywords: ['sparkles', 'shine', 'magic', 'highlight', 'destacar', 'brillo'] },
  { id: 'fire', emoji: '🔥', label: 'Fire', category: 'symbols', keywords: ['fire', 'fuego', 'hot', 'trending'] },
  { id: 'thumbs-up', emoji: '👍', label: 'Thumbs Up', category: 'people', keywords: ['thumbs up', 'like', 'ok', 'approve', 'bien', 'vale'] },
  { id: 'warning', emoji: '⚠️', label: 'Warning', category: 'symbols', keywords: ['warning', 'alert', 'danger', 'peligro', 'alerta'] },
  { id: 'check-mark', emoji: '✅', label: 'Check Mark', category: 'symbols', keywords: ['check', 'ok', 'done', 'success', 'hecho', 'listo'] },
  { id: 'cross-mark', emoji: '❌', label: 'Cross Mark', category: 'symbols', keywords: ['cross', 'cancel', 'error', 'wrong', 'cancelar'] },
  { id: 'rocket', emoji: '🚀', label: 'Rocket', category: 'travel', keywords: ['rocket', 'launch', 'ship', 'boost', 'cohete'] },
  { id: 'light-bulb', emoji: '💡', label: 'Light Bulb', category: 'objects', keywords: ['idea', 'light', 'bulb', 'brainstorm', 'idea brillante'] },
  { id: 'memo', emoji: '📝', label: 'Memo', category: 'objects', keywords: ['memo', 'note', 'text', 'write', 'texto', 'escribir'] },
  { id: 'speech-balloon', emoji: '💬', label: 'Speech Balloon', category: 'symbols', keywords: ['chat', 'comment', 'speech', 'talk', 'comentario'] },
  { id: 'smile', emoji: '😊', label: 'Smile', category: 'faces', keywords: ['smile', 'happy', 'face', 'feliz', 'cara'] },
  { id: 'heart', emoji: '❤️', label: 'Heart', category: 'symbols', keywords: ['heart', 'love', 'like', 'corazon', 'corazón'] },
]

export function validateIconSearchParams(raw: any) {
  const errors: Array<{ field: string, message: string }> = []
  const normalized: Required<IconSearchParams> = {
    q: '',
    category: '',
    limit: DEFAULT_LIMIT,
    offset: 0,
  }

  if (raw.q !== undefined) {
    if (typeof raw.q !== 'string') {
      errors.push({ field: 'q', message: 'q must be a string' })
    } else {
      const value = normalizePublicInput(raw.q)
      if (value.length > MAX_QUERY_LENGTH) errors.push({ field: 'q', message: `q must be at most ${MAX_QUERY_LENGTH} characters` })
      if (CONTROL_CHARS.test(value)) errors.push({ field: 'q', message: 'q contains control characters' })
      if (BIDI_CONTROLS.test(value)) errors.push({ field: 'q', message: 'q contains unsafe unicode control characters' })
      if (PERCENT_ENCODED_MARKUP.test(value)) errors.push({ field: 'q', message: 'q contains unsafe encoded markup-like content' })
      if (MARKUP_LIKE.test(value)) errors.push({ field: 'q', message: 'q contains unsafe markup-like content' })
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
        if (CONTROL_CHARS.test(value)) errors.push({ field: 'category', message: 'category contains control characters' })
        if (BIDI_CONTROLS.test(value)) errors.push({ field: 'category', message: 'category contains unsafe unicode control characters' })
        if (!CATEGORY_PATTERN.test(value)) errors.push({ field: 'category', message: 'category must contain only lowercase letters, digits, and hyphens' })
        normalized.category = value
      }
    }
  }

  normalized.limit = parseIntegerField(raw.limit, 'limit', 0, MAX_LIMIT, DEFAULT_LIMIT, errors)
  normalized.offset = parseIntegerField(raw.offset, 'offset', 0, Number.MAX_SAFE_INTEGER, 0, errors)

  return { errors, params: normalized }
}

function normalizePublicInput(value: string) {
  return value.normalize('NFKC').trim()
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

export function searchIcons(rawParams: IconSearchParams) {
  const q = normalizeSearchText(rawParams.q ?? '')
  const category = normalizeSearchText(rawParams.category ?? '')
  const limit = rawParams.limit ?? DEFAULT_LIMIT
  const offset = rawParams.offset ?? 0
  const tokens = q ? q.split(/\s+/).filter((token) => token && !STOP_WORDS.has(token)) : []

  const filtered = EMOJI_CATALOG.filter((record) => {
    if (category && record.category !== category) return false
    if (tokens.length === 0) return true
    const haystack = normalizeSearchText([record.id, record.label, record.category, ...record.keywords].join(' '))
    return tokens.every((token) => haystack.includes(token))
  })

  const paged = filtered.slice(offset, offset + limit)
  return {
    items: paged.map((record) => ({ ...record, keywords: [...record.keywords] })),
    total: filtered.length,
    limit,
    offset,
  }
}

export function listIconCategories() {
  return [...new Set(EMOJI_CATALOG.map((record) => record.category))].sort()
}
