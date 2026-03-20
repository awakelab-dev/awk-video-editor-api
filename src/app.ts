import cors from 'cors'
import express from 'express'
import { testRouter } from './routes/test.route'

export const app = express()

app.use(cors())
app.use(express.json())

app.get('/health', (_request, response) => {
  response.status(200).json({
    ok: true,
    status: 'healthy',
  })
})

app.use('/api', testRouter)
