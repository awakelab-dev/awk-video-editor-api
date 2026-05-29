import { readFileSync } from "fs";
import path from "path";
import type { SummaryResponse } from "../../types/summary";
import {
  buildInitialEditorState,
  generateProjectId,
  type ProjectDocument,
  type ProjectElement,
  type ProjectTrack,
} from "../../domain/projects";
import { persistProjectDocument } from "./slideTracks.persistence";

type TemplateTextGuidance = {
  currentChars?: number;
  recommendedMinChars?: number;
  recommendedMaxChars?: number;
  recommendedTargetChars?: number;
  recommendedLineCount?: number;
  maxHeight?: number;
  notes?: string;
};

type TemplateElement = {
  id: string;
  type: string;
  name?: string;
  text?: string;
  startTime?: number;
  duration?: number;
  maxHeight?: number;
  editableFields?: string[];
  textEditGuidance?: TemplateTextGuidance;
  [key: string]: unknown;
};

type TemplateTrack = {
  id: string;
  name: string;
  kind?: string;
  elements: TemplateElement[];
};

type TemplateDocument = {
  id: string;
  name: string;
  description?: string;
  durationSeconds: number;
  resolution: { w: number; h: number };
  slides?: number;
  tracks: TemplateTrack[];
  textBlockGuidelines?: Array<{
    id: string;
    name: string;
    slideIndex?: number;
    currentChars?: number;
    recommendedMinChars?: number;
    recommendedMaxChars?: number;
    recommendedTargetChars?: number;
    recommendedLineCount?: number;
    maxHeight?: number;
    notes?: string;
  }>;
};

type SlideNarrative = {
  title: string;
  subtitle: string;
  body: string;
  bullets: string[];
  takeaway: string;
  note: string;
  badge: string;
  quote: string;
  caption: string;
  cards: string[];
  steps: string[];
};

const TEMPLATE_JSON_PATH = path.resolve(
  process.cwd(),
  "docs",
  "slide-template.json",
);
const TEMPLATE_MD_PATH = path.resolve(
  process.cwd(),
  "docs",
  "slide-template.md",
);

let cachedTemplate: TemplateDocument | null = null;

function loadTemplate(): TemplateDocument {
  if (!cachedTemplate) {
    const rawJson = readFileSync(TEMPLATE_JSON_PATH, "utf8").trim();
    if (rawJson) {
      try {
        cachedTemplate = JSON.parse(rawJson) as TemplateDocument;
      } catch {
        cachedTemplate = loadTemplateFromMarkdown();
      }
    } else {
      cachedTemplate = loadTemplateFromMarkdown();
    }
  }

  return cachedTemplate;
}

function loadTemplateFromMarkdown(): TemplateDocument {
  const rawMarkdown = readFileSync(TEMPLATE_MD_PATH, "utf8");
  const startMarker =
    "export const presentationTemplates: PresentationProject[] = [";
  const endMarker =
    "export const presentationProjects: PresentationProject[] = [";
  const startIndex = rawMarkdown.indexOf(startMarker);
  const endIndex = rawMarkdown.indexOf(
    endMarker,
    startIndex + startMarker.length,
  );

  if (startIndex === -1 || endIndex === -1) {
    throw new Error("Could not load slide template from markdown fallback");
  }

  const objectSource = extractFirstObjectLiteral(
    rawMarkdown.slice(startIndex + startMarker.length, endIndex),
  );

  const scope = new Proxy(
    {
      heroImage: "hero.png",
      checkMarkIcon: "check-mark.svg",
      databaseSearchIcon: "database-search.svg",
      gitMergeIcon: "git-merge.svg",
      targetIcon: "target.svg",
      TEXT_TRACK_ID: "track-text",
      AUDIO_TRACK_ID: "track-audio",
      MEDIA_TRACK_ID: "track-media",
      TEXT_TRACK_NAME: "Textos",
      AUDIO_TRACK_NAME: "Audio",
      MEDIA_TRACK_NAME: "Media",
      SQL_TEMPLATE_SLIDE_DURATION: 12,
      SQL_TEMPLATE_RESOLUTION: { w: 1024, h: 576 },
      createTextElement: (overrides: any) => {
        const { id, name, text, startTime, duration, maxHeight, ...rest } =
          overrides;
        const resolvedHeight = rest.height ?? 160;
        return {
          id,
          type: "text",
          name,
          startTime,
          duration,
          maxHeight: maxHeight ?? resolvedHeight,
          opacity: 1,
          effects: [],
          x: 180,
          y: 160,
          width: 1560,
          height: resolvedHeight,
          rotation: 0,
          text,
          fontFamily: "Inter",
          fontSize: 68,
          fontWeight: 700,
          textColor: "#ffffff",
          backgroundColor: "transparent",
          lineHeight: 1.08,
          letterSpacing: 0,
          textAlign: "left",
          ...rest,
        };
      },
      createShapeElement: (overrides: any) => {
        const { id, name, startTime, duration, ...rest } = overrides;
        return {
          id,
          type: "shape",
          name,
          startTime,
          duration,
          opacity: 1,
          effects: [],
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          rotation: 0,
          shapeType: "rectangle",
          fillColor: "#111827",
          strokeColor: "transparent",
          strokeWidth: 0,
          cornerRadius: 0,
          ...rest,
        };
      },
      createImageElement: (overrides: any) => {
        const { id, name, source, startTime, duration, ...rest } = overrides;
        return {
          id,
          type: "image",
          name,
          source,
          startTime,
          duration,
          opacity: 1,
          effects: [],
          x: 980,
          y: 170,
          width: 760,
          height: 760,
          rotation: 0,
          fit: "cover",
          borderWidth: 0,
          borderColor: "transparent",
          ...rest,
        };
      },
      createSqlText: (slideIndex: number, overrides: any) => ({
        ...scope.createTextElement({
          startTime: slideIndex * 12,
          duration: 12,
          fontFamily: "Inter, Arial, sans-serif",
          fontSize: 32,
          fontWeight: 700,
          textColor: "#111827",
          backgroundColor: "transparent",
          lineHeight: 1.25,
          width: 760,
          height: 70,
          x: 60,
          y: 64,
          ...overrides,
        }),
      }),
      createSqlShape: (slideIndex: number, overrides: any) => ({
        ...scope.createShapeElement({
          startTime: slideIndex * 12,
          duration: 12,
          fillColor: "#eefdfa",
          strokeColor: "#b7f3ea",
          strokeWidth: 1,
          cornerRadius: 12,
          ...overrides,
        }),
      }),
      createSqlIcon: (slideIndex: number, overrides: any) => ({
        ...scope.createImageElement({
          startTime: slideIndex * 12,
          duration: 12,
          x: 0,
          y: 0,
          width: 24,
          height: 24,
          fit: "contain",
          borderWidth: 0,
          borderColor: "transparent",
          ...overrides,
        }),
      }),
      createSqlBackground: (slideIndex: number) => [
        scope.createSqlShape(slideIndex, {
          id: `sql-bg-${slideIndex}`,
          name: `Fondo SQL ${slideIndex + 1}`,
          x: 0,
          y: 0,
          width: 1024,
          height: 576,
          fillColor: "#fbfffe",
          strokeColor: "#b7f3ea",
          strokeWidth: 1,
          cornerRadius: 14,
        }),
      ],
    },
    {
      has: (target, prop) => {
        if (typeof prop !== "string") {
          return false;
        }

        return prop in target || prop in globalThis;
      },
      get: (target, prop) => {
        if (typeof prop === "string" && prop in target) {
          return (target as Record<string, unknown>)[prop];
        }

        if (typeof prop === "string" && prop in globalThis) {
          return (globalThis as Record<string, unknown>)[prop];
        }

        return typeof prop === "string" ? prop : undefined;
      },
    },
  );

  const firstTemplate = new Function(
    "scope",
    `with (scope) { return (${objectSource}) }`,
  )(scope) as TemplateDocument;

  if (!firstTemplate) {
    throw new Error("Markdown slide template fallback was empty");
  }

  return firstTemplate;
}

function extractFirstObjectLiteral(source: string): string {
  const startIndex = source.indexOf("{");
  if (startIndex === -1) {
    throw new Error("Template object start not found");
  }

  let depth = 0;
  let inString = false;
  let quote = "";
  let escapeNext = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        escapeNext = true;
        continue;
      }

      if (char === quote) {
        inString = false;
        quote = "";
      }

      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      inString = true;
      quote = char;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  throw new Error("Template object end not found");
}

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function estimateLineCountFromHeight(maxHeight?: number): number {
  if (
    typeof maxHeight !== "number" ||
    Number.isNaN(maxHeight) ||
    maxHeight <= 0
  ) {
    return 1;
  }

  if (maxHeight <= 100) return 1;
  if (maxHeight <= 180) return 2;
  if (maxHeight <= 260) return 3;
  return 4;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => collapseSpaces(value)).filter(Boolean)),
  );
}

function bulletWithDetail(title: string, detail: string): string {
  const headline = collapseSpaces(title) || "Punto clave";
  const body = collapseSpaces(detail);

  if (!body || body === headline) {
    return headline;
  }

  return `${headline}\n${body}`;
}

function summaryContext(slide?: {
  title: string;
  summary: string;
  speakerNotes?: string;
  bullets: string[];
}): string {
  if (!slide) {
    return "";
  }

  return uniqueStrings([
    slide.summary,
    slide.speakerNotes ?? "",
    slide.bullets.join(" "),
  ]).join(" ");
}

function trimToMaxChars(value: string, maxChars: number): string {
  const normalized = collapseSpaces(value);
  if (normalized.length <= maxChars) return normalized;

  const slice = normalized.slice(0, maxChars + 1);
  const cutAt = slice.lastIndexOf(" ");
  if (cutAt <= 0) return normalized.slice(0, maxChars).trim();
  return slice.slice(0, cutAt).trim();
}

function wrapByLines(
  value: string,
  lineCount: number,
  targetChars: number,
): string {
  const normalized = collapseSpaces(value);
  if (!normalized) return "";
  if (lineCount <= 1) return normalized;

  const words = normalized.split(" ");
  const maxPerLine = Math.max(12, Math.ceil(targetChars / lineCount));
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length <= maxPerLine) {
      current = next;
      continue;
    }

    if (current) {
      lines.push(current);
      current = "";
    }

    if (word.length > maxPerLine) {
      lines.push(word.slice(0, maxPerLine));
    } else {
      current = word;
    }

    if (lines.length >= lineCount) break;
  }

  if (current && lines.length < lineCount) {
    lines.push(current);
  }

  return lines.slice(0, lineCount).join("\n");
}

function formatForGuidance(
  value: string,
  guidance?: TemplateTextGuidance,
): string {
  const normalized = collapseSpaces(value);
  if (!guidance) return normalized;

  const target =
    guidance.recommendedTargetChars ??
    guidance.currentChars ??
    normalized.length;
  const maxChars =
    guidance.recommendedMaxChars ?? Math.max(target, normalized.length);
  const lineCount =
    guidance.recommendedLineCount ??
    estimateLineCountFromHeight(guidance.maxHeight);

  let candidate = normalized;
  if (candidate.length > maxChars) {
    candidate = trimToMaxChars(candidate, maxChars);
  }

  if (lineCount > 1) {
    candidate = wrapByLines(candidate, lineCount, target);
  }

  return candidate;
}

function uniqueKeywords(summary: SummaryResponse): string[] {
  const keywords = summary.slides.flatMap((slide) => slide.keywords);
  return Array.from(
    new Set(keywords.map((keyword) => collapseSpaces(keyword)).filter(Boolean)),
  );
}

function pickSummarySlide(summary: SummaryResponse, index: number) {
  if (summary.slides.length === 0) {
    return undefined;
  }

  return summary.slides[index % summary.slides.length];
}

function buildSlideNarratives(summary: SummaryResponse): SlideNarrative[] {
  const slides = summary.slides.length > 0 ? summary.slides : [];
  const keywords = uniqueKeywords(summary);
  const first = slides[0];
  const second = slides[1] ?? first;
  const third = slides[2] ?? second ?? first;
  const fourth = slides[3] ?? third ?? second ?? first;

  const slideOne = first;
  const slideTwo = second;
  const slideThree = third;
  const slideFour = fourth;
  const firstContext = summaryContext(slideOne);
  const secondContext = summaryContext(slideTwo);
  const thirdContext = summaryContext(slideThree);
  const fourthContext = summaryContext(slideFour);

  return [
    {
      title: summary.title,
      subtitle: slideOne
        ? slideOne.summary
        : "Resumen convertido en un proyecto editable.",
      body: slideOne
        ? bulletWithDetail(slideOne.title, firstContext || summary.title)
        : bulletWithDetail(
            summary.title,
            "Proyecto editable y listo para adaptar.",
          ),
      bullets: slideOne
        ? [
            bulletWithDetail(
              slideOne.bullets[0] ?? slideOne.title,
              firstContext || summary.title,
            ),
            bulletWithDetail(
              slideOne.bullets[1] ?? "Desarrollar la idea",
              slideOne.speakerNotes ?? slideOne.summary ?? summary.title,
            ),
            bulletWithDetail(
              slideOne.bullets[2] ?? "Cerrar el bloque",
              `Este bloque de entrada prepara el recorrido del proyecto ${summary.title}.`,
            ),
          ]
        : [
            bulletWithDetail(
              summary.title,
              "Proyecto editable y listo para usar.",
            ),
            bulletWithDetail(
              "Idea central",
              "Resume el valor principal en una sola frase.",
            ),
            bulletWithDetail(
              "Siguiente paso",
              "Convierte el resumen en una estructura visual.",
            ),
          ],
      takeaway: slideOne
        ? bulletWithDetail(
            "Lectura inicial",
            slideOne.speakerNotes ?? slideOne.summary ?? summary.title,
          )
        : bulletWithDetail("Lectura inicial", summary.title),
      note: "Plantilla base con la portada y bloques editables.",
      badge: "PROYECTO EDITABLE",
      quote: `"${summary.title}"`,
      caption: "Punto de entrada del proyecto generado.",
      cards: [
        `FUENTE\n${slideOne?.title ?? summary.title}`,
        `OBJETIVO\n${slideTwo?.title ?? "Sintesis visual"}`,
        `ESTADO\n${slideThree?.title ?? "Listo para editar"}`,
      ],
      steps: ["1", "2", "3", "4", "5"],
    },
    {
      title: "Mapa del contenido",
      subtitle: slideOne?.title ?? summary.title,
      body: bulletWithDetail(
        "Organizamos el contenido",
        "en bloques visuales que facilitan la lectura y la edición posterior.",
      ),
      bullets: slides.slice(0, 3).map((slide, index) => {
        const detail =
          summaryContext(slide) || `Bloque ${index + 1} del recorrido.`;
        return bulletWithDetail(slide.title, detail);
      }),
      takeaway: bulletWithDetail(
        "Secuencia clara",
        "evita repetir ideas y ayuda a recorrer el proyecto sin saltos.",
      ),
      note: "Esta diapositiva conecta los temas principales con una vista panoramica.",
      badge: "MAPA",
      quote: "Estructura primero, detalle despues.",
      caption: "Bloques de contexto, relacion y analisis.",
      cards: [
        `Consultar\n${slideOne?.summary ?? summary.title}`,
        `Relacionar\n${slideTwo?.summary ?? summary.title}`,
        `Analizar\n${slideThree?.summary ?? summary.title}`,
      ],
      steps: ["1", "2", "3", "4", "5"],
    },
    {
      title: "Objetivos del contenido",
      subtitle: "Lo que deberia entenderse al terminar la lectura.",
      body: slides
        .slice(0, 4)
        .map((slide) => bulletWithDetail(slide.title, summaryContext(slide)))
        .join(" "),
      bullets:
        keywords.slice(0, 4).length > 0
          ? keywords
              .slice(0, 4)
              .map((keyword, index) =>
                bulletWithDetail(
                  keyword,
                  [slideOne, slideTwo, slideThree, slideFour][index]
                    ? summaryContext(
                        [slideOne, slideTwo, slideThree, slideFour][index],
                      )
                    : `Se convierte en una meta concreta del proyecto.`,
                ),
              )
          : [
              bulletWithDetail(
                summary.title,
                "Define el objetivo general del proyecto.",
              ),
            ],
      takeaway: bulletWithDetail(
        "Cada bloque",
        "debe resolver una pregunta concreta y avanzar el relato.",
      ),
      note: "La plantilla usa tarjetas de objetivos para repartir la intencion del mensaje.",
      badge: "OBJETIVOS",
      quote: "El valor esta en que cada bloque tiene un proposito.",
      caption: "Objetivos distribuidos por secciones.",
      cards: [
        `Dominar\n${slideOne?.title ?? "el concepto base"}`,
        `Aplicar\n${slideTwo?.title ?? "con criterio"}`,
        `Recordar\n${slideThree?.title ?? "las ideas clave"}`,
        `Verificar\n${slideFour?.title ?? "el resultado final"}`,
      ],
      steps: ["A", "B", "C", "D", "E"],
    },
    {
      title: "Conceptos esenciales",
      subtitle: "Definiciones y principios que sostienen el resto de slides.",
      body: slides
        .map((slide) => bulletWithDetail(slide.title, summaryContext(slide)))
        .slice(0, 2)
        .join(" "),
      bullets: slides
        .flatMap((slide) =>
          slide.bullets.map((bullet) =>
            bulletWithDetail(
              bullet,
              slide.summary ?? slide.speakerNotes ?? summary.title,
            ),
          ),
        )
        .slice(0, 4),
      takeaway: keywords[0]
        ? bulletWithDetail("Idea principal", keywords[0])
        : bulletWithDetail("Idea principal", summary.title),
      note: "Aqui la plantilla usa bloques cortos para reforzar conceptos puntuales.",
      badge: "CONCEPTOS",
      quote: keywords[1] ? `"${keywords[1]}"` : `"${summary.title}"`,
      caption: "Bloques breves para fijar terminologia.",
      cards: [
        `Tablas\n${slideOne?.title ?? "Organizacion de datos"}`,
        `Claves\n${slideTwo?.title ?? "Relaciones claras"}`,
        `Consultas\n${slideThree?.title ?? "Recuperar informacion"}`,
        `Filtros\n${slideFour?.title ?? "Limitar resultados"}`,
      ],
      steps: ["I", "II", "III", "IV", "V"],
    },
    {
      title: "Estructura del contenido",
      subtitle: "Como se organiza la explicacion de principio a fin.",
      body: slides
        .map((slide) => bulletWithDetail(slide.title, summaryContext(slide)))
        .join(" "),
      bullets: [
        bulletWithDetail(
          "Entrada",
          "Define el punto de partida y el contexto.",
        ),
        bulletWithDetail(
          "Proceso",
          "Explica como se transforma la informacion.",
        ),
        bulletWithDetail("Salida", "Muestra el resultado o la decision final."),
        bulletWithDetail("Revision", "Cierra con una comprobacion util."),
      ],
      takeaway: bulletWithDetail("Estructurar", "ayuda a evitar redundancias."),
      note: "Separa el origen de datos, la transformacion y la salida esperada.",
      badge: "ESTRUCTURA",
      quote: "Primero la secuencia, luego el detalle.",
      caption: "Bloques de consulta y filtrado.",
      cards: [
        `SELECT\n${slideOne?.title ?? "Seleccion de ideas"}`,
        `FROM / WHERE\n${slideTwo?.title ?? "Origen y criterio"}`,
      ],
      steps: ["0", "1", "2", "3", "4"],
    },
    {
      title: "Apoyo visual",
      subtitle: "Los elementos graficos ayudan a sostener el mensaje.",
      body: slides
        .slice(0, 3)
        .map((slide) => bulletWithDetail(slide.title, summaryContext(slide)))
        .join(" "),
      bullets: [
        bulletWithDetail(
          "Diagramas",
          "Reducen la carga de texto y aclaran relaciones.",
        ),
        bulletWithDetail(
          "Tarjetas",
          "Separan cada idea para que pueda leerse de forma rapida.",
        ),
        bulletWithDetail(
          "Notas",
          "Recogen contexto breve para apoyar la lectura principal.",
        ),
        bulletWithDetail(
          "Referencias",
          "Permiten volver al material de apoyo sin perder el hilo.",
        ),
      ],
      takeaway: bulletWithDetail("Lo visual", "reduce friccion en la lectura."),
      note: "La plantilla reserva una zona para lectura auxiliar y otra para el apoyo grafico.",
      badge: "VISUAL",
      quote: "Mostrar el contexto facilita entender el cambio.",
      caption: "Lectura auxiliar para orientar la mirada.",
      cards: [
        `Notas\n${slideOne?.speakerNotes ?? summary.title}`,
        `Diagrama\n${slideTwo?.title ?? "Relacion de ideas"}`,
        `Referencia\n${slideThree?.title ?? "Punto de apoyo"}`,
      ],
      steps: ["V1", "V2", "V3", "V4", "V5"],
    },
    {
      title: "Idea clave",
      subtitle: "Una frase para recordar el valor central del proyecto.",
      body: slides
        .slice(0, 2)
        .map((slide) => bulletWithDetail(slide.title, summaryContext(slide)))
        .join(" "),
      bullets:
        keywords.slice(0, 3).length > 0
          ? keywords
              .slice(0, 3)
              .map((keyword, index) =>
                bulletWithDetail(
                  keyword,
                  [slideOne, slideTwo, slideThree][index]
                    ? summaryContext([slideOne, slideTwo, slideThree][index])
                    : "Resume el valor principal del proyecto.",
                ),
              )
          : [
              bulletWithDetail(
                summary.title,
                "Resume el valor principal del proyecto.",
              ),
            ],
      takeaway: bulletWithDetail(
        "Si el mensaje se recuerda",
        "el proyecto funciona.",
      ),
      note: "La plantilla usa una frase central con una tarjeta de apoyo.",
      badge: "IDEA CLAVE",
      quote: `"${slideOne?.title ?? summary.title}"`,
      caption: "Una sola idea bien presentada vale mas que varias repetidas.",
      cards: [
        `Principio\n${slideOne?.title ?? summary.title}`,
        `Sentido\n${slideTwo?.summary ?? summary.title}`,
      ],
      steps: ["K1", "K2", "K3", "K4", "K5"],
    },
    {
      title: "Ejemplo aplicado",
      subtitle: "Mostramos el caso en contexto, problema y resultado.",
      body: slides
        .slice(0, 3)
        .map((slide) => bulletWithDetail(slide.title, summaryContext(slide)))
        .join(" "),
      bullets: [
        bulletWithDetail("Contexto", slideOne?.summary ?? summary.title),
        bulletWithDetail("Problema", slideTwo?.summary ?? summary.title),
        bulletWithDetail("Resultado", slideThree?.summary ?? summary.title),
        bulletWithDetail("Leccion", slideFour?.summary ?? summary.title),
      ],
      takeaway: bulletWithDetail("La aplicacion", "aterriza los conceptos."),
      note: "La plantilla de ejemplo deja espacio para una narrativa de tres bloques.",
      badge: "EJEMPLO",
      quote: "Ver el cambio en accion aclara la teoria.",
      caption: "Caso aplicado con lectura secuencial.",
      cards: [
        `Contexto\n${slideOne?.title ?? summary.title}`,
        `Problema\n${slideTwo?.summary ?? summary.title}`,
        `Resultado\n${slideThree?.summary ?? summary.title}`,
      ],
      steps: ["C", "P", "R", "L", "A"],
    },
    {
      title: "Flujo de trabajo",
      subtitle: "La secuencia minima para ejecutar el proceso sin perderse.",
      body: slides
        .map((slide) => bulletWithDetail(slide.title, summaryContext(slide)))
        .slice(0, 4)
        .join(" "),
      bullets: [
        bulletWithDetail(
          "Preparar",
          "Reune datos, criterios y referencias antes de avanzar.",
        ),
        bulletWithDetail(
          "Ejecutar",
          "Aplica la secuencia y produce el primer resultado.",
        ),
        bulletWithDetail(
          "Validar",
          "Comprueba que la salida responda a lo esperado.",
        ),
        bulletWithDetail(
          "Ajustar",
          "Corrige detalles y repite el ciclo si hace falta.",
        ),
      ],
      takeaway: bulletWithDetail("Un flujo claro", "evita pasos omitidos."),
      note: "La plantilla de flujo funciona bien para procesos, rutas y secuencias.",
      badge: "FLUJO",
      quote: "El orden reduce errores.",
      caption: "Paso a paso para no perder trazabilidad.",
      cards: [
        `1\n${slideOne?.title ?? "Inicio"}`,
        `2\n${slideTwo?.title ?? "Proceso"}`,
        `3\n${slideThree?.title ?? "Revision"}`,
        `4\n${slideFour?.title ?? "Cierre"}`,
        `5\n${keywords[0] ?? "Seguimiento"}`,
      ],
      steps: ["1", "2", "3", "4", "5"],
    },
    {
      title: "Actividad guiada",
      subtitle: "Plantea una practica para consolidar el contenido.",
      body: bulletWithDetail(
        "La actividad",
        "sirve para comprobar si el lector puede reproducir el proceso de forma autonoma.",
      ),
      bullets: [
        bulletWithDetail(
          "Preparar",
          "Revisa el material y organiza los datos de trabajo.",
        ),
        bulletWithDetail(
          "Resolver",
          "Construye la respuesta paso a paso con criterio.",
        ),
        bulletWithDetail(
          "Revisar",
          "Comprueba errores, huecos y oportunidades de mejora.",
        ),
        bulletWithDetail(
          "Compartir",
          "Explica el resultado para recibir feedback util.",
        ),
      ],
      takeaway: bulletWithDetail("Practicar", "fija el aprendizaje."),
      note: "La plantilla separa el reto individual del encuadre general.",
      badge: "ACTIVIDAD",
      quote: "Aprender haciendo acelera la retencion.",
      caption: "Trabajo individual con una consigna concreta.",
      cards: [
        `Reto\n${slideOne?.title ?? summary.title}`,
        `Pista\n${slideTwo?.summary ?? summary.title}`,
        `Entrega\n${slideThree?.summary ?? summary.title}`,
      ],
      steps: ["R1", "R2", "R3", "R4", "R5"],
    },
    {
      title: "Recapitulacion",
      subtitle: "Volvemos a los puntos principales antes de cerrar.",
      body: slides
        .slice(0, 4)
        .map((slide) => bulletWithDetail(slide.title, summaryContext(slide)))
        .join(" "),
      bullets: slides
        .slice(0, 4)
        .map((slide) => bulletWithDetail(slide.title, summaryContext(slide))),
      takeaway: bulletWithDetail("Repetir sin duplicar", "pero en otra forma."),
      note: "Esta slide suele ser la mas util para condensar el valor del proyecto.",
      badge: "RECAP",
      quote: "Lo importante ya aparecio; ahora lo ordenamos.",
      caption: "Repaso sintetico con espacio para conclusiones.",
      cards: [
        `Punto 1\n${slideOne?.title ?? summary.title}`,
        `Punto 2\n${slideTwo?.title ?? summary.title}`,
        `Punto 3\n${slideThree?.title ?? summary.title}`,
      ],
      steps: ["R1", "R2", "R3", "R4", "R5"],
    },
    {
      title: "Conclusiones",
      subtitle: "Sintesis final con el aprendizaje principal.",
      body: slides
        .slice(0, 4)
        .map((slide) =>
          bulletWithDetail(slide.title, slide.speakerNotes ?? slide.summary),
        )
        .join(" "),
      bullets: keywords
        .slice(0, 4)
        .map((keyword) =>
          bulletWithDetail(
            keyword,
            "Recupera el aprendizaje principal del recorrido.",
          ),
        ),
      takeaway: bulletWithDetail(
        "La conclusion",
        "debe dejar una sola idea fuerte.",
      ),
      note: "La slide de conclusiones cierra el relato con un mensaje compacto.",
      badge: "CIERRE",
      quote: `"${summary.title}"`,
      caption: "Resumen final del recorrido.",
      cards: [
        `Conclusiones\n${slideOne?.summary ?? summary.title}`,
        `Proxima accion\n${slideTwo?.summary ?? summary.title}`,
      ],
      steps: ["F1", "F2", "F3", "F4", "F5"],
    },
    {
      title: "Recursos",
      subtitle: "Referencias y puntos de apoyo para continuar.",
      body: bulletWithDetail(
        "Los recursos",
        "ayudan a seguir profundizando una vez terminado el recorrido.",
      ),
      bullets:
        keywords.slice(0, 4).length > 0
          ? keywords
              .slice(0, 4)
              .map((keyword) =>
                bulletWithDetail(
                  keyword,
                  "Sirve como referencia para seguir explorando.",
                ),
              )
          : [
              bulletWithDetail(
                "Referencia",
                "Sirve como apoyo para volver al tema principal.",
              ),
              bulletWithDetail(
                "Apoyo",
                "Permite profundizar sin perder el contexto.",
              ),
              bulletWithDetail("Revision", "Facilita comprobar lo aprendido."),
              bulletWithDetail("Prueba", "Ayuda a validar el siguiente paso."),
            ],
      takeaway: bulletWithDetail(
        "Deja recursos",
        "que permitan seguir explorando.",
      ),
      note: "La slide de recursos puede incluir referencias, glosario o pasos siguientes.",
      badge: "RECURSOS",
      quote: "Volver al material de base acelera la revision.",
      caption: "Glosario y palabras clave del contenido.",
      cards: [
        `GUIA\n${slideOne?.title ?? summary.title}\n${slideOne?.summary ?? "Sintetiza el tema principal y ofrece una referencia rapida."}`,
        `CHECKLIST\n${slideTwo?.title ?? "Buenas practicas"}\n${slideTwo?.summary ?? "Revisa formato, consistencia y siguientes acciones."}`,
        `DOCUMENTO\n${slideThree?.title ?? "Lectura de apoyo"}\n${slideThree?.summary ?? "Amplia la idea principal con contexto adicional."}`,
        `LECTURA\n${slideFour?.title ?? "Proxima revision"}\n${slideFour?.summary ?? "Deja una pista clara para continuar trabajando el tema."}`,
      ],
      steps: ["D1", "D2", "D3", "D4", "D5"],
    },
    {
      title: "Siguiente paso",
      subtitle: "Una invitacion breve para continuar el trabajo.",
      body: bulletWithDetail(
        "Cierra con una accion concreta",
        "y un mensaje de continuidad que no repita la portada.",
      ),
      bullets: [
        bulletWithDetail(
          "Editar",
          "Ajusta el contenido al contexto real del proyecto.",
        ),
        bulletWithDetail(
          "Validar",
          "Revisa el resultado con datos o ejemplos reales.",
        ),
        bulletWithDetail(
          "Compartir",
          "Muestra la version actual y recoge feedback.",
        ),
        bulletWithDetail(
          "Iterar",
          "Aplica mejoras sobre el texto y la estructura.",
        ),
      ],
      takeaway: bulletWithDetail(
        "El cierre",
        "debe empujar a una siguiente accion.",
      ),
      note: bulletWithDetail(
        "La ultima slide",
        "deja espacio para contacto, seguimiento y una llamada clara a la accion.",
      ),
      badge: "SIGUIENTE",
      quote: "Cerrar es tambien abrir la siguiente iteracion.",
      caption: "Final con llamada a la accion.",
      cards: [
        `Contacto\n${slideOne?.title ?? summary.title}`,
        `Revision\n${slideTwo?.summary ?? summary.title}`,
        `Nota\n${slideThree?.summary ?? summary.title}`,
      ],
      steps: ["N1", "N2", "N3", "N4", "N5"],
    },
  ];
}

function isTextElement(element: TemplateElement): boolean {
  return element.type === "text";
}

function findGuidanceForElement(
  template: TemplateDocument,
  element: TemplateElement,
): TemplateTextGuidance | undefined {
  const fromElement = element.textEditGuidance;
  if (fromElement) {
    return fromElement;
  }

  const guideline = template.textBlockGuidelines?.find(
    (item) => item.id === element.id,
  );
  if (!guideline) {
    return undefined;
  }

  return {
    currentChars: guideline.currentChars,
    recommendedMinChars: guideline.recommendedMinChars,
    recommendedMaxChars: guideline.recommendedMaxChars,
    recommendedTargetChars: guideline.recommendedTargetChars,
    recommendedLineCount: guideline.recommendedLineCount,
    maxHeight: guideline.maxHeight ?? element.maxHeight,
    notes: guideline.notes,
  };
}

function resolveElementSlideIndex(
  template: TemplateDocument,
  element: TemplateElement,
): number {
  const guideline = template.textBlockGuidelines?.find(
    (item) => item.id === element.id,
  );
  if (typeof guideline?.slideIndex === "number") {
    return guideline.slideIndex;
  }

  const slideCount = template.slides ?? 15;
  const slideDuration = template.durationSeconds / slideCount;
  const estimatedIndex = Math.floor((element.startTime ?? 0) / slideDuration);
  return Math.max(0, Math.min(slideCount - 1, estimatedIndex));
}

function buildContentForElement(
  element: TemplateElement,
  narrative: SlideNarrative,
  summary: SummaryResponse,
  slideIndex: number,
): string {
  const key = `${element.id} ${element.name ?? ""}`.toLowerCase();
  const cover = slideIndex === 0 || key.includes("portada");
  const section = slideIndex === 1 || key.includes("seccion");
  const mapSlide = slideIndex === 2 || key.includes("mapa");
  const objectives = slideIndex === 3 || key.includes("objetivo");
  const essentials = slideIndex === 4 || key.includes("concepto");
  const structure = slideIndex === 5 || key.includes("estructura");
  const visual = slideIndex === 6 || key.includes("visual");
  const keySlide = slideIndex === 7 || key.includes("clave");
  const example = slideIndex === 8 || key.includes("ejemplo");
  const flow = slideIndex === 9 || key.includes("flujo");
  const practice =
    slideIndex === 10 || key.includes("actividad") || key.includes("trabajo");
  const recap = slideIndex === 11 || key.includes("recap");
  const conclusions = slideIndex === 12 || key.includes("conclus");
  const resources = slideIndex === 13 || key.includes("recurso");
  const closing = slideIndex === 14 || key.includes("cierre");

  if (cover) {
    if (key.includes("titulo")) return narrative.title;
    if (key.includes("subtitulo")) return narrative.subtitle;
    if (key.includes("program")) return narrative.badge;
    if (key.includes("card-source")) return narrative.cards[0];
    if (key.includes("card-goal")) return narrative.cards[1];
    if (key.includes("card-status")) return narrative.cards[2];
    if (key.includes("note-left")) return narrative.body;
    if (key.includes("note-right")) return narrative.note;
  }

  if (section) {
    if (key.includes("number")) return String(slideIndex).padStart(2, "0");
    if (key.includes("label"))
      return `SECCION ${String(slideIndex).padStart(2, "0")}`;
    if (key.includes("title")) return narrative.title;
    if (key.includes("copy")) return narrative.subtitle;
    if (key.includes("tag-tablas")) return narrative.cards[0];
    if (key.includes("tag-claves")) return narrative.cards[1];
    if (key.includes("tag-select")) return narrative.cards[2];
    if (key.includes("tag-where"))
      return narrative.cards[3] ?? narrative.takeaway;
    if (key.includes("tag-order")) return narrative.caption;
    if (key.includes("tag-tipos")) return narrative.note;
  }

  if (mapSlide) {
    if (key.includes("title")) return narrative.title;
    if (key.includes("card-1")) return narrative.cards[0] ?? narrative.body;
    if (key.includes("card-2")) return narrative.cards[1] ?? narrative.body;
    if (key.includes("card-3")) return narrative.cards[2] ?? narrative.body;
  }

  if (objectives) {
    if (key.includes("title")) return narrative.title;
    if (key.includes("objective")) {
      const indexMatch = key.match(/objective-(\d)/);
      const objectiveIndex = indexMatch ? Number(indexMatch[1]) - 1 : 0;
      return narrative.bullets[objectiveIndex] ?? narrative.takeaway;
    }
  }

  if (essentials) {
    if (key.includes("title")) return narrative.title;
    if (key.includes("essential-item")) {
      const indexMatch = key.match(/essential-item-(\d)/);
      const itemIndex = indexMatch ? Number(indexMatch[1]) - 1 : 0;
      return narrative.bullets[itemIndex] ?? narrative.takeaway;
    }
    if (key.includes("side-title")) return narrative.badge;
    if (key.includes("side-copy")) return narrative.note;
  }

  if (structure) {
    if (key.includes("title")) return narrative.title;
    if (key.includes("select")) return narrative.cards[0] ?? narrative.body;
    if (key.includes("from")) return narrative.cards[1] ?? narrative.body;
  }

  if (visual) {
    if (key.includes("title")) return narrative.title;
    if (key.includes("copy")) return narrative.body;
    if (key.includes("notes")) return narrative.note;
    if (key.includes("caption")) return narrative.caption;
  }

  if (keySlide) {
    if (key.includes("title")) return narrative.title;
    if (key.includes("badge")) return narrative.badge;
    if (key.includes("quote")) return narrative.quote;
    if (key.includes("copy")) return narrative.body;
    if (key.includes("caption")) return narrative.caption;
  }

  if (example) {
    if (key.includes("title")) return narrative.title;
    if (key.includes("card-1")) return narrative.cards[0] ?? narrative.body;
    if (key.includes("card-2")) return narrative.cards[1] ?? narrative.body;
    if (key.includes("card-3")) return narrative.cards[2] ?? narrative.body;
    if (key.includes("lesson")) return narrative.takeaway;
    if (key.includes("caption")) return narrative.caption;
  }

  if (flow) {
    if (key.includes("title")) return narrative.title;
    if (key.includes("step-1")) return narrative.steps[0];
    if (key.includes("step-2")) return narrative.steps[1];
    if (key.includes("step-3")) return narrative.steps[2];
    if (key.includes("step-4")) return narrative.steps[3];
    if (key.includes("step-5")) return narrative.steps[4];
    if (key.includes("copy")) return narrative.body;
    if (key.includes("caption")) return narrative.caption;
  }

  if (practice) {
    if (key.includes("title")) return narrative.title;
    if (key.includes("subtitle")) return narrative.subtitle;
    if (key.includes("work")) return narrative.bullets.join("\n");
  }

  if (recap) {
    if (key.includes("title")) return narrative.title;
    if (key.includes("card-1"))
      return narrative.cards[0] ?? narrative.bullets[0] ?? narrative.body;
    if (key.includes("card-2"))
      return narrative.cards[1] ?? narrative.bullets[1] ?? narrative.body;
    if (key.includes("card-3"))
      return narrative.cards[2] ?? narrative.bullets[2] ?? narrative.body;
    if (key.includes("item")) return narrative.bullets.join("\n");
  }

  if (conclusions) {
    if (key.includes("title")) return narrative.title;
    if (key.includes("copy")) return narrative.body;
  }

  if (resources) {
    if (key.includes("title")) return narrative.title;
    if (key.includes("copy")) return narrative.body;
    if (key.includes("resource-1")) {
      return narrative.cards[0] ?? narrative.body;
    }
    if (key.includes("resource-2")) {
      return narrative.cards[1] ?? narrative.cards[0] ?? narrative.body;
    }
    if (key.includes("resource-3")) {
      return narrative.cards[2] ?? narrative.cards[1] ?? narrative.body;
    }
    if (key.includes("resource-4")) {
      return narrative.cards[3] ?? narrative.cards[2] ?? narrative.body;
    }
    if (key.includes("resource")) return narrative.cards[0] ?? narrative.body;
  }

  if (closing) {
    if (key.includes("title")) return narrative.title;
    if (key.includes("message")) return narrative.body;
    if (key.includes("next")) return narrative.takeaway;
    if (key.includes("contact")) return narrative.cards[0] ?? narrative.note;
    if (key.includes("note")) return narrative.caption;
  }

  if (key.includes("title")) return narrative.title;
  if (key.includes("subtitle")) return narrative.subtitle;
  if (key.includes("badge")) return narrative.badge;
  if (key.includes("quote")) return narrative.quote;
  if (key.includes("caption")) return narrative.caption;
  if (key.includes("note")) return narrative.note;
  if (key.includes("copy")) return narrative.body;
  if (key.includes("card")) return narrative.cards[0] ?? narrative.body;

  return summary.title;
}

function normalizeProjectTracks(tracks: TemplateTrack[]): ProjectTrack[] {
  return tracks.map((track) => ({
    id: track.id,
    name: track.name,
    type:
      track.kind === "text" || track.kind === "audio" || track.kind === "shape"
        ? track.kind
        : "mixed",
    elementIds: track.elements.map((element) => element.id),
  }));
}

function buildElementsFromTemplate(
  tracks: TemplateTrack[],
  summary: SummaryResponse,
): Record<string, ProjectElement> {
  const template = loadTemplate();
  const narratives = buildSlideNarratives(summary);
  const elements: Record<string, ProjectElement> = {};

  tracks.forEach((track) => {
    track.elements.forEach((element) => {
      const slideIndex = resolveElementSlideIndex(template, element);
      const narrative =
        narratives[slideIndex] ?? narratives[narratives.length - 1];
      const text = isTextElement(element)
        ? formatForGuidance(
            buildContentForElement(element, narrative, summary, slideIndex),
            findGuidanceForElement(template, element),
          )
        : undefined;

      elements[element.id] = {
        ...element,
        ...(text !== undefined ? { text } : {}),
        trackId: track.id,
      };
    });
  });

  return elements;
}

export async function buildTemplateProjectFromSummary(
  summary: SummaryResponse,
): Promise<ProjectDocument> {
  const template = loadTemplate();
  const projectId = generateProjectId();
  const now = new Date().toISOString();
  const tracks = template.tracks.map((track) => ({
    ...track,
    elements: track.elements.map((element) => ({ ...element })),
  }));

  const project: ProjectDocument = {
    id: projectId,
    name: collapseSpaces(summary.title).slice(0, 120) || template.name,
    duration: template.durationSeconds,
    resolution: template.resolution,
    revision: 0,
    sessionId: `session_${projectId}`,
    playback: {
      currentTime: 0,
      isPlaying: false,
      zoomLevel: 100,
    },
    selection: {
      selectedElementId: null,
      selectedTrackId: null,
      selectionSource: null,
    },
    assets: {
      templateId: template.id,
      templateName: template.name,
      templateSlides: template.slides ?? tracks.length,
    },
    tracks: normalizeProjectTracks(tracks),
    elements: buildElementsFromTemplate(tracks, summary),
    createdAt: now,
    updatedAt: now,
  };

  return project;
}

export async function persistTemplateProjectFromSummary(
  summary: SummaryResponse,
): Promise<{ projectId: string }> {
  const project = await buildTemplateProjectFromSummary(summary);
  return persistProjectDocument(project);
}
