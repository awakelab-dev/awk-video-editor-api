type SlidePlan = {
  metadata: {
    name: string;
    resolution: { w: number; h: number };
    slideDurationSeconds: number;
    generatedAt: string;
  };
  slides: Array<{
    index: number;
    id: string;
    layout: string;
    content: Record<string, unknown>;
  }>;
};

type EditorTemplateBaseElement = {
  id: string;
  name: string;
  startTime: number;
  duration: number;
  opacity: number;
  effects: string[];
};

type EditorTemplateTextElement = EditorTemplateBaseElement & {
  type: "text";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  textColor: string;
  backgroundColor: string;
  lineHeight: number;
  letterSpacing: number;
  textAlign: "left" | "center" | "right" | "justify";
};

type EditorTemplateShapeElement = EditorTemplateBaseElement & {
  type: "shape";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  shapeType: "rectangle" | "ellipse" | "line" | "triangle" | "polygon";
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  cornerRadius: number;
  [key: string]: unknown;
};

type EditorTemplateImageElement = EditorTemplateBaseElement & {
  type: "image";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  source: string;
  fit: "cover" | "contain" | "fill";
  [key: string]: unknown;
};

type EditorTemplateElement =
  | EditorTemplateTextElement
  | EditorTemplateShapeElement
  | EditorTemplateImageElement;

type EditorTemplateResponse = {
  id: string;
  name: string;
  description: string;
  owner: string;
  status: string;
  slides: number;
  durationSeconds: number;
  resolution: { w: number; h: number };
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
    elements: EditorTemplateElement[];
  }>;
};

function normalizeText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function fitText(value: string, maxLength: number): string {
  const normalized = normalizeText(value);
  if (!normalized) return "";
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

  return output.length > 0
    ? output.join(" ")
    : normalized.slice(0, maxLength).trimEnd();
}

function slugify(value: string): string {
  return (
    normalizeText(value)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "generated-template"
  );
}

function createTextElement(input: {
  id: string;
  name: string;
  startTime: number;
  duration: number;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
  fontWeight: number;
  textColor: string;
  backgroundColor?: string;
  lineHeight?: number;
  letterSpacing?: number;
  textAlign?: "left" | "center" | "right" | "justify";
  fontFamily?: string;
  opacity?: number;
  extra?: Record<string, unknown>;
}): EditorTemplateElement {
  return {
    id: input.id,
    type: "text",
    name: input.name,
    startTime: input.startTime,
    duration: input.duration,
    opacity: input.opacity ?? 1,
    effects: [],
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    rotation: 0,
    text: fitText(input.text, 5000),
    fontFamily: input.fontFamily ?? "Inter, Arial, sans-serif",
    fontSize: input.fontSize,
    fontWeight: input.fontWeight,
    textColor: input.textColor,
    backgroundColor: input.backgroundColor ?? "transparent",
    lineHeight: input.lineHeight ?? 1.25,
    letterSpacing: input.letterSpacing ?? 0,
    textAlign: input.textAlign ?? "left",
    ...(input.extra ?? {}),
  };
}

function createShapeElement(input: {
  id: string;
  name: string;
  startTime: number;
  duration: number;
  x: number;
  y: number;
  width: number;
  height: number;
  shapeType?: "rectangle" | "ellipse" | "line" | "triangle" | "polygon";
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  opacity?: number;
  rotation?: number;
  extra?: Record<string, unknown>;
}): EditorTemplateElement {
  return {
    id: input.id,
    type: "shape",
    name: input.name,
    startTime: input.startTime,
    duration: input.duration,
    opacity: input.opacity ?? 1,
    effects: [],
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    rotation: input.rotation ?? 0,
    shapeType: input.shapeType ?? "rectangle",
    fillColor: input.fillColor ?? "#ffffff",
    strokeColor: input.strokeColor ?? "transparent",
    strokeWidth: input.strokeWidth ?? 0,
    cornerRadius: input.cornerRadius ?? 0,
    ...(input.extra ?? {}),
  };
}

function createImageElement(input: {
  id: string;
  name: string;
  startTime: number;
  duration: number;
  x: number;
  y: number;
  width: number;
  height: number;
  source: string;
  fit?: "cover" | "contain" | "fill";
  opacity?: number;
  rotation?: number;
  extra?: Record<string, unknown>;
}): EditorTemplateElement {
  return {
    id: input.id,
    type: "image",
    name: input.name,
    startTime: input.startTime,
    duration: input.duration,
    opacity: input.opacity ?? 1,
    effects: [],
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    rotation: input.rotation ?? 0,
    source: input.source,
    fit: input.fit ?? "contain",
    ...(input.extra ?? {}),
  };
}

function encodeSvg(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function iconSource(
  kind: "spark" | "check" | "target" | "grid" | "book",
): string {
  const fill = "#0f766e";
  const svgByKind: Record<string, string> = {
    spark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="${fill}" d="M32 4l6.4 17.6L56 28l-17.6 6.4L32 52l-6.4-17.6L8 28l17.6-6.4L32 4z"/></svg>`,
    check: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="${fill}" d="M26.8 44.4 14 31.6l5.7-5.7 7.1 7.1L44.3 15l5.7 5.7z"/></svg>`,
    target: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="22" fill="none" stroke="${fill}" stroke-width="6"/><circle cx="32" cy="32" r="9" fill="${fill}"/></svg>`,
    grid: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="10" y="10" width="12" height="12" rx="2" fill="${fill}"/><rect x="26" y="10" width="12" height="12" rx="2" fill="${fill}" opacity="0.72"/><rect x="42" y="10" width="12" height="12" rx="2" fill="${fill}" opacity="0.56"/><rect x="10" y="26" width="12" height="12" rx="2" fill="${fill}" opacity="0.72"/><rect x="26" y="26" width="12" height="12" rx="2" fill="${fill}" opacity="0.56"/><rect x="42" y="26" width="12" height="12" rx="2" fill="${fill}" opacity="0.72"/></svg>`,
    book: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="${fill}" d="M16 10h18a8 8 0 0 1 8 8v36a8 8 0 0 0-8-8H16V10zm32 0H34a8 8 0 0 0-8 8v36a8 8 0 0 1 8-8h14V10z"/></svg>`,
  };

  return encodeSvg(svgByKind[kind]);
}

function buildBackdropVisuals(
  slideId: string,
  startTime: number,
  duration: number,
  tint: string,
): EditorTemplateElement[] {
  return [
    createShapeElement({
      id: `${slideId}-bg`,
      name: "Fondo base",
      startTime,
      duration,
      x: 0,
      y: 0,
      width: 1024,
      height: 576,
      fillColor: "#fbfffe",
      strokeColor: "#b7f3ea",
      strokeWidth: 1,
      cornerRadius: 14,
    }),
    createShapeElement({
      id: `${slideId}-blob-left`,
      name: "Forma suave izquierda",
      startTime,
      duration,
      x: -150,
      y: 260,
      width: 350,
      height: 300,
      fillColor: tint,
      opacity: 0.58,
      strokeColor: "transparent",
      strokeWidth: 0,
      cornerRadius: 999,
    }),
    createShapeElement({
      id: `${slideId}-blob-right`,
      name: "Forma suave derecha",
      startTime,
      duration,
      x: 832,
      y: 26,
      width: 230,
      height: 210,
      fillColor: "#d3f6f1",
      opacity: 0.64,
      strokeColor: "transparent",
      strokeWidth: 0,
      cornerRadius: 999,
    }),
  ];
}

function buildCoverVisuals(
  slideId: string,
  startTime: number,
  duration: number,
): EditorTemplateElement[] {
  return [
    createShapeElement({
      id: `${slideId}-cover-line-main`,
      name: "Linea portada principal",
      startTime,
      duration,
      x: 54,
      y: 136,
      width: 64,
      height: 4,
      fillColor: "#0f766e",
      strokeColor: "transparent",
      strokeWidth: 0,
      cornerRadius: 2,
    }),
    createShapeElement({
      id: `${slideId}-cover-line-accent`,
      name: "Linea portada acento",
      startTime,
      duration,
      x: 126,
      y: 136,
      width: 25,
      height: 4,
      fillColor: "#f59e0b",
      strokeColor: "transparent",
      strokeWidth: 0,
      cornerRadius: 2,
    }),
  ];
}

function buildCardBackplates(
  slideId: string,
  startTime: number,
  duration: number,
  cards: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    tone?: string;
  }>,
  suffix: string,
): EditorTemplateElement[] {
  return cards.map((card, index) =>
    createShapeElement({
      id: `${slideId}-${suffix}-${index + 1}`,
      name: `Fondo ${suffix} ${index + 1}`,
      startTime,
      duration,
      x: card.x,
      y: card.y,
      width: card.width,
      height: card.height,
      fillColor: card.tone ?? "#eefdfa",
      strokeColor: "#b7f3ea",
      strokeWidth: 1,
      cornerRadius: 12,
    }),
  );
}

function buildIconStrip(
  slideId: string,
  startTime: number,
  duration: number,
  icons: Array<{
    kind: "spark" | "check" | "target" | "grid" | "book";
    x: number;
    y: number;
  }>,
  suffix: string,
): EditorTemplateElement[] {
  return icons.map((icon, index) =>
    createImageElement({
      id: `${slideId}-${suffix}-${index + 1}`,
      name: `Icono ${suffix} ${index + 1}`,
      startTime,
      duration,
      x: icon.x,
      y: icon.y,
      width: 19,
      height: 19,
      source: iconSource(icon.kind),
      fit: "contain",
      opacity: 1,
    }),
  );
}

function buildDividerBar(
  slideId: string,
  startTime: number,
  duration: number,
  x: number,
  y: number,
  width: number,
  color: string,
  idSuffix: string,
): EditorTemplateElement {
  return createShapeElement({
    id: `${slideId}-${idSuffix}`,
    name: `Separador ${idSuffix}`,
    startTime,
    duration,
    x,
    y,
    width,
    height: 4,
    fillColor: color,
    strokeColor: "transparent",
    strokeWidth: 0,
    cornerRadius: 2,
  });
}

function buildTagElement(args: {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  startTime: number;
  duration: number;
}): EditorTemplateElement {
  return createTextElement({
    id: args.id,
    name: `Etiqueta ${args.label}`,
    startTime: args.startTime,
    duration: args.duration,
    x: args.x,
    y: args.y,
    width: args.width,
    height: 25,
    text: args.label,
    fontSize: 11,
    fontWeight: 700,
    textColor: "#0f766e",
    backgroundColor: "#ecfdfa",
    lineHeight: 1.25,
    textAlign: "center",
    extra: {
      labelBorderColor: "#a7f3d0",
      labelBorderWidth: 1,
    },
  });
}

function buildBlocks(
  slideId: string,
  startTime: number,
  duration: number,
  blocks: Array<{ title?: string; text?: string }>,
  xPositions: number[],
  y: number,
  width: number,
  height: number,
): EditorTemplateElement[] {
  return [0, 1, 2, 3]
    .map((index) => {
      const block = blocks[index] ?? {};
      return createTextElement({
        id: `${slideId}-block-${index + 1}`,
        name: `Bloque ${index + 1}`,
        startTime,
        duration,
        x: xPositions[index],
        y,
        width,
        height,
        text: `${block.title ?? `Punto ${index + 1}`}\n${block.text ?? ""}`,
        fontSize: 14,
        fontWeight: 600,
        textColor: "#111827",
        lineHeight: 1.6,
      });
    })
    .filter(Boolean);
}

function buildCards(
  slideId: string,
  startTime: number,
  duration: number,
  cards: Array<{ title?: string; description?: string }>,
  xPositions: number[],
  y: number,
  width: number,
  height: number,
): EditorTemplateElement[] {
  return xPositions.map((x, index) => {
    const card = cards[index] ?? {};
    return createTextElement({
      id: `${slideId}-card-${index + 1}`,
      name: `Tarjeta ${index + 1}`,
      startTime,
      duration,
      x,
      y,
      width,
      height,
      text: `${card.title ?? `Idea ${index + 1}`}\n\n${card.description ?? ""}`,
      fontSize: 14,
      fontWeight: 600,
      textColor: "#111827",
      lineHeight: 1.65,
    });
  });
}

function buildRows(
  slideId: string,
  startTime: number,
  duration: number,
  rows: Array<{ label?: string; summary?: string }>,
): EditorTemplateElement[] {
  return [0, 1, 2, 3, 4].map((index) => {
    const row = rows[index] ?? {};
    return createTextElement({
      id: `${slideId}-row-${index + 1}`,
      name: `Fila ${index + 1}`,
      startTime,
      duration,
      x: 84,
      y: 220 + index * 56,
      width: 850,
      height: 42,
      text: `${row.label ?? `0${index + 1}`}  ${row.summary ?? ""}`,
      fontSize: 15,
      fontWeight: 600,
      textColor: "#111827",
    });
  });
}

function buildSteps(
  slideId: string,
  startTime: number,
  duration: number,
  steps: Array<{ title?: string; description?: string }>,
): EditorTemplateElement[] {
  return [0, 1, 2].map((index) => {
    const step = steps[index] ?? {};
    return createTextElement({
      id: `${slideId}-step-${index + 1}`,
      name: `Paso ${index + 1}`,
      startTime,
      duration,
      x: 80,
      y: 220 + index * 72,
      width: 400,
      height: 52,
      text: `${step.title ?? `Paso ${index + 1}`}\n${step.description ?? ""}`,
      fontSize: 15,
      fontWeight: 700,
      textColor: "#111827",
      lineHeight: 1.6,
    });
  });
}

function buildEditorSlideElements(
  slide: SlidePlan["slides"][number],
  slideDurationSeconds: number,
  title: string,
): EditorTemplateElement[] {
  const startTime = slide.index * slideDurationSeconds;
  const content = slide.content;
  const baseVisuals = buildBackdropVisuals(
    slide.id,
    startTime,
    slideDurationSeconds,
    "#e1f7f4",
  );

  switch (slide.layout) {
    case "cover_title_subtitle_3_cards_2_notes": {
      const cards = Array.isArray(content.cards) ? content.cards : [];
      const notes = Array.isArray(content.notes) ? content.notes : [];
      return [
        ...baseVisuals,
        ...buildCoverVisuals(slide.id, startTime, slideDurationSeconds),
        ...buildCardBackplates(
          slide.id,
          startTime,
          slideDurationSeconds,
          [
            { x: 55, y: 298, width: 285, height: 144, tone: "#eefdfa" },
            { x: 360, y: 298, width: 285, height: 144, tone: "#eefdfa" },
            { x: 665, y: 298, width: 285, height: 144, tone: "#fffaf0" },
          ],
          "cover-card-bg",
        ),
        ...buildIconStrip(
          slide.id,
          startTime,
          slideDurationSeconds,
          [
            { kind: "book", x: 75, y: 314 },
            { kind: "grid", x: 380, y: 314 },
            { kind: "target", x: 685, y: 314 },
          ],
          "cover-icon",
        ),
        createTextElement({
          id: `${slide.id}-title`,
          name: "Titulo portada",
          startTime,
          duration: slideDurationSeconds,
          x: 54,
          y: 58,
          width: 820,
          height: 60,
          text: String(content.title ?? title),
          fontSize: 46,
          fontWeight: 800,
          textColor: "#0f766e",
        }),
        createTextElement({
          id: `${slide.id}-subtitle`,
          name: "Subtitulo portada",
          startTime,
          duration: slideDurationSeconds,
          x: 54,
          y: 164,
          width: 620,
          height: 72,
          text: String(content.subtitle ?? ""),
          fontSize: 24,
          fontWeight: 400,
          textColor: "#64748b",
        }),
        createTextElement({
          id: `${slide.id}-program`,
          name: "Programa",
          startTime,
          duration: slideDurationSeconds,
          x: 54,
          y: 260,
          width: 360,
          height: 24,
          text: "PROGRAMA DE FORMACION",
          fontSize: 14,
          fontWeight: 700,
          textColor: "#0f766e",
          letterSpacing: 2,
        }),
        ...buildCards(
          slide.id,
          startTime,
          slideDurationSeconds,
          cards as Array<{ title?: string; description?: string }>,
          [76, 380, 687],
          318,
          250,
          95,
        ),
        createTextElement({
          id: `${slide.id}-note-left`,
          name: "Nota inferior izquierda",
          startTime,
          duration: slideDurationSeconds,
          x: 54,
          y: 468,
          width: 425,
          height: 48,
          text: String(notes[0] ?? content.subtitle ?? ""),
          fontSize: 13,
          fontWeight: 400,
          textColor: "#64748b",
        }),
        createTextElement({
          id: `${slide.id}-note-right`,
          name: "Nota inferior derecha",
          startTime,
          duration: slideDurationSeconds,
          x: 518,
          y: 468,
          width: 425,
          height: 48,
          text: String(notes[1] ?? ""),
          fontSize: 13,
          fontWeight: 400,
          textColor: "#64748b",
        }),
      ];
    }
    case "section_number_title_paragraph_6_tags": {
      const tags = Array.isArray(content.tags) ? content.tags : [];
      return [
        ...baseVisuals,
        buildDividerBar(
          slide.id,
          startTime,
          slideDurationSeconds,
          85,
          354,
          48,
          "#f59e0b",
          "section-number-line",
        ),
        ...buildIconStrip(
          slide.id,
          startTime,
          slideDurationSeconds,
          [
            { kind: "spark", x: 74, y: 180 },
            { kind: "check", x: 402, y: 180 },
            { kind: "target", x: 706, y: 180 },
          ],
          "section-icon",
        ),
        createTextElement({
          id: `${slide.id}-number`,
          name: "Numero seccion",
          startTime,
          duration: slideDurationSeconds,
          x: 58,
          y: 252,
          width: 120,
          height: 80,
          text: String(content.sectionNumber ?? "01"),
          fontSize: 92,
          fontWeight: 800,
          textColor: "#d7efec",
        }),
        createTextElement({
          id: `${slide.id}-label`,
          name: "Etiqueta seccion",
          startTime,
          duration: slideDurationSeconds,
          x: 202,
          y: 196,
          width: 220,
          height: 28,
          text: String(content.sectionLabel ?? "Desarrollo"),
          fontSize: 14,
          fontWeight: 700,
          textColor: "#0f766e",
          letterSpacing: 1.5,
        }),
        createTextElement({
          id: `${slide.id}-title`,
          name: "Titulo seccion",
          startTime,
          duration: slideDurationSeconds,
          x: 202,
          y: 232,
          width: 620,
          height: 48,
          text: String(content.title ?? title),
          fontSize: 34,
          fontWeight: 800,
          textColor: "#111827",
        }),
        createTextElement({
          id: `${slide.id}-paragraph`,
          name: "Descripcion seccion",
          startTime,
          duration: slideDurationSeconds,
          x: 202,
          y: 290,
          width: 660,
          height: 64,
          text: String(content.paragraph ?? ""),
          fontSize: 20,
          fontWeight: 400,
          textColor: "#64748b",
        }),
        ...[0, 1, 2, 3, 4, 5].map((index) => {
          const xPositions = [202, 268, 391, 464, 538, 629];
          const widths = [58, 112, 64, 66, 82, 104];
          return buildTagElement({
            id: `${slide.id}-tag-${index + 1}`,
            label: String(tags[index] ?? `tag-${index + 1}`),
            x: xPositions[index],
            y: 366,
            width: widths[index],
            startTime,
            duration: slideDurationSeconds,
          });
        }),
      ];
    }
    case "title_1_paragraph":
      return [
        ...baseVisuals,
        buildDividerBar(
          slide.id,
          startTime,
          slideDurationSeconds,
          64,
          138,
          160,
          "#0f766e",
          "title-1-line",
        ),
        createTextElement({
          id: `${slide.id}-title`,
          name: "Titulo slide",
          startTime,
          duration: slideDurationSeconds,
          x: 64,
          y: 72,
          width: 820,
          height: 58,
          text: String(content.title ?? title),
          fontSize: 46,
          fontWeight: 800,
          textColor: "#0f766e",
        }),
        createTextElement({
          id: `${slide.id}-paragraph`,
          name: "Parrafo principal",
          startTime,
          duration: slideDurationSeconds,
          x: 96,
          y: 180,
          width: 850,
          height: 170,
          text: String(content.paragraph ?? ""),
          fontSize: 24,
          fontWeight: 400,
          textColor: "#111827",
          lineHeight: 1.35,
        }),
      ];
    case "title_2_paragraphs": {
      const paragraphs = Array.isArray(content.paragraphs)
        ? content.paragraphs
        : [];
      return [
        ...baseVisuals,
        buildDividerBar(
          slide.id,
          startTime,
          slideDurationSeconds,
          64,
          138,
          160,
          "#0f766e",
          "title-2-line",
        ),
        createTextElement({
          id: `${slide.id}-title`,
          name: "Titulo slide",
          startTime,
          duration: slideDurationSeconds,
          x: 64,
          y: 72,
          width: 820,
          height: 58,
          text: String(content.title ?? title),
          fontSize: 46,
          fontWeight: 800,
          textColor: "#0f766e",
        }),
        createTextElement({
          id: `${slide.id}-paragraph-1`,
          name: "Parrafo 1",
          startTime,
          duration: slideDurationSeconds,
          x: 80,
          y: 190,
          width: 360,
          height: 160,
          text: String(paragraphs[0] ?? ""),
          fontSize: 21,
          fontWeight: 400,
          textColor: "#111827",
        }),
        createTextElement({
          id: `${slide.id}-paragraph-2`,
          name: "Parrafo 2",
          startTime,
          duration: slideDurationSeconds,
          x: 560,
          y: 190,
          width: 360,
          height: 160,
          text: String(paragraphs[1] ?? ""),
          fontSize: 21,
          fontWeight: 400,
          textColor: "#111827",
        }),
      ];
    }
    case "title_paragraph_3_blocks": {
      const blocks = Array.isArray(content.blocks) ? content.blocks : [];
      return [
        ...baseVisuals,
        buildDividerBar(
          slide.id,
          startTime,
          slideDurationSeconds,
          60,
          126,
          160,
          "#0f766e",
          "blocks-3-line",
        ),
        ...buildCardBackplates(
          slide.id,
          startTime,
          slideDurationSeconds,
          [
            { x: 80, y: 260, width: 240, height: 150 },
            { x: 355, y: 260, width: 240, height: 150 },
            { x: 630, y: 260, width: 240, height: 150 },
          ],
          "blocks-3-bg",
        ),
        createTextElement({
          id: `${slide.id}-title`,
          name: "Titulo slide",
          startTime,
          duration: slideDurationSeconds,
          x: 60,
          y: 60,
          width: 800,
          height: 58,
          text: String(content.title ?? title),
          fontSize: 44,
          fontWeight: 800,
          textColor: "#0f766e",
        }),
        createTextElement({
          id: `${slide.id}-paragraph`,
          name: "Parrafo principal",
          startTime,
          duration: slideDurationSeconds,
          x: 80,
          y: 142,
          width: 840,
          height: 72,
          text: String(content.paragraph ?? ""),
          fontSize: 22,
          fontWeight: 400,
          textColor: "#64748b",
        }),
        ...buildBlocks(
          slide.id,
          startTime,
          slideDurationSeconds,
          blocks as Array<{ title?: string; text?: string }>,
          [80, 355, 630],
          260,
          240,
          150,
        ),
      ];
    }
    case "title_paragraph_4_blocks": {
      const blocks = Array.isArray(content.blocks) ? content.blocks : [];
      return [
        ...baseVisuals,
        buildDividerBar(
          slide.id,
          startTime,
          slideDurationSeconds,
          60,
          126,
          160,
          "#0f766e",
          "blocks-4-line",
        ),
        ...buildCardBackplates(
          slide.id,
          startTime,
          slideDurationSeconds,
          [
            { x: 80, y: 250, width: 360, height: 110 },
            { x: 512, y: 250, width: 360, height: 110 },
            { x: 80, y: 370, width: 360, height: 110 },
            { x: 512, y: 370, width: 360, height: 110 },
          ],
          "blocks-4-bg",
        ),
        createTextElement({
          id: `${slide.id}-title`,
          name: "Titulo slide",
          startTime,
          duration: slideDurationSeconds,
          x: 60,
          y: 60,
          width: 800,
          height: 58,
          text: String(content.title ?? title),
          fontSize: 44,
          fontWeight: 800,
          textColor: "#0f766e",
        }),
        createTextElement({
          id: `${slide.id}-paragraph`,
          name: "Parrafo principal",
          startTime,
          duration: slideDurationSeconds,
          x: 80,
          y: 142,
          width: 840,
          height: 72,
          text: String(content.paragraph ?? ""),
          fontSize: 22,
          fontWeight: 400,
          textColor: "#64748b",
        }),
        ...buildBlocks(
          slide.id,
          startTime,
          slideDurationSeconds,
          blocks as Array<{ title?: string; text?: string }>,
          [80, 512, 80, 512],
          250,
          360,
          110,
        ),
      ];
    }
    case "title_paragraph_5_rows": {
      const rows = Array.isArray(content.rows) ? content.rows : [];
      return [
        ...baseVisuals,
        buildDividerBar(
          slide.id,
          startTime,
          slideDurationSeconds,
          60,
          130,
          160,
          "#0f766e",
          "rows-line",
        ),
        createTextElement({
          id: `${slide.id}-title`,
          name: "Titulo slide",
          startTime,
          duration: slideDurationSeconds,
          x: 60,
          y: 62,
          width: 820,
          height: 58,
          text: String(content.title ?? title),
          fontSize: 44,
          fontWeight: 800,
          textColor: "#0f766e",
        }),
        createTextElement({
          id: `${slide.id}-paragraph`,
          name: "Parrafo principal",
          startTime,
          duration: slideDurationSeconds,
          x: 70,
          y: 132,
          width: 820,
          height: 68,
          text: String(content.paragraph ?? ""),
          fontSize: 20,
          fontWeight: 400,
          textColor: "#64748b",
        }),
        ...buildRows(
          slide.id,
          startTime,
          slideDurationSeconds,
          rows as Array<{ label?: string; summary?: string }>,
        ),
      ];
    }
    case "title_subtitle_3_steps_side_paragraph": {
      const steps = Array.isArray(content.steps) ? content.steps : [];
      return [
        ...baseVisuals,
        buildDividerBar(
          slide.id,
          startTime,
          slideDurationSeconds,
          64,
          122,
          150,
          "#0f766e",
          "steps-line",
        ),
        createShapeElement({
          id: `${slide.id}-side-panel`,
          name: "Panel lateral",
          startTime,
          duration: slideDurationSeconds,
          x: 548,
          y: 200,
          width: 374,
          height: 250,
          fillColor: "#eefdfa",
          strokeColor: "#b7f3ea",
          strokeWidth: 1,
          cornerRadius: 18,
        }),
        createTextElement({
          id: `${slide.id}-title`,
          name: "Titulo slide",
          startTime,
          duration: slideDurationSeconds,
          x: 64,
          y: 68,
          width: 720,
          height: 58,
          text: String(content.title ?? title),
          fontSize: 44,
          fontWeight: 800,
          textColor: "#0f766e",
        }),
        createTextElement({
          id: `${slide.id}-subtitle`,
          name: "Subtitulo slide",
          startTime,
          duration: slideDurationSeconds,
          x: 64,
          y: 132,
          width: 720,
          height: 48,
          text: String(content.subtitle ?? ""),
          fontSize: 22,
          fontWeight: 400,
          textColor: "#64748b",
        }),
        ...buildSteps(
          slide.id,
          startTime,
          slideDurationSeconds,
          steps as Array<{ title?: string; description?: string }>,
        ),
        createTextElement({
          id: `${slide.id}-side-paragraph`,
          name: "Texto lateral",
          startTime,
          duration: slideDurationSeconds,
          x: 560,
          y: 220,
          width: 350,
          height: 220,
          text: String(content.sideParagraph ?? ""),
          fontSize: 18,
          fontWeight: 400,
          textColor: "#111827",
          lineHeight: 1.45,
        }),
      ];
    }
    case "title_3_resource_cards": {
      const cards = Array.isArray(content.cards) ? content.cards : [];
      return [
        ...baseVisuals,
        buildDividerBar(
          slide.id,
          startTime,
          slideDurationSeconds,
          64,
          128,
          160,
          "#0f766e",
          "resource-3-line",
        ),
        ...buildCardBackplates(
          slide.id,
          startTime,
          slideDurationSeconds,
          [
            { x: 80, y: 210, width: 230, height: 160 },
            { x: 390, y: 210, width: 230, height: 160 },
            { x: 700, y: 210, width: 230, height: 160 },
          ],
          "resource-3-bg",
        ),
        ...buildIconStrip(
          slide.id,
          startTime,
          slideDurationSeconds,
          [
            { kind: "grid", x: 102, y: 232 },
            { kind: "spark", x: 412, y: 232 },
            { kind: "target", x: 722, y: 232 },
          ],
          "resource-3-icon",
        ),
        createTextElement({
          id: `${slide.id}-title`,
          name: "Titulo slide",
          startTime,
          duration: slideDurationSeconds,
          x: 64,
          y: 68,
          width: 720,
          height: 58,
          text: String(content.title ?? title),
          fontSize: 44,
          fontWeight: 800,
          textColor: "#0f766e",
        }),
        ...buildCards(
          slide.id,
          startTime,
          slideDurationSeconds,
          cards as Array<{ title?: string; description?: string }>,
          [80, 390, 700],
          210,
          230,
          160,
        ),
      ];
    }
    case "title_4_resource_cards": {
      const cards = Array.isArray(content.cards) ? content.cards : [];
      return [
        ...baseVisuals,
        buildDividerBar(
          slide.id,
          startTime,
          slideDurationSeconds,
          64,
          128,
          160,
          "#0f766e",
          "resource-4-line",
        ),
        ...buildCardBackplates(
          slide.id,
          startTime,
          slideDurationSeconds,
          [
            { x: 80, y: 184, width: 360, height: 132 },
            { x: 512, y: 184, width: 360, height: 132 },
            { x: 80, y: 356, width: 360, height: 132 },
            { x: 512, y: 356, width: 360, height: 132 },
          ],
          "resource-4-bg",
        ),
        ...buildIconStrip(
          slide.id,
          startTime,
          slideDurationSeconds,
          [
            { kind: "book", x: 102, y: 206 },
            { kind: "grid", x: 534, y: 206 },
            { kind: "check", x: 102, y: 378 },
            { kind: "target", x: 534, y: 378 },
          ],
          "resource-4-icon",
        ),
        createTextElement({
          id: `${slide.id}-title`,
          name: "Titulo slide",
          startTime,
          duration: slideDurationSeconds,
          x: 64,
          y: 68,
          width: 720,
          height: 58,
          text: String(content.title ?? title),
          fontSize: 44,
          fontWeight: 800,
          textColor: "#0f766e",
        }),
        ...buildCards(
          slide.id,
          startTime,
          slideDurationSeconds,
          cards as Array<{ title?: string; description?: string }>,
          [80, 512, 80, 512],
          184,
          360,
          132,
        ),
      ];
    }
    case "title_3_paragraphs_contact": {
      const paragraphs = Array.isArray(content.paragraphs)
        ? content.paragraphs
        : [];
      return [
        ...baseVisuals,
        createShapeElement({
          id: `${slide.id}-contact-panel`,
          name: "Panel contacto",
          startTime,
          duration: slideDurationSeconds,
          x: 632,
          y: 164,
          width: 300,
          height: 260,
          fillColor: "#eefdfa",
          strokeColor: "#b7f3ea",
          strokeWidth: 1,
          cornerRadius: 18,
        }),
        createTextElement({
          id: `${slide.id}-title`,
          name: "Titulo slide",
          startTime,
          duration: slideDurationSeconds,
          x: 60,
          y: 68,
          width: 720,
          height: 58,
          text: String(content.title ?? title),
          fontSize: 44,
          fontWeight: 800,
          textColor: "#0f766e",
        }),
        ...[0, 1, 2].map((index) =>
          createTextElement({
            id: `${slide.id}-paragraph-${index + 1}`,
            name: `Parrafo ${index + 1}`,
            startTime,
            duration: slideDurationSeconds,
            x: 80,
            y: 170 + index * 92,
            width: 520,
            height: 72,
            text: String(paragraphs[index] ?? ""),
            fontSize: 18,
            fontWeight: 400,
            textColor: "#111827",
            lineHeight: 1.45,
          }),
        ),
        createTextElement({
          id: `${slide.id}-contact`,
          name: "Contacto",
          startTime,
          duration: slideDurationSeconds,
          x: 652,
          y: 180,
          width: 270,
          height: 220,
          text: String(content.contact ?? ""),
          fontSize: 15,
          fontWeight: 600,
          textColor: "#111827",
          lineHeight: 1.55,
        }),
      ];
    }
    default:
      return [
        ...baseVisuals,
        buildDividerBar(
          slide.id,
          startTime,
          slideDurationSeconds,
          64,
          138,
          160,
          "#0f766e",
          "default-line",
        ),
        createTextElement({
          id: `${slide.id}-title`,
          name: "Titulo slide",
          startTime,
          duration: slideDurationSeconds,
          x: 64,
          y: 72,
          width: 820,
          height: 58,
          text: String(content.title ?? title),
          fontSize: 44,
          fontWeight: 800,
          textColor: "#0f766e",
        }),
        createTextElement({
          id: `${slide.id}-paragraph`,
          name: "Parrafo slide",
          startTime,
          duration: slideDurationSeconds,
          x: 80,
          y: 180,
          width: 820,
          height: 170,
          text: String(content.paragraph ?? content.subtitle ?? ""),
          fontSize: 24,
          fontWeight: 400,
          textColor: "#111827",
        }),
      ];
  }
}

export function buildEditorTemplateFromPlan(
  plan: SlidePlan,
  input: { text: string },
): EditorTemplateResponse {
  const slideDurationSeconds = plan.metadata.slideDurationSeconds;
  const title = plan.metadata.name;
  const tags = Array.from(
    new Set(
      (input.text.toLowerCase().match(/\b[\p{L}]{4,}\b/gu) ?? [])
        .filter(
          (word) =>
            ![
              "para",
              "pero",
              "porque",
              "como",
              "con",
              "desde",
              "esta",
              "este",
              "esta",
              "unos",
              "unas",
              "the",
              "and",
              "for",
              "with",
            ].includes(word),
        )
        .slice(0, 8),
    ),
  );
  const elements = plan.slides.flatMap((slide) =>
    buildEditorSlideElements(slide, slideDurationSeconds, title),
  );
  const textElements = elements.filter(
    (element): element is EditorTemplateTextElement => element.type === "text",
  );
  const mediaElements = elements.filter(
    (
      element,
    ): element is EditorTemplateShapeElement | EditorTemplateImageElement =>
      element.type === "shape" || element.type === "image",
  );

  return {
    id: `template-${slugify(title)}`,
    name: title,
    description: "Plantilla editable generada a partir de un texto de entrada.",
    owner: "AWK AI",
    status: "draft",
    slides: plan.slides.length,
    durationSeconds: plan.slides.length * slideDurationSeconds,
    resolution: plan.metadata.resolution,
    lastEditedAt: plan.metadata.generatedAt,
    collaborators: 1,
    tags: tags.slice(0, 4),
    thumbnail: {
      gradient:
        "linear-gradient(135deg, #f8fffd 0%, #effcfa 50%, #fff8ed 100%)",
      title: fitText(title, 24),
      subtitle: fitText(
        String(
          plan.slides[0]?.content.subtitle ??
            plan.slides[0]?.content.paragraph ??
            title,
        ),
        40,
      ),
      bullets: tags.slice(0, 3),
    },
    tracks: [
      {
        id: "track-text",
        name: "Textos",
        kind: "text",
        elements: textElements,
      },
      {
        id: "track-media",
        name: "Elementos visuales",
        kind: "media",
        elements: mediaElements,
      },
    ],
  };
}
