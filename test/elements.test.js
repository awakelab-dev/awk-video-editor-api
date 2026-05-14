const assert = require('node:assert/strict')
const test = require('node:test')

const {
  validateFrontendElementInput
} = require('../dist/validation/elementValidation')

test('accepts frontend shape payload without requiring a client id', () => {
  const validation = validateFrontendElementInput({
    type: 'shape',
    name: 'Rectangulo',
    startTime: 0,
    duration: 5,
    opacity: 100,
    x: 320,
    y: 220,
    width: 320,
    height: 180,
    rotation: 0,
    shapeType: 'rectangle',
    fillColor: '#4f46e5',
    strokeColor: '#1e1b4b',
    strokeWidth: 0,
    cornerRadius: 12
  })

  assert.equal(validation.ok, true)
  assert.equal(validation.value.type, 'shape')
  assert.equal(validation.value.id, undefined)
})

test('accepts and preserves extra frontend shape fields', () => {
  const validation = validateFrontendElementInput({
    type: 'shape',
    name: 'Rectangulo',
    startTime: 0,
    duration: 5,
    opacity: 100,
    x: 320,
    y: 220,
    width: 320,
    height: 180,
    rotation: 0,
    shapeType: 'custom-shape',
    fillColor: 'rgba(79, 70, 229, 1)',
    strokeColor: 'transparent',
    strokeWidth: 0,
    cornerRadius: 12,
    locked: false,
    visible: true
  })

  assert.equal(validation.ok, true)
  assert.equal(validation.value.shapeType, 'custom-shape')
  assert.equal(validation.value.locked, false)
  assert.equal(validation.value.visible, true)
})
