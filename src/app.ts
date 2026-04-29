import cors from 'cors'
import express from 'express'
import { testRouter } from './routes/test.route'
import editorStateRoutes from './routes/editorState'
import projectSnapshotRoutes from './routes/projectSnapshot'
import projectRoutes from './routes/projects'

const app = express()
export default app

app.use(cors())
app.use(express.json({ limit: '2mb' }))

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
