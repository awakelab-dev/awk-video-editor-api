import { Router, Request, Response } from 'express'
import multer from 'multer'
import OpenAI, { toFile } from 'openai'

const router = Router()
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const WHISPER_MAX_FILE_BYTES = 25 * 1024 * 1024
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: WHISPER_MAX_FILE_BYTES,
  },
})

class HttpStatusError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message)
  }
}

function isValidAudioUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false

  const normalized = value.trim()
  if (!normalized) return false

  try {
    const parsed = new URL(normalized)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function inferFileExtension(contentType: string | null): string {
  const normalized = (contentType ?? '').toLowerCase()

  if (normalized.includes('mpeg')) return 'mp3'
  if (normalized.includes('wav')) return 'wav'
  if (normalized.includes('ogg')) return 'ogg'
  if (normalized.includes('webm')) return 'webm'
  if (normalized.includes('mp4')) return 'mp4'
  if (normalized.includes('x-m4a') || normalized.includes('m4a')) return 'm4a'
  if (normalized.includes('flac')) return 'flac'

  return 'mp3'
}

function resolveUrlFileName(audioUrl: string, contentType: string | null): string {
  try {
    const url = new URL(audioUrl)
    const rawBaseName = url.pathname.split('/').pop()?.trim() ?? ''
    if (rawBaseName) {
      return decodeURIComponent(rawBaseName)
    }
  } catch {
    // Ignore and fallback to inferred extension below.
  }

  return `audio.${inferFileExtension(contentType)}`
}

function resolveUploadFileName(file: Express.Multer.File): string {
  const fileName = file.originalname?.trim()
  if (fileName) return fileName
  return `audio.${inferFileExtension(file.mimetype)}`
}

function getAudioUrlValue(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const audioUrl = (body as { audioUrl?: unknown }).audioUrl
  if (typeof audioUrl !== 'string') return null
  const normalized = audioUrl.trim()
  return normalized.length > 0 ? normalized : null
}

async function runAudioUpload(req: Request, res: Response): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    upload.single('audio')(req, res, (error: unknown) => {
      if (!error) {
        resolve()
        return
      }

      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        reject(new HttpStatusError('El audio supera el limite de 25MB de Whisper.', 413))
        return
      }

      reject(new HttpStatusError('No se pudo procesar el archivo de audio.', 400))
    })
  })
}

async function downloadAudioFromUrl(audioUrl: string): Promise<{ bytes: Buffer; contentType: string | null; fileName: string }> {
  let response: globalThis.Response
  try {
    response = await fetch(audioUrl)
  } catch {
    throw new HttpStatusError('No se pudo descargar el audio desde la URL indicada.', 400)
  }

  if (!response.ok) {
    throw new HttpStatusError(`No se pudo descargar el audio (${response.status})`, 400)
  }

  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > WHISPER_MAX_FILE_BYTES) {
    throw new HttpStatusError('El audio supera el limite de 25MB de Whisper.', 413)
  }

  const arrayBuffer = await response.arrayBuffer()
  const bytes = Buffer.from(arrayBuffer)
  if (bytes.length > WHISPER_MAX_FILE_BYTES) {
    throw new HttpStatusError('El audio supera el limite de 25MB de Whisper.', 413)
  }

  const contentType = response.headers.get('content-type')

  return {
    bytes,
    contentType,
    fileName: resolveUrlFileName(audioUrl, contentType),
  }
}

router.post('/subtitles', async (req: Request, res: Response) => {
  try {
    await runAudioUpload(req, res)

    const audioUrl = getAudioUrlValue(req.body)
    const audioFile = req.file
    const hasAudioUrl = audioUrl !== null
    const hasAudioFile = Boolean(audioFile)

    if (hasAudioUrl && hasAudioFile) {
      return res.status(400).json({ message: 'Envia solo una fuente de audio: audioUrl o archivo en "audio".' })
    }

    if (!hasAudioUrl && !hasAudioFile) {
      return res.status(400).json({ message: 'Debes enviar audioUrl o un archivo de audio en el campo "audio".' })
    }

    let audioBytes: Buffer
    let contentType: string | null
    let fileName: string

    if (hasAudioFile && audioFile) {
      audioBytes = audioFile.buffer
      contentType = audioFile.mimetype || null
      fileName = resolveUploadFileName(audioFile)
    } else {
      if (!isValidAudioUrl(audioUrl)) {
        return res.status(400).json({ message: 'audioUrl debe ser una URL valida con protocolo http o https.' })
      }

      const downloaded = await downloadAudioFromUrl(audioUrl)
      audioBytes = downloaded.bytes
      contentType = downloaded.contentType
      fileName = downloaded.fileName
    }

    if (audioBytes.length === 0) {
      return res.status(400).json({ message: 'El archivo de audio esta vacio.' })
    }

    if (audioBytes.length > WHISPER_MAX_FILE_BYTES) {
      return res.status(413).json({ message: 'El audio supera el limite de 25MB de Whisper.' })
    }

    const transcription = await openai.audio.transcriptions.create({
      file: await toFile(audioBytes, fileName, contentType ? { type: contentType } : undefined),
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    })

    const subtitles = (transcription.segments ?? [])
      .map((segment) => ({
        start: segment.start,
        end: segment.end,
        text: segment.text.trim(),
      }))
      .filter((segment) => segment.text.length > 0)

    if (subtitles.length === 0 && transcription.text.trim()) {
      subtitles.push({
        start: 0,
        end: transcription.duration,
        text: transcription.text.trim(),
      })
    }

    return res.json({
      language: transcription.language,
      duration: transcription.duration,
      text: transcription.text,
      subtitles,
    })
  } catch (error) {
    if (error instanceof HttpStatusError) {
      return res.status(error.statusCode).json({ message: error.message })
    }

    return res.status(500).json({
      message: 'Error generando subtitulos con Whisper.',
    })
  }
})

export default router
