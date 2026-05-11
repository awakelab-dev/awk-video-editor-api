import { Router, Response } from 'express'
import bcrypt from 'bcryptjs'
import { getMongoDb, isMongoConnected } from '../config/mongodb'
import { AuthenticatedRequest, authenticateRequest, requireAdmin, requireSelfOrAdmin } from '../middleware/authenticate'
import { toApiUser, validateAdminUserPatchPayload, validateUserSelfPatchPayload } from '../domain/users'
import { env } from '../config/env'

const router = Router()

function unavailable(res: Response) {
  return res.status(503).json({ success: false, message: 'MongoDB is not connected' })
}

function isDuplicateKeyError(error: any): boolean {
  return Boolean(error && (error.code === 11000 || String(error.message || '').includes('E11000')))
}

router.patch('/:userId', authenticateRequest, requireSelfOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isMongoConnected()) return unavailable(res)
    const db = getMongoDb()
    if (!db) return unavailable(res)
    const usersCollection: any = db.collection('users')

    const currentUser = await usersCollection.findOne({ id: req.params.userId })
    if (!currentUser) return res.status(404).json({ success: false, message: 'User not found' })

    const errors = validateUserSelfPatchPayload(req.body, currentUser.email, currentUser.username)
    if (errors.length > 0) return res.status(422).json({ success: false, message: 'Validation failed', errors })

    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() }
    if (req.body.username !== undefined) patch.username = req.body.username.trim()
    if (req.body.password !== undefined) patch.passwordHash = await bcrypt.hash(req.body.password, env.BCRYPT_ROUNDS)

    const update: Record<string, unknown> = { $set: patch }
    if (req.body.password !== undefined) update.$inc = { tokenVersion: 1 }

    await usersCollection.updateOne({ id: req.params.userId }, update)
    const updatedUser = await usersCollection.findOne({ id: req.params.userId })
    console.info('user_update', { actorUserId: req.user?.id, targetUserId: req.params.userId })
    return res.status(200).json({ success: true, message: 'User updated successfully', data: { user: toApiUser(updatedUser) } })
  } catch (error: any) {
    if (isDuplicateKeyError(error)) {
      return res.status(409).json({ success: false, message: 'Username already in use' })
    }
    console.error('Error updating user:', { message: error?.message })
    return res.status(500).json({ success: false, message: 'Server error' })
  }
})

router.patch('/:userId/admin', authenticateRequest, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isMongoConnected()) return unavailable(res)

    const errors = validateAdminUserPatchPayload(req.body)
    if (errors.length > 0) return res.status(422).json({ success: false, message: 'Validation failed', errors })

    const db = getMongoDb()
    if (!db) return unavailable(res)
    const usersCollection: any = db.collection('users')

    const currentUser = await usersCollection.findOne({ id: req.params.userId })
    if (!currentUser) return res.status(404).json({ success: false, message: 'User not found' })

    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() }
    if (req.body.status !== undefined) patch.status = req.body.status
    if (req.body.role !== undefined) patch.role = req.body.role

    await usersCollection.updateOne({ id: req.params.userId }, { $set: patch, $inc: { tokenVersion: 1 } })
    const updatedUser = await usersCollection.findOne({ id: req.params.userId })
    console.info('admin_user_update', { actorUserId: req.user?.id, targetUserId: req.params.userId })
    return res.status(200).json({ success: true, message: 'User admin update successful', data: { user: toApiUser(updatedUser) } })
  } catch (error: any) {
    console.error('Error in admin user update:', { message: error?.message })
    return res.status(500).json({ success: false, message: 'Server error' })
  }
})

router.delete('/:userId', authenticateRequest, requireSelfOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isMongoConnected()) return unavailable(res)
    const db = getMongoDb()
    if (!db) return unavailable(res)
    const usersCollection: any = db.collection('users')

    const currentUser = await usersCollection.findOne({ id: req.params.userId })
    if (!currentUser) return res.status(404).json({ success: false, message: 'User not found' })

    await usersCollection.updateOne({ id: req.params.userId }, { $set: { status: 'disabled', updatedAt: new Date().toISOString() }, $inc: { tokenVersion: 1 } })
    console.info('user_disable', { actorUserId: req.user?.id, targetUserId: req.params.userId })
    return res.status(200).json({ success: true, message: 'User disabled successfully' })
  } catch (error: any) {
    console.error('Error disabling user:', { message: error?.message })
    return res.status(500).json({ success: false, message: 'Server error' })
  }
})

export default router
