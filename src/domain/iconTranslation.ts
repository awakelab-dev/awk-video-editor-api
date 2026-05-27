export type TranslationProvider = 'google' | 'fallback-dictionary' | 'none'

export type TranslationResult = {
  originalQuery: string
  translatedQuery: string
  translation: {
    provider: TranslationProvider
    target: 'en'
    detectedSourceLanguage: string | null
    usedFallback: boolean
  }
}

export type TranslationFetch = (url: string, init?: {
  method?: string
  headers?: Record<string, string>
  body?: string
}) => Promise<{
  ok: boolean
  status: number
  json(): Promise<any>
}>

const GOOGLE_TRANSLATE_URL = 'https://translation.googleapis.com/language/translate/v2'

const PHRASE_DICTIONARY = new Map<string, string>([
  ['bicicleta', 'bicycle'],
  ['bici', 'bicycle'],
  ['cafe', 'coffee'],
  ['taza', 'cup'],
  ['taza de cafe', 'coffee cup'],
  ['lampara', 'lamp'],
  ['lampara amarilla', 'yellow lamp'],
  ['amarilla', 'yellow'],
  ['amarillo', 'yellow'],
  ['ladrillo', 'brick'],
  ['ladrillos', 'bricks'],
  ['construccion', 'construction'],
  ['ladrillo construccion', 'construction brick'],
  ['edificio', 'building'],
  ['edificios', 'buildings'],
  ['coche', 'car'],
  ['carro', 'car'],
  ['auto', 'car'],
  ['perro', 'dog'],
  ['gato', 'cat'],
  ['arbol', 'tree'],
  ['casa', 'house'],
  ['corazon', 'heart'],
  ['camara', 'camera'],
  ['musica', 'music'],
  ['microfono', 'microphone'],
  ['buscar', 'search'],
  ['subir', 'upload'],
  ['descargar', 'download'],
  ['borrar', 'delete'],
])

export async function translateQueryToEnglish(query: string, translateFetch: TranslationFetch = defaultFetch): Promise<TranslationResult> {
  const originalQuery = query.trim()

  if (!originalQuery) {
    return buildTranslationResult(originalQuery, originalQuery, 'none', null, false)
  }

  const provider = (process.env.TRANSLATION_PROVIDER || '').trim().toLowerCase()
  const googleKey = (process.env.GOOGLE_TRANSLATE_API_KEY || '').trim()

  if (provider === 'google' && googleKey) {
    try {
      const translated = await googleTranslate(originalQuery, googleKey, translateFetch)
      if (translated.translatedQuery) return translated
    } catch {
      // Fall through to the deterministic local dictionary. Translation failure should not break icon search.
    }
  }

  const fallback = fallbackTranslate(originalQuery)
  const changed = normalizeForLookup(fallback) !== normalizeForLookup(originalQuery)
  return buildTranslationResult(originalQuery, fallback, changed ? 'fallback-dictionary' : 'none', changed ? 'unknown' : null, changed)
}

function fallbackTranslate(query: string) {
  const normalized = normalizeForLookup(query)
  const phraseMatch = PHRASE_DICTIONARY.get(normalized)
  if (phraseMatch) return phraseMatch

  const translatedTokens = normalized
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => PHRASE_DICTIONARY.get(token) || token)

  return translatedTokens.join(' ').trim() || query.trim()
}

async function googleTranslate(query: string, apiKey: string, translateFetch: TranslationFetch): Promise<TranslationResult> {
  const url = new URL(GOOGLE_TRANSLATE_URL)
  url.searchParams.set('key', apiKey)

  const response = await translateFetch(url.toString(), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      q: query,
      target: 'en',
      format: 'text',
    }),
  })

  if (!response.ok) throw new Error(`Google Translate failed: ${response.status}`)

  const payload = await response.json()
  const translation = payload?.data?.translations?.[0]
  const translatedText = decodeHtmlEntities(String(translation?.translatedText || '')).trim()
  const detectedSourceLanguage = typeof translation?.detectedSourceLanguage === 'string' ? translation.detectedSourceLanguage : null

  if (!translatedText) throw new Error('Google Translate returned an empty translatedText')
  return buildTranslationResult(query, translatedText, 'google', detectedSourceLanguage, false)
}

function buildTranslationResult(
  originalQuery: string,
  translatedQuery: string,
  provider: TranslationProvider,
  detectedSourceLanguage: string | null,
  usedFallback: boolean,
): TranslationResult {
  return {
    originalQuery,
    translatedQuery,
    translation: {
      provider,
      target: 'en',
      detectedSourceLanguage,
      usedFallback,
    },
  }
}

function normalizeForLookup(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

async function defaultFetch(url: string, init?: { method?: string, headers?: Record<string, string>, body?: string }) {
  if (typeof fetch !== 'function') throw new Error('Global fetch is not available')
  return fetch(url, init) as any
}
