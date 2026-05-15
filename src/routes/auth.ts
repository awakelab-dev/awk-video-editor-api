import { Request, Response, Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { getMongoDb, isMongoConnected } from '../config/mongodb'
import {
  generateUserId,
  getUserTokenVersion,
  toApiUser,
  UserDocument,
  validateLoginPayload,
  validateRegisterPayload,
} from '../domain/users'
import { AuthenticatedRequest, authenticateRequest } from '../middleware/authenticate'
import { hashLogIdentifier } from '../utils/logRedaction'

const router = Router()

export const DUMMY_LOGIN_PASSWORD_HASH_BY_COST: Record<number, string> = {
  10: '$2a$10$jHHclePlVx1ixR8mFAYQzOUMbnS.Cj7n99ZceZqpenWbv9mbOjoUu',
  11: '$2a$11$IRGc/yk951rXpCD5I/tnn.IaAD2wsCPl8Zk5VrCWDaIAKj063K4ta',
  12: '$2a$12$N3htE1VpX/ZlOD.0OjBpkuMaJHWg5YR98L7fuiXArcNeezdqqonPa',
  13: '$2a$13$6TPo/npcwUZE46Hrn.517OF95mx3AFvZ2ajbm9cHuWmGdplOYFeiu',
  14: '$2a$14$WSJRTICzpNv1aKelz3QPkOTQtEATxX2XumU4S9VfgBTa8EujBFqBa',
  15: '$2a$15$87YzcLuqebH6UECzeMisBO7odWrmVogprO1ZIyARdEKitY93ZONGS',
}

export function getDummyLoginPasswordHash(): string {
  return DUMMY_LOGIN_PASSWORD_HASH_BY_COST[env.BCRYPT_ROUNDS] ?? DUMMY_LOGIN_PASSWORD_HASH_BY_COST[12]
}

function unavailable(res: Response) {
  return res.status(503).json({ success: false, message: 'MongoDB is not connected' })
}

function isLoginEligibleUser(user: UserDocument | null): user is UserDocument {
  return Boolean(user && user.status === 'active' && !(user as any).isDeleted)
}

function loginFailure(res: Response) {
  return res.status(401).json({ success: false, message: 'Invalid credentials' })
}

function issueAccessToken(user: UserDocument): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      username: user.username,
      tokenVersion: getUserTokenVersion(user),
    },
    env.JWT_SECRET,
    {
      expiresIn: env.JWT_EXPIRES_IN as any,
      algorithm: env.JWT_ALGORITHM,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    }
  )
}

function isDuplicateKeyError(error: any): boolean {
  return Boolean(error && (error.code === 11000 || String(error.message || '').includes('E11000')))
}

router.post('/register', async (req: Request, res: Response) => {
  try {
    if (!isMongoConnected()) return unavailable(res)

    const errors = validateRegisterPayload(req.body)
    if (errors.length > 0) {
      return res.status(422).json({ success: false, message: 'Validation failed', errors })
    }

    const db = getMongoDb()
    if (!db) return unavailable(res)

    const usersCollection: any = db.collection('users')
    const email = req.body.email.trim().toLowerCase()
    const username = req.body.username.trim()

    const existingByEmail = await usersCollection.findOne({ email }, { projection: { _id: 1 } })
    if (existingByEmail) return res.status(409).json({ success: false, message: 'Email already in use' })

    const existingByUsername = await usersCollection.findOne({ username }, { projection: { _id: 1 } })
    if (existingByUsername) return res.status(409).json({ success: false, message: 'Username already in use' })

    const now = new Date().toISOString()
    const passwordHash = await bcrypt.hash(req.body.password, env.BCRYPT_ROUNDS)
    const user: UserDocument = {
      id: generateUserId(),
      email,
      username,
      passwordHash,
      role: 'editor',
      status: 'active',
      tokenVersion: 0,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    }

    await usersCollection.insertOne(user)
    console.info('register_success', { userId: user.id, emailHash: hashLogIdentifier(user.email) })
    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: { user: toApiUser(user) },
    })
  } catch (error: any) {
    if (isDuplicateKeyError(error)) {
      return res.status(409).json({ success: false, message: 'Email or username already in use' })
    }
    console.error('Error registering user:', { message: error?.message })
    return res.status(500).json({ success: false, message: 'Server error' })
  }
})

router.post('/login', async (req: Request, res: Response) => {
  try {
    if (!isMongoConnected()) return unavailable(res)

    const errors = validateLoginPayload(req.body)
    if (errors.length > 0) {
      return res.status(422).json({ success: false, message: 'Validation failed', errors })
    }

    const db = getMongoDb()
    if (!db) return unavailable(res)

    const usersCollection: any = db.collection('users')
    const normalizedEmail = req.body.email.trim().toLowerCase()
    const user = await usersCollection.findOne({ email: normalizedEmail }) as UserDocument | null
    const eligibleUser = isLoginEligibleUser(user) ? user : null
    const passwordHashToCheck = eligibleUser?.passwordHash ?? getDummyLoginPasswordHash()
    const matches = await bcrypt.compare(req.body.password, passwordHashToCheck)

    if (!eligibleUser || !matches) {
      const logContext = eligibleUser
        ? { userId: eligibleUser.id, emailHash: hashLogIdentifier(eligibleUser.email), reason: 'invalid_credentials' }
        : { emailHash: hashLogIdentifier(normalizedEmail), reason: 'invalid_credentials' }
      console.info('login_failure', logContext)
      return loginFailure(res)
    }

    const now = new Date().toISOString()
    await usersCollection.updateOne({ id: eligibleUser.id }, { $set: { lastLoginAt: now, updatedAt: now } })
    eligibleUser.lastLoginAt = now
    eligibleUser.updatedAt = now

    const accessToken = issueAccessToken(eligibleUser)
    console.info('login_success', { userId: eligibleUser.id })
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        accessToken,
        token: accessToken,
        bearerToken: accessToken,
        tokenType: 'Bearer',
        expiresIn: env.JWT_EXPIRES_IN,
        user: toApiUser(eligibleUser),
      },
    })
  } catch (error: any) {
    console.error('Error logging in:', { message: error?.message })
    return res.status(500).json({ success: false, message: 'Server error' })
  }
})

router.post('/logout', authenticateRequest, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isMongoConnected()) return unavailable(res)
    const db = getMongoDb()
    if (!db) return unavailable(res)

    await db.collection('users').updateOne(
      { id: req.user!.id },
      { $inc: { tokenVersion: 1 }, $set: { updatedAt: new Date().toISOString() } }
    )

    console.info('logout', { userId: req.user?.id })
    return res.status(200).json({ success: true, message: 'Logout successful' })
  } catch (error: any) {
    console.error('Error during logout:', { message: error?.message })
    return res.status(500).json({ success: false, message: 'Server error' })
  }
})

router.post('/logout-all', authenticateRequest, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isMongoConnected()) return unavailable(res)
    const db = getMongoDb()
    if (!db) return unavailable(res)

    await db.collection('users').updateOne(
      { id: req.user!.id },
      { $inc: { tokenVersion: 1 }, $set: { updatedAt: new Date().toISOString() } }
    )

    console.info('logout_all', { userId: req.user?.id })
    return res.status(200).json({ success: true, message: 'All sessions revoked successfully' })
  } catch (error: any) {
    console.error('Error during logout-all:', { message: error?.message })
    return res.status(500).json({ success: false, message: 'Server error' })
  }
})

router.get('/me', authenticateRequest, async (req: AuthenticatedRequest, res: Response) => {
  return res.status(200).json({
    success: true,
    message: 'Authenticated user fetched successfully',
    data: { user: toApiUser(req.user!) },
  })
})

export default router
