import { config } from 'dotenv'

config()

const NODE_ENV = (process.env.NODE_ENV ?? 'development').trim()
const IS_PRODUCTION = NODE_ENV === 'production'
const FORBIDDEN_JWT_SECRETS = new Set([
  '',
  'change-me-in-production',
  'dev-only-change-this-secret-please-123456789',
  'test-secret-1234567890',
  'secret',
  'jwt-secret',
  'example-secret',
  'password',
  'changeme',
  'please-change-me',
])
const MIN_PRODUCTION_JWT_SECRET_LENGTH = 32

function value(name: string, fallback = ''): string {
  return (process.env[name] ?? fallback).trim()
}

function required(name: string, fallback = ''): string {
  const v = value(name, fallback)
  if (!v) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return v
}

function requiredInProduction(name: string, fallback = ''): string {
  const v = value(name, fallback)
  if (IS_PRODUCTION && !v) {
    throw new Error(`Missing required environment variable in production: ${name}`)
  }
  return v
}

function assertProductionJwtSecret(secret: string) {
  if (!IS_PRODUCTION) return
  const normalized = secret.trim().toLowerCase()
  if (secret.length < MIN_PRODUCTION_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be at least ${MIN_PRODUCTION_JWT_SECRET_LENGTH} characters in production`)
  }
  if (FORBIDDEN_JWT_SECRETS.has(normalized)) {
    throw new Error('JWT_SECRET uses a forbidden placeholder value in production')
  }
  if (/^(.)\1+$/.test(secret)) {
    throw new Error('JWT_SECRET is too weak for production')
  }
  if (/(change|changeme|placeholder|example|dev-only|development|default|sample)/i.test(secret)) {
    throw new Error('JWT_SECRET looks like a placeholder value in production')
  }
}

const port = Number(process.env.PORT ?? 4000)
const bcryptRounds = Number(process.env.BCRYPT_ROUNDS ?? 12)
const maxProjectsPerUser = Number(process.env.MAX_PROJECTS_PER_USER ?? 100)
const enableTestRoutes = value('ENABLE_TEST_ROUTES').toLowerCase() === 'true'
const jwtSecret = requiredInProduction('JWT_SECRET', IS_PRODUCTION ? '' : 'dev-only-change-this-secret-please-123456789')
assertProductionJwtSecret(jwtSecret)

const jwtIssuer = requiredInProduction('JWT_ISSUER', IS_PRODUCTION ? '' : 'awk-video-editor-api')
const jwtAudience = requiredInProduction('JWT_AUDIENCE', IS_PRODUCTION ? '' : 'awk-video-editor-client')
const corsOrigin = requiredInProduction('CORS_ORIGIN', IS_PRODUCTION ? '' : 'http://localhost:5173')
const mongoUri = requiredInProduction('MONGODB_URI', '')

export const env = {
  NODE_ENV,
  IS_PRODUCTION,
  PORT: Number.isFinite(port) && port > 0 ? port : 4000,
  MONGODB_URI: mongoUri,
  MONGODB_DB_NAME: value('MONGODB_DB_NAME', 'awk_video_editor'),
  JWT_SECRET: jwtSecret,
  JWT_EXPIRES_IN: value('JWT_EXPIRES_IN', '1h'),
  JWT_ISSUER: jwtIssuer,
  JWT_AUDIENCE: jwtAudience,
  JWT_ALGORITHM: 'HS256' as const,
  CORS_ORIGIN: corsOrigin,
  BCRYPT_ROUNDS: Number.isFinite(bcryptRounds) && bcryptRounds >= 10 && bcryptRounds <= 15 ? bcryptRounds : 12,
  MAX_PROJECTS_PER_USER: Number.isFinite(maxProjectsPerUser) && maxProjectsPerUser > 0 && maxProjectsPerUser <= 10000 ? Math.floor(maxProjectsPerUser) : 100,
  ENABLE_TEST_ROUTES: !IS_PRODUCTION && enableTestRoutes,
}
