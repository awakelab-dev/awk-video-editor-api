export type ValidationError = { field: string; message: string }

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/
const HTML_META_CHARS = /[<>"'`&]/
const HTML_ENTITY_TAG_CHARS = /&(?:lt|gt|#0*60|#x0*3c|#0*62|#x0*3e);?/i
const URL_SCRIPT_PROTOCOL = /\b(?:javascript|data|vbscript):/i
const INLINE_HANDLER_ASSIGNMENT = /\bon[a-z]+\s*=/i
const SAFE_USERNAME = /^[A-Za-z0-9_.-]{3,40}$/

export function isSafeDisplayText(value: string): boolean {
  return (
    !CONTROL_CHARS.test(value) &&
    !HTML_META_CHARS.test(value) &&
    !HTML_ENTITY_TAG_CHARS.test(value) &&
    !URL_SCRIPT_PROTOCOL.test(value) &&
    !INLINE_HANDLER_ASSIGNMENT.test(value)
  )
}

export function isSafeUsername(value: string): boolean {
  return SAFE_USERNAME.test(value) && isSafeDisplayText(value)
}
