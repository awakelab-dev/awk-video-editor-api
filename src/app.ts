import cors from 'cors'
import express from 'express'
import { testRouter } from './routes/test.route'
import chatRoutes from './routes/chat'

const app = express()
export default app;

app.use(cors())
app.use(express.json())
app.use("/api", chatRoutes);

app.get('/health', (_request, response) => {
  response.status(200).json({
    ok: true,
    status: 'healthy',
  })
})

app.use('/api', testRouter)
