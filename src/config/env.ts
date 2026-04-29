import { config } from 'dotenv'

config()

const port = Number(process.env.PORT ?? 4000)

export const env = {
  PORT: Number.isNaN(port) ? 4000 : port,
  MONGODB_URI: process.env.MONGODB_URI ?? '',
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME ?? 'awk_video_editor',
}
