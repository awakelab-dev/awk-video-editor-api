import app from './app'
import { closeMongoConnection, connectMongo } from './config/mongodb'
import { env } from './config/env'

async function startServer(): Promise<void> {
  if (!env.MONGODB_URI) {
    if (env.IS_PRODUCTION) {
      throw new Error('MONGODB_URI is required in production')
    }
    console.warn('MONGODB_URI not configured. API started without database connection.')
  } else {
    try {
      await connectMongo()
      console.log('MongoDB connection established.')
    } catch (error: any) {
      if (env.IS_PRODUCTION) {
        throw new Error('MongoDB connection failed in production')
      }
      console.warn('MongoDB connection failed. API will continue without database connection.')
      console.warn(error?.message)
    }
  }

  const PORT = env.PORT || process.env.PORT || 3000
  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
  })

  const gracefulShutdown = async () => {
    await closeMongoConnection()
    server.close(() => process.exit(0))
  }

  process.on('SIGINT', gracefulShutdown)
  process.on('SIGTERM', gracefulShutdown)
}

void startServer()
