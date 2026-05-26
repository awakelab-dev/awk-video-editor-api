import { readFileSync } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { env } from "../../config/env";
import { buildEditorTemplateFromPlan } from "./editor-template";
import type { SlidePlanRequestInput } from "./slide-plans.schemas";

type SlideLayoutField = {
  key: string;
  kind: string;
  required: boolean;
  minItems?: number;
  maxItems?: number;
};

type SlideSchemaDefinition = {
  version: string;
  templateId: string;
  metadata: {
    name: string;
    resolution: {
      w: number;
      h: number;
    };
    slideDurationSeconds: number;
  };
  layoutCatalog: Record<
    string,
    {
      description: string;
      fields: SlideLayoutField[];
    }
  >;
  slides: Array<{
    index: number;
    id: string;
    layout: string;
  }>;
};

type GeneratedSlidePlan = {
  version: string;
  templateId: string;
  metadata: SlideSchemaDefinition["metadata"] & { generatedAt: string };
  layoutCatalog: SlideSchemaDefinition["layoutCatalog"];
  slides: Array<{
    index: number;
    id: string;
    layout: string;
    content: Record<string, unknown>;
  }>;
};

type EditorTemplateResponse = {
  id: string;
  name: string;
  description: string;
  owner: string;
  status: string;
  slides: number;
  durationSeconds: number;
  resolution: SlideSchemaDefinition["metadata"]["resolution"];
  lastEditedAt: string;
  collaborators: number;
  tags: string[];
  thumbnail: {
    gradient: string;
    title: string;
    subtitle: string;
    bullets: string[];
  };
  tracks: Array<{
    id: string;
    name: string;
    kind: string;
    elements: Array<Record<string, unknown>>;
  }>;
};

const SLIDE_SCHEMA_PATH = path.resolve(
  __dirname,
  "../../../docs/slide-schema.json",
);

const STOPWORDS = new Set([
  "a",
  "al",
  "algo",
  "ante",
  "aqui",
  "cada",
  "como",
  "con",
  "contra",
  "cual",
  "cuando",
  "de",
  "del",
  "desde",
  "donde",
  "e",
  "el",
  "ella",
  "ellas",
  "ellos",
  "en",
  "entre",
  "era",
  "eramos",
  "esa",
  "esas",
  "ese",
  "eso",
  "esos",
  "esta",
  "estaba",
  "estaban",
  "estas",
  "este",
  "esto",
  "estos",
  "estoy",
  "fue",
  "ha",
  "hace",
  "hacia",
  "han",
  "hasta",
  "la",
  "las",
  "le",
  "les",
  "lo",
  "los",
  "mas",
  "pero",
  "por",
  "porque",
  "que",
  "quien",
  "se",
  "sin",
  "sobre",
  "su",
  "sus",
  "tal",
  "tambien",
  "te",
  "tiene",
  "tienen",
  "todo",
  "tras",
  "tu",
  "tus",
  "un",
  "una",
  "uno",
  "unos",
  "y",
  "ya",
  "you",
  "your",
  "the",
  "and",
  "of",
  "to",
  "for",
  "with",
  "is",
  "are",
  "as",
  "at",
  "in",
  "on",
  "from",
]);

const slideSchema = JSON.parse(
  readFileSync(SLIDE_SCHEMA_PATH, "utf8"),
) as SlideSchemaDefinition;

function normalizeText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function countWords(value: string): number {
  const matches = value.match(/\b[\p{L}\p{N}'][\p{L}\p{N}'-]*\b/gu);
  return matches ? matches.length : 0;
}

function splitSentences(value: string): string[] {
  const normalized = normalizeText(value);
  if (!normalized) return [];

  const hasSegmenter = typeof Intl !== "undefined" && "Segmenter" in Intl;
  if (hasSegmenter) {
    const segmenter = new Intl.Segmenter("es", { granularity: "sentence" });
    return Array.from(segmenter.segment(normalized), (part) =>
      part.segment.trim(),
    ).filter(Boolean);
  }

  return normalized
    .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitClauses(value: string): string[] {
  return value
    .split(/(?<=[,;:])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitByWords(value: string, parts: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length <= 1 || parts <= 1) return [value.trim()].filter(Boolean);

  const size = Math.ceil(words.length / parts);
  const chunks: string[] = [];

  for (let index = 0; index < words.length; index += size) {
    chunks.push(words.slice(index, index + size).join(" "));
  }

  return chunks.map((chunk) => chunk.trim()).filter(Boolean);
}

function splitIntoExactChunks(units: string[], targetCount: number): string[] {
  const cleaned = units.map((unit) => unit.trim()).filter(Boolean);
  if (cleaned.length === 0)
    return Array.from({ length: targetCount }, () => "");

  let chunks = cleaned.map((text) => ({ text, words: countWords(text) }));

  while (chunks.length < targetCount) {
    let splitIndex = chunks.findIndex(
      (chunk) => splitClauses(chunk.text).length > 1,
    );

    if (splitIndex === -1) {
      splitIndex = chunks.findIndex((chunk) => chunk.words > 18);
    }

    if (splitIndex === -1) break;

    const chunk = chunks.splice(splitIndex, 1)[0];
    const clauses = splitClauses(chunk.text);
    const nextPieces =
      clauses.length > 1 ? clauses : splitByWords(chunk.text, 2);

    if (nextPieces.length <= 1) {
      chunks.splice(splitIndex, 0, chunk);
      break;
    }

    chunks.splice(
      splitIndex,
      0,
      ...nextPieces.map((text) => ({ text, words: countWords(text) })),
    );
  }

  while (chunks.length > targetCount) {
    let mergeIndex = 0;
    let mergeScore = Number.POSITIVE_INFINITY;

    for (let index = 0; index < chunks.length - 1; index += 1) {
      const score = chunks[index].words + chunks[index + 1].words;
      if (score < mergeScore) {
        mergeScore = score;
        mergeIndex = index;
      }
    }

    const merged =
      `${chunks[mergeIndex].text} ${chunks[mergeIndex + 1].text}`.trim();
    chunks.splice(mergeIndex, 2, { text: merged, words: countWords(merged) });
  }

  return chunks.map((chunk) => chunk.text).filter(Boolean);
}

function fitWords(value: string, maxLength: number): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) return normalized;

  const words = normalized.split(/\s+/).filter(Boolean);
  const output: string[] = [];
  let length = 0;

  for (const word of words) {
    const nextLength =
      output.length === 0 ? word.length : length + 1 + word.length;
    if (nextLength > maxLength) break;
    output.push(word);
    length = nextLength;
  }

  if (output.length > 0) return output.join(" ");

  return normalized.slice(0, maxLength).trimEnd();
}

function compactSentence(value: string, maxLength: number): string {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;

  // Try taking leading clauses (comma/semicolon separated)
  const clauses = splitClauses(normalized);
  if (clauses.length > 1) {
    for (let take = clauses.length; take >= 1; take--) {
      const candidate = clauses.slice(0, take).join(" ");
      const compacted = fitWords(candidate, maxLength);
      if (compacted.length > 0 && compacted.length <= maxLength)
        return compacted;
    }
  }

  // If that fails, split by common conjunctions/relators and try leading parts
  const conjunctionSplitter = /\s+(?:y|o|que|si|cuando|porque|para|con)\s+/i;
  const parts = normalized
    .split(conjunctionSplitter)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length > 1) {
    for (let take = parts.length; take >= 1; take--) {
      const candidate = parts.slice(0, take).join(" ");
      const compacted = fitWords(candidate, maxLength);
      if (compacted.length > 0 && compacted.length <= maxLength)
        return compacted;
    }
  }

  // Fallback: return as many words as fit from the start (keeps coherence without ellipsis)
  return fitWords(normalized, maxLength);
}

function fitText(value: string, maxLength: number): string {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;

  const sentences = splitSentences(normalized);
  if (sentences.length === 0) {
    return compactSentence(normalized, maxLength);
  }

  const selectedSentences: string[] = [];
  let length = 0;

  for (const sentence of sentences) {
    const compacted = compactSentence(sentence, maxLength);
    if (!compacted) continue;

    const nextLength =
      selectedSentences.length === 0
        ? compacted.length
        : length + 1 + compacted.length;
    if (nextLength > maxLength) break;
    selectedSentences.push(compacted);
    length = nextLength;
  }

  if (selectedSentences.length > 0) return selectedSentences.join(" ");

  return compactSentence(sentences[0], maxLength);
}

function inferTitle(text: string): string {
  const firstSentence = splitSentences(text)[0] ?? text;
  const cleaned = firstSentence.replace(/^[-•\d.\s]+/u, "").trim();
  return fitText(cleaned || "Nuevo guion de slides", 80);
}

function extractKeywords(text: string, limit: number): string[] {
  const counts = new Map<string, number>();
  const matches = text.toLowerCase().match(/\b[\p{L}]{4,}\b/gu) ?? [];

  for (const word of matches) {
    if (STOPWORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .slice(0, limit)
    .map(([word]) => word);
}

function chunkWords(text: string, parts: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return Array.from({ length: parts }, () => "");

  const chunks: string[] = [];
  for (let index = 0; index < parts; index += 1) {
    const start = Math.floor((index * words.length) / parts);
    const end = Math.floor(((index + 1) * words.length) / parts);
    chunks.push(words.slice(start, Math.max(start + 1, end)).join(" "));
  }

  return chunks.map((chunk) => chunk.trim()).filter(Boolean);
}

function splitSummary(value: string, parts: number): string[] {
  const summary = fitText(value, 420);
  const sentences = splitSentences(summary);

  if (sentences.length >= parts) {
    return sentences.slice(0, parts).map((sentence) => fitText(sentence, 140));
  }

  return chunkWords(summary, parts).map((chunk) => fitText(chunk, 140));
}

function buildBlocks(
  chunk: string,
  count: number,
): Array<{ title: string; text: string }> {
  return splitSummary(chunk, count).map((part, index) => ({
    title: `Punto ${index + 1}`,
    text: part,
  }));
}

function buildCards(
  chunk: string,
  count: number,
): Array<{ title: string; description: string }> {
  return splitSummary(chunk, count).map((part, index) => ({
    title: `Idea ${index + 1}`,
    description: part,
  }));
}

function buildRows(
  chunk: string,
  count: number,
): Array<{ label: string; summary: string }> {
  return splitSummary(chunk, count).map((part, index) => ({
    label: `${String(index + 1).padStart(2, "0")}`,
    summary: part,
  }));
}

function buildSteps(
  chunk: string,
  count: number,
): Array<{ title: string; description: string }> {
  return splitSummary(chunk, count).map((part, index) => ({
    title: `Paso ${index + 1}`,
    description: part,
  }));
}

function splitIntoParagraphs(value: string, count: number): string[] {
  const paragraphs = normalizeText(value)
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (paragraphs.length >= count) {
    return paragraphs
      .slice(0, count)
      .map((paragraph) => fitText(paragraph, 180));
  }

  return chunkWords(value, count).map((chunk) => fitText(chunk, 180));
}

function estimateSlideCount(text: string, sentenceCount: number): number {
  const wordCount = countWords(text);
  const paragraphCount = normalizeText(text)
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean).length;

  const byWords = Math.ceil(wordCount / 85);
  const bySentences = Math.ceil(Math.max(sentenceCount, 1) / 4);
  const byParagraphs = Math.max(1, paragraphCount + 2);

  return Math.min(
    slideSchema.slides.length,
    Math.max(4, byWords, bySentences, byParagraphs),
  );
}

function buildCoverSlide(
  title: string,
  chunks: string[],
  keywords: string[],
  tone?: string,
): Record<string, unknown> {
  const cards = chunks.slice(0, 3).map((chunk, index) => ({
    title: `Clave ${index + 1}`,
    description: fitText(chunk, 120),
  }));

  while (cards.length < 3) {
    cards.push({
      title: `Clave ${cards.length + 1}`,
      description: keywords[cards.length]
        ? fitText(keywords[cards.length], 120)
        : "Idea principal del texto",
    });
  }

  return {
    title,
    subtitle: fitText(chunks[0] ?? title, 140),
    cards,
    notes: [
      tone
        ? `Tono sugerido: ${tone}`
        : "Resumen creado a partir del texto de entrada",
      "La estructura prioriza variedad de slides sin perder continuidad narrativa",
    ],
  };
}

function buildSectionSlide(
  title: string,
  chunk: string,
  keywords: string[],
  audience?: string,
): Record<string, unknown> {
  return {
    sectionNumber: "01",
    sectionLabel: audience ? fitText(audience, 80) : "Desarrollo",
    title,
    paragraph: fitText(chunk, 220),
    tags: (keywords.length > 0 ? keywords : splitSummary(chunk, 6)).slice(0, 6),
  };
}

function buildContentSlide(
  layout: string,
  chunk: string,
  title: string,
  allChunks: string[],
  index: number,
): Record<string, unknown> {
  const summary = fitText(chunk, 380);
  const neighbor = fitText(
    allChunks[index + 1] ?? allChunks[index] ?? chunk,
    220,
  );

  switch (layout) {
    case "title_1_paragraph":
      return {
        title: fitText(title, 80),
        paragraph: summary,
      };
    case "title_2_paragraphs":
      return {
        title: fitText(title, 80),
        paragraphs: splitSummary(summary, 2),
      };
    case "title_paragraph_3_blocks":
      return {
        title: fitText(title, 80),
        paragraph: summary,
        blocks: buildBlocks(chunk, 3),
      };
    case "title_paragraph_4_blocks":
      return {
        title: fitText(title, 80),
        paragraph: summary,
        blocks: buildBlocks(chunk, 4),
      };
    case "title_paragraph_5_rows":
      return {
        title: fitText(title, 80),
        paragraph: summary,
        rows: buildRows(chunk, 5),
      };
    case "title_subtitle_3_steps_side_paragraph":
      return {
        title: fitText(title, 80),
        subtitle: fitText(summary, 120),
        steps: buildSteps(chunk, 3),
        sideParagraph: neighbor,
      };
    case "title_3_resource_cards":
      return {
        title: fitText(title, 80),
        cards: buildCards(chunk, 3),
      };
    case "title_4_resource_cards":
      return {
        title: fitText(title, 80),
        cards: buildCards(chunk, 4),
      };
    case "title_3_paragraphs_contact":
      return {
        title: fitText(title, 80),
        paragraphs: splitIntoParagraphs(summary, 3),
        contact:
          "Si quieres, puedo convertir este esquema en un JSON listo para renderizar o ajustar el ritmo de las slides.",
      };
    default:
      return {
        title: fitText(title, 80),
        paragraph: summary,
      };
  }
}

export class SlidePlanService {
  async generatePlan(input: SlidePlanRequestInput): Promise<{
    version: string;
    templateId: string;
    metadata: SlideSchemaDefinition["metadata"] & { generatedAt: string };
    layoutCatalog: SlideSchemaDefinition["layoutCatalog"];
    slides: Array<{
      index: number;
      id: string;
      layout: string;
      content: Record<string, unknown>;
    }>;
  }> {
    const text = normalizeText(input.text);
    const sentenceList = splitSentences(text);
    const slideCount = estimateSlideCount(text, sentenceList.length);
    const selectedSlides = slideSchema.slides.slice(0, slideCount);
    const contentSlideCount = Math.max(1, selectedSlides.length - 3);
    const chunks = splitIntoExactChunks(
      sentenceList.length > 0 ? sentenceList : [text],
      contentSlideCount,
    );
    const title = fitText(input.title ?? inferTitle(text), 80);
    const keywords = extractKeywords(text, 8);

    let slides: Array<{
      index: number;
      id: string;
      layout: string;
      content: Record<string, unknown>;
    }> = [];

    // If OPENAI_API_KEY is present, attempt to generate readable slide content via OpenAI.
    if (env.OPENAI_API_KEY) {
      try {
        const aiSlides = await generateWithOpenAI(
          text,
          selectedSlides,
          chunks,
          title,
          keywords,
          input,
        );

        if (
          Array.isArray(aiSlides) &&
          aiSlides.length === selectedSlides.length
        ) {
          slides = aiSlides.map((s, idx) => ({
            index: selectedSlides[idx].index,
            id: selectedSlides[idx].id,
            layout: selectedSlides[idx].layout,
            content: s.content,
          }));
        }
      } catch (err) {
        // If any error occurs, fall back to local deterministic generator below.
        // eslint-disable-next-line no-console
        console.warn(
          "OpenAI generation failed, falling back to local generator:",
          (err as any)?.message ?? err,
        );
      }
    }

    // If AI generation did not produce slides, use local generator.
    if (slides.length === 0) {
      slides = selectedSlides.map((slide, index) => {
        if (index === 0) {
          return {
            ...slide,
            content: buildCoverSlide(title, chunks, keywords, input.tone),
          };
        }

        if (index === 1) {
          return {
            ...slide,
            content: buildSectionSlide(
              title,
              chunks[0] ?? text,
              keywords,
              input.audience,
            ),
          };
        }

        if (index === selectedSlides.length - 1) {
          return {
            ...slide,
            content: buildContentSlide(
              slide.layout,
              chunks[chunks.length - 1] ?? text,
              title,
              chunks,
              chunks.length - 1,
            ),
          };
        }

        const contentIndex = Math.min(index - 2, chunks.length - 1);
        return {
          ...slide,
          content: buildContentSlide(
            slide.layout,
            chunks[contentIndex] ?? text,
            title,
            chunks,
            contentIndex,
          ),
        };
      });
    }

    return {
      version: slideSchema.version,
      templateId: slideSchema.templateId,
      metadata: {
        ...slideSchema.metadata,
        name: title,
        generatedAt: new Date().toISOString(),
      },
      layoutCatalog: slideSchema.layoutCatalog,
      slides,
    };
  }

  async generateEditorTemplate(
    input: SlidePlanRequestInput,
  ): Promise<EditorTemplateResponse> {
    const plan = await this.generatePlan(input);
    return buildEditorTemplateFromPlan(plan, { text: input.text });
  }
}

async function generateWithOpenAI(
  text: string,
  selectedSlides: Array<{ index: number; id: string; layout: string }>,
  chunks: string[],
  title: string,
  keywords: string[],
  input: SlidePlanRequestInput,
): Promise<Array<{ content: Record<string, unknown> }>> {
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  // Build a compact instructions object describing expected fields per layout.
  const layoutSpecs: Record<string, { keys: string[] }> = {};
  for (const [layoutId, spec] of Object.entries(slideSchema.layoutCatalog)) {
    layoutSpecs[layoutId] = { keys: spec.fields.map((f) => f.key) };
  }

  const prompts = [] as string[];
  prompts.push(
    "Eres un asistente que convierte un texto en un esquema de slides.",
  );
  prompts.push(
    "Devuelve SOLO JSON válido. No incluyas explicaciones ni texto adicional.",
  );
  prompts.push(`Esquema: ${JSON.stringify(layoutSpecs)}`);
  prompts.push(`Entrada (texto): ${text.slice(0, 4000)}`);
  prompts.push(`Titulo sugerido: ${title}`);
  prompts.push(`Palabras clave: ${keywords.join(", ")}`);
  prompts.push(
    `Slides a generar: ${selectedSlides.map((s) => s.layout).join(", ")}`,
  );
  prompts.push(
    "Para cada slide, devuelve un objeto con { index, id, layout, content } donde content contiene solo las claves esperadas para ese layout, con textos legibles en español, oraciones completas cuando sea posible, sin puntos suspensivos y con longitud razonable (no más de 420 caracteres por campo largo).",
  );

  // Include chunks as context for content generation for slides that map to specific chunks.
  prompts.push(`Chunks: ${JSON.stringify(chunks.slice(0, 40))}`);

  const system = prompts.join("\n");

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: "Genera el JSON solicitado" },
    ],
    temperature: 0.2,
    max_tokens: 2000,
  });

  const anyResp: any = response;
  const textOutput =
    anyResp.choices?.[0]?.message?.content ?? anyResp.choices?.[0]?.text;
  if (!textOutput) throw new Error("OpenAI returned empty response");

  // Try to parse JSON from the model output. Be permissive and extract first JSON object/array.
  const match = textOutput.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (!match) throw new Error("No JSON found in OpenAI response");

  const parsed = JSON.parse(match[0]);
  // Expect { slides: [...] } or an array directly
  const slidesArray = Array.isArray(parsed) ? parsed : (parsed.slides ?? []);
  return slidesArray.map((s: any) => ({ content: s.content ?? {} }));
}
