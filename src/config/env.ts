import { config } from 'dotenv'

config()

const port = Number(process.env.PORT ?? 4000)
const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000)
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX ?? 100)

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number.isNaN(port) ? 4000 : port,
  MONGODB_URI: process.env.MONGODB_URI ?? '',
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME ?? 'awk_video_editor',
  DEFAULT_PROJECT_ID: process.env.DEFAULT_PROJECT_ID ?? 'demo-project',
  RATE_LIMIT_WINDOW_MS: Number.isNaN(rateLimitWindowMs) ? 15 * 60 * 1000 : rateLimitWindowMs,
  RATE_LIMIT_MAX: Number.isNaN(rateLimitMax) ? 100 : rateLimitMax,
}
