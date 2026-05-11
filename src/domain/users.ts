import { randomUUID } from 'crypto'
import { isSafeUsername } from './safeText'

export type UserRole = 'admin' | 'editor' | 'viewer'
export type UserStatus = 'active' | 'disabled'

export type UserDocument = {
  id: string
  email: string
  username: string
  passwordHash: string
  role: UserRole
  status: UserStatus
  tokenVersion?: number
  createdAt: string
  updatedAt: string
  lastLoginAt: string | null
}

export type ValidationError = { field: string; message: string }

const COMMON_PASSWORDS = new Set([
  '123456', '12345678', 'password', 'password123', 'qwerty', 'qwerty123', 'admin', 'admin123', 'letmein', 'welcome', 'iloveyou', '123123', 'abc123'
])
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function generateUserId(): string {
  return `usr_${randomUUID().replace(/-/g, '')}`
}

export function getUserTokenVersion(user: Pick<UserDocument, 'tokenVersion'>): number {
  return Number.isSafeInteger(user.tokenVersion) && Number(user.tokenVersion) >= 0 ? Number(user.tokenVersion) : 0
}

function hasReservedKey(obj: Record<string, unknown>): string | null {
  for (const key of Object.keys(obj)) {
    if (RESERVED_KEYS.has(key)) return key
  }
  return null
}

function validateUsernameValue(username: unknown): ValidationError[] {
  const errors: ValidationError[] = []
  if (typeof username !== 'string') {
    errors.push({ field: 'username', message: 'Username must be a string' })
    return errors
  }
  const trimmed = username.trim()
  if (trimmed.length < 3 || trimmed.length > 40) {
    errors.push({ field: 'username', message: 'Username must be between 3 and 40 characters' })
  }
  if (!isSafeUsername(trimmed)) {
    errors.push({ field: 'username', message: 'Username may only contain letters, numbers, dots, underscores, and hyphens' })
  }
  return errors
}

export function validateStrongPassword(password: string, email?: string, username?: string): ValidationError[] {
  const errors: ValidationError[] = []
  if (password.length < 12) errors.push({ field: 'password', message: 'Password must be at least 12 characters long' })
  if (password.length > 64) errors.push({ field: 'password', message: 'Password must be at most 64 characters long' })
  if (!/[a-z]/.test(password)) errors.push({ field: 'password', message: 'Password must include at least one lowercase letter' })
  if (!/[A-Z]/.test(password)) errors.push({ field: 'password', message: 'Password must include at least one uppercase letter' })
  if (!/[0-9]/.test(password)) errors.push({ field: 'password', message: 'Password must include at least one number' })
  if (!/[^A-Za-z0-9]/.test(password)) errors.push({ field: 'password', message: 'Password must include at least one special character' })

  const lower = password.toLowerCase()
  if (COMMON_PASSWORDS.has(lower)) errors.push({ field: 'password', message: 'Password is too common' })
  if (email) {
    const emailPart = email.split('@')[0]?.toLowerCase()
    if (emailPart && emailPart.length >= 3 && lower.includes(emailPart)) errors.push({ field: 'password', message: 'Password must not contain your email' })
  }
  if (username) {
    const normalizedUsername = username.trim().toLowerCase()
    if (normalizedUsername.length >= 3 && lower.includes(normalizedUsername)) errors.push({ field: 'password', message: 'Password must not contain your username' })
  }
  if (/(.)\1{3,}/.test(password)) errors.push({ field: 'password', message: 'Password must not contain repeated character sequences' })
  if (/1234|2345|3456|4567|5678|6789|abcd|qwer|asdf/i.test(password)) errors.push({ field: 'password', message: 'Password must not contain obvious sequences' })
  return errors
}

export function validateRegisterPayload(body: unknown): ValidationError[] {
  const errors: ValidationError[] = []
  if (!isObject(body)) return [{ field: 'body', message: 'Body must be a JSON object' }]
  const reserved = hasReservedKey(body)
  if (reserved) errors.push({ field: reserved, message: 'Reserved key is not allowed' })
  const allowedKeys = new Set(['email', 'username', 'password'])
  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) errors.push({ field: key, message: 'Unknown field is not allowed' })
  }
  if (typeof body.email !== 'string' || body.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    errors.push({ field: 'email', message: 'Email must be valid' })
  }
  errors.push(...validateUsernameValue(body.username))
  if (typeof body.password !== 'string') {
    errors.push({ field: 'password', message: 'Password is required' })
  } else {
    errors.push(...validateStrongPassword(body.password, typeof body.email === 'string' ? body.email : undefined, typeof body.username === 'string' ? body.username : undefined))
  }
  return errors
}

export function validateLoginPayload(body: unknown): ValidationError[] {
  const errors: ValidationError[] = []
  if (!isObject(body)) return [{ field: 'body', message: 'Body must be a JSON object' }]
  const reserved = hasReservedKey(body)
  if (reserved) errors.push({ field: reserved, message: 'Reserved key is not allowed' })
  const allowedKeys = new Set(['email', 'password'])
  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) errors.push({ field: key, message: 'Unknown field is not allowed' })
  }
  if (typeof body.email !== 'string' || !body.email.trim() || body.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    errors.push({ field: 'email', message: 'Email must be valid' })
  }
  if (typeof body.password !== 'string' || !body.password) {
    errors.push({ field: 'password', message: 'Password is required' })
  } else if (body.password.length > 64) {
    errors.push({ field: 'password', message: 'Password must be at most 64 characters long' })
  }
  return errors
}

export function validateUserSelfPatchPayload(body: unknown, email?: string, username?: string): ValidationError[] {
  const errors: ValidationError[] = []
  if (!isObject(body)) return [{ field: 'body', message: 'Body must be a JSON object' }]
  const reserved = hasReservedKey(body)
  if (reserved) errors.push({ field: reserved, message: 'Reserved key is not allowed' })
  const allowedKeys = new Set(['username', 'password'])
  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) errors.push({ field: key, message: 'Unknown field is not allowed' })
  }
  if (body.username !== undefined) errors.push(...validateUsernameValue(body.username))
  if (body.password !== undefined) {
    if (typeof body.password !== 'string') {
      errors.push({ field: 'password', message: 'Password must be a string' })
    } else {
      const effectiveUsername = typeof body.username === 'string' ? body.username : username
      errors.push(...validateStrongPassword(body.password, email, effectiveUsername))
    }
  }
  if (Object.keys(body).length === 0) errors.push({ field: 'body', message: 'At least one field must be provided' })
  return errors
}

export function validateAdminUserPatchPayload(body: unknown): ValidationError[] {
  const errors: ValidationError[] = []
  if (!isObject(body)) return [{ field: 'body', message: 'Body must be a JSON object' }]
  const reserved = hasReservedKey(body)
  if (reserved) errors.push({ field: reserved, message: 'Reserved key is not allowed' })
  const allowedKeys = new Set(['role', 'status'])
  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) errors.push({ field: key, message: 'Unknown field is not allowed' })
  }
  if (body.status !== undefined && body.status !== 'active' && body.status !== 'disabled') errors.push({ field: 'status', message: 'Status must be active or disabled' })
  if (body.role !== undefined && body.role !== 'admin' && body.role !== 'editor' && body.role !== 'viewer') errors.push({ field: 'role', message: 'Role must be admin, editor, or viewer' })
  if (Object.keys(body).length === 0) errors.push({ field: 'body', message: 'At least one field must be provided' })
  return errors
}

export function toApiUser(user: UserDocument) {
  return {
    userId: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
  }
}
