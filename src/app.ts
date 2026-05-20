import cors from 'cors'
import express, { ErrorRequestHandler } from 'express'
import { testRouter } from './routes/test.route'
import chatRoutes from './routes/chat'
import editorStateRoutes from './routes/editorState'
import elementRoutes from './routes/elementRoutes'
import imagesRoutes from './routes/images'
import iconsRouter from './routes/icons'
import projectRoutes from './routes/projects'
import projectSnapshotRoutes from './routes/projectSnapshot'

const app = express()
export default app

app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.use('/api', chatRoutes)
app.use('/api', imagesRoutes)
app.use('/api/v1', elementRoutes)
app.use('/api/v1/icons', iconsRouter)
app.use('/api/v1/projects', projectRoutes)
app.use('/api/v1/projects/:projectId/editor-state', editorStateRoutes)
app.use('/api/v1/projects/:projectId/snapshot', projectSnapshotRoutes)

app.get('/health', (_request, response) => {
  response.status(200).json({
    ok: true,
    status: 'healthy',
  })
})

app.use('/api', testRouter)

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = typeof err.status === 'number' ? err.status : 500

  res.status(status).json({
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'Internal server error',
      details: err.details || [],
    },
    meta: {
      requestId: 'dev-id',
    },
  })
}

app.use(errorHandler)