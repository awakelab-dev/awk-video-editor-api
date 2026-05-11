import { createHmac } from 'crypto'

function normalizeLogIdentifier(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return normalized ? normalized : null
}

export function hashLogIdentifier(value: unknown): string {
  const normalized = normalizeLogIdentifier(value)
  const pepper = process.env.LOG_HASH_PEPPER
  if (!normalized || !pepper) return '[hash-unavailable]'

  return createHmac('sha256', pepper)
    .update(normalized)
    .digest('hex')
    .slice(0, 16)
}
