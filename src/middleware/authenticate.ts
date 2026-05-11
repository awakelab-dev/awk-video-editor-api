import { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { getMongoDb, isMongoConnected } from '../config/mongodb'
import { env } from '../config/env'
import { getUserTokenVersion, UserDocument } from '../domain/users'

export type AuthenticatedRequest = Request & { user?: UserDocument; requestId?: string }

export async function authenticateRequest(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ success: false, message: 'MongoDB is not connected' })
    }

    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const token = authHeader.slice('Bearer '.length)
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [env.JWT_ALGORITHM],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    }) as jwt.JwtPayload

    const userId = payload.sub
    if (typeof userId !== 'string' || !userId.trim()) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const db = getMongoDb()
    if (!db) {
      return res.status(503).json({ success: false, message: 'MongoDB database is unavailable' })
    }

    const user = await db.collection('users').findOne({ id: userId }) as UserDocument | null
    if (!user || user.status !== 'active') {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    if (typeof payload.tokenVersion !== 'number' || !Number.isSafeInteger(payload.tokenVersion) || payload.tokenVersion < 0) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    if (payload.tokenVersion !== getUserTokenVersion(user)) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    req.user = user
    next()
  } catch {
    return res.status(401).json({ success: false, message: 'Unauthorized' })
  }
}

export function requireRole(roles: Array<'admin' | 'editor' | 'viewer'>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' })
    }
    next()
  }
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' })
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Forbidden' })
  return next()
}

export function requireSelfOrAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' })
  if (req.user.role === 'admin' || req.user.id === req.params.userId) return next()
  return res.status(403).json({ success: false, message: 'Forbidden' })
}
