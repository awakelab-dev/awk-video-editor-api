import cors from 'cors'
import express from 'express'
import { testRouter } from './routes/test.route'
<<<<<<< HEAD
=======
import chatRoutes from './routes/chat'
import imagesRoutes from "./routes/images"
>>>>>>> 083ec0c (feat: save current state before creating api/images branch)

export const app = express()

app.use(cors())
app.use(express.json())
<<<<<<< HEAD
=======
app.use("/api", chatRoutes);
app.use("/api", imagesRoutes)
>>>>>>> 083ec0c (feat: save current state before creating api/images branch)

app.get('/health', (_request, response) => {
  response.status(200).json({
    ok: true,
    status: 'healthy',
  })
})

app.use('/api', testRouter)
