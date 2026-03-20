import { Router } from 'express'
import { isMongoConnected, pingMongo } from '../config/mongodb'

export const testRouter = Router()

testRouter.get('/test', async (_request, response) => {
  const databaseReachable = await pingMongo()

  response.status(200).json({
    ok: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
    database: {
      provider: 'mongodb',
      connected: isMongoConnected(),
      reachable: databaseReachable,
    },
  })
})
