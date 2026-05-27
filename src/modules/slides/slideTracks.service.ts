import OpenAI from 'openai'
import { AiSlideOutput, CreateSlideTracksInput, aiSlideSchema } from './slideTracks.schemas'

const SLIDE_DURATION_SECONDS = 12
const RESOLUTION = { w: 1024, h: 576 }
const TEXT_TRACK_ID = 'track_text'
const AUDIO_TRACK_ID = 'track_audio'
const MEDIA_TRACK_ID = 'track_media'

const SLOT_LIMITS = {
  title: { fontSize: 46, maxChars: 58 },
  subtitle: { fontSize: 24, maxChars: 140 },
  body: { fontSize: 18, maxChars: 320 },
  bullet: { fontSize: 14, maxChars: 72 },
  takeaway: { fontSize: 20, maxChars: 140 },
  sourceNote: { fontSize: 13, maxChars: 90 }
} as const

type SlideCopy = AiSlideOutput['slides'][number]

type TextElement = {
  id: string
  type: 'text'
  name: string
  startTime: number
  duration: number
  opacity: number
  effects: unknown[]
  x: number
  y: number
  width: number
  height: number
  rotation: number
  text: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  textColor: string
  backgroundColor: string
  lineHeight: number
  letterSpacing: number
  textAlign: 'left' | 'center' | 'right' | 'justify'
}

type ShapeElement = {
  id: string
  type: 'shape'
  name: string
  startTime: number
  duration: number
  opacity: number
  effects: unknown[]
  x: number
  y: number
  width: number
  height: number
  rotation: number
  shapeType: 'rectangle'
  fillColor: string
  strokeColor: string
  strokeWidth: number
  cornerRadius: number
}

type Track = {
  id: string
  name: string
  kind: 'text' | 'audio' | 'media'
  elements: Array<TextElement | ShapeElement>
}

export class SlideGenerationError extends Error {}

function fitToMaxChars(raw: string, maxChars: number): string {
  const normalized = raw.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxChars) return normalized

  const candidate = normalized.slice(0, maxChars + 1)
  const cutAt = candidate.lastIndexOf(' ')
  if (cutAt <= 0) return normalized.slice(0, maxChars).trim()
  return candidate.slice(0, cutAt).trim()
}

function wrapText(raw: string, lineMaxChars: number, maxLines: number): string {
  const normalized = raw.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''

  const words = normalized.split(' ')
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word

    if (candidate.length <= lineMaxChars) {
      currentLine = candidate
      continue
    }

    if (currentLine) {
      lines.push(currentLine)
      currentLine = ''
      if (lines.length >= maxLines) break
    }

    if (word.length > lineMaxChars) {
      lines.push(word.slice(0, lineMaxChars))
      if (lines.length >= maxLines) break
    } else {
      currentLine = word
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine)
  }

  return lines.slice(0, maxLines).join('\n')
}

function buildTextElement(
  slideIndex: number,
  key: string,
  partial: Omit<TextElement, 'id' | 'startTime' | 'duration' | 'type' | 'opacity' | 'effects' | 'rotation'>
): TextElement {
  return {
    id: `sql-ai-s${slideIndex + 1}-${key}`,
    type: 'text',
    startTime: slideIndex * SLIDE_DURATION_SECONDS,
    duration: SLIDE_DURATION_SECONDS,
    opacity: 1,
    effects: [],
    rotation: 0,
    ...partial
  }
}

function buildShapeElement(
  slideIndex: number,
  key: string,
  partial: Omit<ShapeElement, 'id' | 'startTime' | 'duration' | 'type' | 'opacity' | 'effects' | 'rotation' | 'shapeType'>
): ShapeElement {
  return {
    id: `sql-ai-s${slideIndex + 1}-${key}`,
    type: 'shape',
    startTime: slideIndex * SLIDE_DURATION_SECONDS,
    duration: SLIDE_DURATION_SECONDS,
    opacity: 1,
    effects: [],
    rotation: 0,
    shapeType: 'rectangle',
    ...partial
  }
}

function buildMediaBackground(slideIndex: number): ShapeElement {
  return {
    id: `sql-ai-bg-s${slideIndex + 1}`,
    type: 'shape',
    name: `Fondo slide ${slideIndex + 1}`,
    startTime: slideIndex * SLIDE_DURATION_SECONDS,
    duration: SLIDE_DURATION_SECONDS,
    opacity: 1,
    effects: [],
    x: 0,
    y: 0,
    width: RESOLUTION.w,
    height: RESOLUTION.h,
    rotation: 0,
    shapeType: 'rectangle',
    fillColor: slideIndex % 2 === 0 ? '#fbfffe' : '#f4fcfb',
    strokeColor: '#b7f3ea',
    strokeWidth: 1,
    cornerRadius: 14
  }
}

function normalizeSlideCopy(slide: SlideCopy): SlideCopy {
  return {
    title: fitToMaxChars(slide.title, SLOT_LIMITS.title.maxChars),
    subtitle: fitToMaxChars(slide.subtitle, SLOT_LIMITS.subtitle.maxChars),
    body: fitToMaxChars(slide.body, SLOT_LIMITS.body.maxChars),
    bullets: slide.bullets.map((bullet) => fitToMaxChars(bullet, SLOT_LIMITS.bullet.maxChars)).slice(0, 3),
    takeaway: fitToMaxChars(slide.takeaway, SLOT_LIMITS.takeaway.maxChars),
    sourceNote: fitToMaxChars(slide.sourceNote, SLOT_LIMITS.sourceNote.maxChars)
  }
}

function buildTracks(slides: SlideCopy[]): Track[] {
  const textElements: TextElement[] = []
  const mediaElements: ShapeElement[] = []

  slides.forEach((rawSlide, slideIndex) => {
    const slide = normalizeSlideCopy(rawSlide)
    const sectionLabel = `SECCION ${String(slideIndex + 1).padStart(2, '0')}`
    const wrappedTitle = wrapText(slide.title, 28, 2)
    const wrappedSubtitle = wrapText(slide.subtitle, 54, 3)
    const wrappedBody = wrapText(slide.body, 58, 7)
    const wrappedTakeaway = wrapText(slide.takeaway, 36, 4)
    const wrappedSourceNote = wrapText(slide.sourceNote, 40, 5)
    const bulletLines = slide.bullets
      .map((item) => `• ${wrapText(item, 48, 2)}`)
      .join('\n')

    textElements.push(
      buildTextElement(slideIndex, 'title', {
        name: `Titulo slide ${slideIndex + 1}`,
        text: wrappedTitle,
        x: 54,
        y: 58,
        width: 820,
        height: 58,
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: SLOT_LIMITS.title.fontSize,
        fontWeight: 800,
        textColor: '#0f766e',
        backgroundColor: 'transparent',
        lineHeight: 1.2,
        letterSpacing: 0,
        textAlign: 'left'
      }),
      buildTextElement(slideIndex, 'subtitle', {
        name: `Subtitulo slide ${slideIndex + 1}`,
        text: wrappedSubtitle,
        x: 54,
        y: 130,
        width: 820,
        height: 82,
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: SLOT_LIMITS.subtitle.fontSize,
        fontWeight: 500,
        textColor: '#475569',
        backgroundColor: 'transparent',
        lineHeight: 1.3,
        letterSpacing: 0,
        textAlign: 'left'
      }),
      buildTextElement(slideIndex, 'section', {
        name: `Etiqueta slide ${slideIndex + 1}`,
        text: sectionLabel,
        x: 54,
        y: 224,
        width: 250,
        height: 24,
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: SLOT_LIMITS.bullet.fontSize,
        fontWeight: 700,
        textColor: '#0f766e',
        backgroundColor: 'transparent',
        lineHeight: 1.2,
        letterSpacing: 1,
        textAlign: 'left'
      }),
      buildTextElement(slideIndex, 'body', {
        name: `Desarrollo slide ${slideIndex + 1}`,
        text: wrappedBody,
        x: 54,
        y: 258,
        width: 540,
        height: 185,
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: SLOT_LIMITS.body.fontSize,
        fontWeight: 400,
        textColor: '#0f172a',
        backgroundColor: 'transparent',
        lineHeight: 1.45,
        letterSpacing: 0,
        textAlign: 'left'
      }),
      buildTextElement(slideIndex, 'bullets', {
        name: `Puntos clave slide ${slideIndex + 1}`,
        text: bulletLines,
        x: 54,
        y: 456,
        width: 540,
        height: 95,
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: SLOT_LIMITS.bullet.fontSize,
        fontWeight: 600,
        textColor: '#0f766e',
        backgroundColor: 'transparent',
        lineHeight: 1.5,
        letterSpacing: 0,
        textAlign: 'left'
      }),
      buildTextElement(slideIndex, 'takeaway', {
        name: `Takeaway slide ${slideIndex + 1}`,
        text: wrappedTakeaway,
        x: 620,
        y: 258,
        width: 350,
        height: 120,
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: SLOT_LIMITS.takeaway.fontSize,
        fontWeight: 700,
        textColor: '#0f766e',
        backgroundColor: 'transparent',
        lineHeight: 1.35,
        letterSpacing: 0,
        textAlign: 'left'
      }),
      buildTextElement(slideIndex, 'source-note', {
        name: `Nota fuente slide ${slideIndex + 1}`,
        text: wrappedSourceNote,
        x: 620,
        y: 398,
        width: 350,
        height: 120,
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: SLOT_LIMITS.sourceNote.fontSize,
        fontWeight: 500,
        textColor: '#334155',
        backgroundColor: 'transparent',
        lineHeight: 1.45,
        letterSpacing: 0,
        textAlign: 'left'
      })
    )

    mediaElements.push(
      buildMediaBackground(slideIndex),
      buildShapeElement(slideIndex, 'section-card', {
        name: `Card seccion slide ${slideIndex + 1}`,
        x: 44,
        y: 218,
        width: 226,
        height: 34,
        fillColor: '#ecfdfa',
        strokeColor: '#a7f3d0',
        strokeWidth: 1,
        cornerRadius: 8
      }),
      buildShapeElement(slideIndex, 'bullet-card', {
        name: `Card bullets slide ${slideIndex + 1}`,
        x: 44,
        y: 446,
        width: 560,
        height: 112,
        fillColor: 'rgba(255, 255, 255, 0.86)',
        strokeColor: '#b7f3ea',
        strokeWidth: 1,
        cornerRadius: 12
      }),
      buildShapeElement(slideIndex, 'takeaway-card', {
        name: `Card takeaway slide ${slideIndex + 1}`,
        x: 610,
        y: 246,
        width: 366,
        height: 142,
        fillColor: '#ecfdfa',
        strokeColor: '#99f6e4',
        strokeWidth: 1,
        cornerRadius: 12
      }),
      buildShapeElement(slideIndex, 'source-card', {
        name: `Card fuente slide ${slideIndex + 1}`,
        x: 610,
        y: 388,
        width: 366,
        height: 142,
        fillColor: '#ffffff',
        strokeColor: '#cbd5e1',
        strokeWidth: 1,
        cornerRadius: 12
      })
    )
  })

  return [
    {
      id: TEXT_TRACK_ID,
      name: 'Text Track',
      kind: 'text',
      elements: textElements
    },
    {
      id: AUDIO_TRACK_ID,
      name: 'Audio Track',
      kind: 'audio',
      elements: []
    },
    {
      id: MEDIA_TRACK_ID,
      name: 'Media Track',
      kind: 'media',
      elements: mediaElements
    }
  ]
}

function buildPrompt(input: CreateSlideTracksInput, targetSlides: number): string {
  const languageLabel = input.language === 'en' ? 'English' : 'Spanish'
  return [
    `You are a presentation summarizer. Output language: ${languageLabel}.`,
    `Create exactly ${targetSlides} slides from the source text.`,
    'Each slide must be concise and fit strict text limits inspired by the provided visual template.',
    'Return only valid JSON with shape: {"slides":[{"title":"","subtitle":"","body":"","bullets":["","",""],"takeaway":"","sourceNote":""}]}',
    `Limits per field: title<=${SLOT_LIMITS.title.maxChars}, subtitle<=${SLOT_LIMITS.subtitle.maxChars}, body<=${SLOT_LIMITS.body.maxChars}, each bullet<=${SLOT_LIMITS.bullet.maxChars}, takeaway<=${SLOT_LIMITS.takeaway.maxChars}, sourceNote<=${SLOT_LIMITS.sourceNote.maxChars}.`,
    'Do not use markdown. Do not add extra keys.'
  ].join('\n')
}

function targetSlideCount(text: string, maxSlides: number): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  const guessed = Math.ceil(words / 170)
  return Math.max(3, Math.min(maxSlides, guessed))
}

function ensureOpenAiKey(): string {
  const apiKey = (process.env.OPENAI_API_KEY ?? '').trim()
  if (!apiKey) {
    throw new SlideGenerationError('OPENAI_API_KEY is required')
  }
  return apiKey
}

export async function summarizeTextToSlides(input: CreateSlideTracksInput): Promise<SlideCopy[]> {
  const openai = new OpenAI({
    apiKey: ensureOpenAiKey()
  })
  const slidesToGenerate = targetSlideCount(input.text, input.maxSlides)

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildPrompt(input, slidesToGenerate) },
      { role: 'user', content: input.text.slice(0, 30000) }
    ]
  })

  const rawContent = completion.choices?.[0]?.message?.content
  if (!rawContent) {
    throw new SlideGenerationError('OpenAI returned an empty response')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawContent)
  } catch (_error) {
    throw new SlideGenerationError('OpenAI response was not valid JSON')
  }

  const validated = aiSlideSchema.safeParse(parsed)
  if (!validated.success) {
    throw new SlideGenerationError('OpenAI response does not match the expected slide schema')
  }

  return validated.data.slides.slice(0, input.maxSlides)
}

export async function generateSlideTracks(
  input: CreateSlideTracksInput,
  summarize: (payload: CreateSlideTracksInput) => Promise<SlideCopy[]> = summarizeTextToSlides
): Promise<{
  tracks: Track[]
  slides: number
  durationSeconds: number
  resolution: { w: number; h: number }
}> {
  const slides = await summarize(input)
  const tracks = buildTracks(slides)

  return {
    tracks,
    slides: slides.length,
    durationSeconds: slides.length * SLIDE_DURATION_SECONDS,
    resolution: RESOLUTION
  }
}
