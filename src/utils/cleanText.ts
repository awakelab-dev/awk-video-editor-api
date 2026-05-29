const CONTROL_CHARACTERS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const BULLET_PREFIX_REGEX = /^[-*+\d.)\s]+/

export function normalizeSourceText(input: string): string {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(CONTROL_CHARACTERS_REGEX, ' ')
    .replace(/\uFFFD/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export function cleanInlineText(input: string, maxLength: number): string {
  return trimToLength(normalizeSourceText(input).replace(/\n+/g, ' '), maxLength)
}

export function cleanParagraphText(input: string, maxLength: number): string {
  return trimToLength(
    normalizeSourceText(input)
      .replace(BULLET_PREFIX_REGEX, '')
      .replace(/\n+/g, ' '),
    maxLength
  )
}

function trimToLength(input: string, maxLength: number): string {
  const trimmed = input.trim()

  if (trimmed.length <= maxLength) {
    return trimmed
  }

  const sliced = trimmed.slice(0, maxLength + 1)
  const lastWhitespace = sliced.lastIndexOf(' ')

  if (lastWhitespace < Math.floor(maxLength * 0.6)) {
    return trimmed.slice(0, maxLength).trim()
  }

  return sliced.slice(0, lastWhitespace).trim()
}
