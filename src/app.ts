import cors from 'cors'
import express from 'express'
import { testRouter } from './routes/test.route'
import editorStateRoutes from './routes/editorState'
import projectSnapshotRoutes from './routes/projectSnapshot'
import projectRoutes from './routes/projects'
import authRoutes from './routes/auth'
import usersRoutes from './routes/users'
import { authRateLimit, globalRateLimit, securityHeaders } from './config/security'
import { requestIdMiddleware } from './middleware/requestContext'
import { jsonErrorHandler } from './middleware/errorHandling'
import { env } from './config/env'

const app = express()
export default app

app.disable('x-powered-by')

const allowedOrigins = envOrigins()

app.use(requestIdMiddleware)
app.use(securityHeaders)
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (!origin) return next()
  if (allowedOrigins.includes(origin)) return next()
  return res.status(403).json({ success: false, message: 'Origin not allowed by CORS' })
})
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true)
    }
    return callback(null, false)
  }
}))
app.use(globalRateLimit)
app.use(express.json({ limit: '1mb' }))

app.use('/api/v1/auth', authRateLimit, authRoutes)
app.use('/api/v1/users', usersRoutes)
app.use('/api/v1/projects', projectRoutes)
app.use('/api/v1/projects/:projectId/editor-state', editorStateRoutes)
app.use('/api/v1/projects/:projectId/snapshot', projectSnapshotRoutes)

app.get('/health', (_request, response) => {
  response.status(200).json({
    success: true,
    message: 'Service healthy',
    data: {
      status: 'healthy'
    },
  })
})

if (env.ENABLE_TEST_ROUTES) {
  app.use('/api', testRouter)
}

app.use(jsonErrorHandler)

function envOrigins(): string[] {
  return env.CORS_ORIGIN
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}
