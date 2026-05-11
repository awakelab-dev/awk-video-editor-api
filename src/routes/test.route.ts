import { Router } from 'express'

export const testRouter = Router()

testRouter.get('/test', async (_request, response) => {
  response.status(200).json({
    success: true,
    message: 'API is running',
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
    },
  })
})
