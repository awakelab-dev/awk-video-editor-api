export function buildSummarizeInstructions(options: { isRetry: boolean }): string {
  return [
    options.isRetry ? 'Previous output was invalid. Follow the schema exactly.' : '',
    'Create 1 to 8 educational slides from the source.',
    'Split by topic changes, not by length.',
    'Return only schema-valid JSON.',
    'Each slide needs a concise title, summary, 1 to 5 bullets, 3 to 6 semantic keywords, and up to 2 short speaker-note sentences.',
  ]
    .filter((line) => line.length > 0)
    .join(' ')
}

export function buildSummarizeInput(sourceText: string): string {
  return `Source material:\n${sourceText}`
}
