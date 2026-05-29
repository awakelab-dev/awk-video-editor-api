import { MAX_DOCUMENT_BLOCKS } from './summarizeConstants'

type TruncationResult = {
  text: string
  wasTruncated: boolean
}

type BlockCandidate = {
  index: number
  score: number
  text: string
}

export function truncateDocumentText(
  text: string,
  options: { maxChars: number }
): TruncationResult {
  if (text.length <= options.maxChars) {
    return {
      text,
      wasTruncated: false,
    }
  }

  const blocks = toSemanticBlocks(text)

  if (blocks.length === 0) {
    return {
      text: text.slice(0, options.maxChars).trim(),
      wasTruncated: true,
    }
  }

  const selectedIndexes = new Set<number>()
  const coverageCandidates = buildCoverageCandidates(blocks)

  for (const candidate of coverageCandidates) {
    selectedIndexes.add(candidate.index)
  }

  const rankedBlocks = [...blocks].sort((left, right) => right.score - left.score)
  let currentLength = getCombinedLength(blocks, selectedIndexes)

  for (const block of rankedBlocks) {
    if (selectedIndexes.size >= MAX_DOCUMENT_BLOCKS) {
      break
    }

    if (selectedIndexes.has(block.index)) {
      continue
    }

    const projectedLength = currentLength + block.text.length + 2
    if (projectedLength > options.maxChars) {
      continue
    }

    selectedIndexes.add(block.index)
    currentLength = projectedLength
  }

  const orderedBlocks = blocks.filter((block) => selectedIndexes.has(block.index))
  const joined = orderedBlocks.map((block) => block.text).join('\n\n').trim()

  if (joined.length === 0) {
    return {
      text: text.slice(0, options.maxChars).trim(),
      wasTruncated: true,
    }
  }

  if (joined.length <= options.maxChars) {
    return {
      text: joined,
      wasTruncated: true,
    }
  }

  return {
    text: joined.slice(0, options.maxChars).trim(),
    wasTruncated: true,
  }
}

function toSemanticBlocks(text: string): BlockCandidate[] {
  const paragraphBlocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)

  const normalizedBlocks =
    paragraphBlocks.length > 1 ? paragraphBlocks : splitSingleBlockIntoSentenceGroups(text)

  return normalizedBlocks
    .map((block, index) => ({
      index,
      score: scoreBlock(block),
      text: block,
    }))
    .filter((block) => !isNoiseBlock(block.text))
}

function splitSingleBlockIntoSentenceGroups(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)

  if (sentences.length <= 4) {
    return [text.trim()]
  }

  const groups: string[] = []

  for (let index = 0; index < sentences.length; index += 4) {
    groups.push(sentences.slice(index, index + 4).join(' '))
  }

  return groups
}

function scoreBlock(block: string): number {
  const words = block.split(/\s+/).filter((word) => word.length > 0)
  const sentenceCount = block.split(/[.!?]+/).filter((part) => part.trim().length > 0).length
  const headingBonus = /^[A-Z0-9\u00C1\u00C9\u00CD\u00D3\u00DA\u00DC\u00D1][^.!?]{0,90}$/.test(block) ? 15 : 0
  const conceptBonus = /[:;()]|por ejemplo|define|concepto|principio|proceso|teoria/i.test(block)
    ? 10
    : 0

  return Math.min(words.length, 90) + sentenceCount * 6 + headingBonus + conceptBonus
}

function isNoiseBlock(block: string): boolean {
  const words = block.split(/\s+/).filter((word) => word.length > 0)
  const letters =
    (block.match(
      /[A-Za-z\u00C1\u00C9\u00CD\u00D3\u00DA\u00DC\u00D1\u00E1\u00E9\u00ED\u00F3\u00FA\u00FC\u00F1]/g
    ) ?? []).length
  const digits = (block.match(/\d/g) ?? []).length
  const alphaRatio = letters / Math.max(block.length, 1)
  const digitRatio = digits / Math.max(block.length, 1)

  return (
    words.length < 4 ||
    alphaRatio < 0.45 ||
    digitRatio > 0.4 ||
    /^page\s+\d+/i.test(block) ||
    /^\d+$/.test(block)
  )
}

function buildCoverageCandidates(blocks: BlockCandidate[]): BlockCandidate[] {
  if (blocks.length <= 4) {
    return blocks
  }

  const candidates: BlockCandidate[] = []
  const quartileSize = Math.ceil(blocks.length / 4)

  for (let start = 0; start < blocks.length; start += quartileSize) {
    const segment = blocks.slice(start, start + quartileSize)
    const bestCandidate = [...segment].sort((left, right) => right.score - left.score)[0]

    if (bestCandidate) {
      candidates.push(bestCandidate)
    }
  }

  return candidates
}

function getCombinedLength(blocks: BlockCandidate[], selectedIndexes: Set<number>): number {
  return blocks
    .filter((block) => selectedIndexes.has(block.index))
    .reduce((total, block) => total + block.text.length + 2, 0)
}
