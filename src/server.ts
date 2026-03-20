import { app } from './app'
import { closeMongoConnection, connectMongo } from './config/mongodb'
import { env } from './config/env'

async function startServer(): Promise<void> {
  if (env.MONGODB_URI) {
    try {
      await connectMongo()
      console.log('MongoDB connection established.')
    } catch (error) {
      console.warn('MongoDB connection failed. API will continue without database connection.')
      console.warn(error)
    }
  } else {
    console.warn('MONGODB_URI not configured. API started without database connection.')
  }

  const server = app.listen(env.PORT, () => {
    console.log(`API listening on http://localhost:${env.PORT}`)
  })

  const gracefulShutdown = async () => {
    await closeMongoConnection()
    server.close(() => {
      process.exit(0)
    })
  }

  process.on('SIGINT', gracefulShutdown)
  process.on('SIGTERM', gracefulShutdown)
}

void startServer()
