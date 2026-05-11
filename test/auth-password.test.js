const test = require('node:test')
const assert = require('node:assert/strict')
const { validateStrongPassword, validateRegisterPayload, validateLoginPayload, validateAdminUserPatchPayload, validateUserSelfPatchPayload } = require('../dist/domain/users.js')

test('rejects weak password', () => {
  const errors = validateStrongPassword('password123', 'user@example.com', 'user')
  assert.ok(errors.length > 0)
})

test('rejects too long password', () => {
  const errors = validateStrongPassword('A'.repeat(65) + '1!', 'user@example.com', 'user')
  assert.ok(errors.some((error) => error.message.includes('at most 64 characters')))
})

test('accepts strong password', () => {
  const errors = validateStrongPassword('Sup3r!StrongPass', 'user@example.com', 'user')
  assert.equal(errors.length, 0)
})

test('public register rejects role injection', () => {
  const errors = validateRegisterPayload({
    email: 'admin@example.com',
    username: 'badactor',
    password: 'Sup3r!StrongPass',
    role: 'admin'
  })
  assert.ok(errors.some((error) => error.field === 'role'))
})

test('login rejects unknown fields and malformed emails', () => {
  const errors = validateLoginPayload({
    email: 'not-an-email',
    password: 'Sup3r!StrongPass',
    injected: 'x'
  })
  const fields = errors.map((error) => error.field)
  assert.ok(fields.includes('email'))
  assert.ok(fields.includes('injected'))
})

test('self patch rejects role and status fields', () => {
  const errors = validateUserSelfPatchPayload({ role: 'admin', status: 'active' }, 'u@example.com', 'user')
  const fields = errors.map((e) => e.field)
  assert.ok(fields.includes('role'))
  assert.ok(fields.includes('status'))
})

test('self patch rejects markup username', () => {
  const errors = validateUserSelfPatchPayload({ username: '<svg/onload=alert(1)>' }, 'u@example.com', 'user')
  assert.ok(errors.some((error) => error.field === 'username'))
})

test('admin patch accepts role and status fields', () => {
  const errors = validateAdminUserPatchPayload({ role: 'admin', status: 'disabled' })
  assert.equal(errors.length, 0)
})
