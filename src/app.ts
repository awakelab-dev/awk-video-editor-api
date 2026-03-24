import cors from 'cors'
import express from 'express'
import { testRouter } from './routes/test.route'
import chatRoutes from './routes/chat'
import imagesRoutes from "./routes/images"

export const app = express()

app.use(cors())
app.use(express.json())
app.use("/api", chatRoutes);
app.use("/api", imagesRoutes)

app.get('/health', (_request, response) => {
  response.status(200).json({
    ok: true,
    status: 'healthy',
  })
})

app.use('/api', testRouter)
