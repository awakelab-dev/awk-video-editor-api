import { config } from 'dotenv'

config()

const port = Number(process.env.PORT ?? 4000)
const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000)
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX ?? 120)

export const env = {
  PORT: Number.isNaN(port) ? 4000 : port,
  MONGODB_URI: process.env.MONGODB_URI ?? '',
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME ?? 'awk-video',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
  PEXELS_API_KEY: process.env.PEXELS_API_KEY ?? '',
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  RATE_LIMIT_WINDOW_MS: Number.isNaN(rateLimitWindowMs) ? 60_000 : rateLimitWindowMs,
  RATE_LIMIT_MAX: Number.isNaN(rateLimitMax) ? 120 : rateLimitMax,
  DEFAULT_PROJECT_ID: process.env.DEFAULT_PROJECT_ID ?? 'demo-project',
}
