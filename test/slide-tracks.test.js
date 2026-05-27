const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const express = require("express");
const request = require("supertest");

function clearDistCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes(path.join("dist", ""))) delete require.cache[key];
  }
}

function buildTestApp(mockSummarizer, mockPersistProject) {
  clearDistCache();
  const { createSlideTracksRouter } = require("../dist/routes/slideTracks.js");
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use(
    "/api/v1",
    createSlideTracksRouter(mockSummarizer, mockPersistProject),
  );
  return app;
}

test("POST /api/v1/slide-tracks returns generated tracks", async () => {
  let persistedPayload = null;
  const app = buildTestApp(
    async () => [
      {
        title: "SQL para analisis de negocio",
        subtitle: "Como pasar de datos crudos a decisiones accionables",
        body: "SQL permite consultar, transformar y resumir datos para responder preguntas de negocio con rapidez.",
        bullets: [
          "Define la pregunta de negocio primero",
          "Filtra ruido con WHERE",
          "Resume resultados con GROUP BY",
        ],
        takeaway: "Un buen modelo mental acelera cada consulta.",
        sourceNote: "Resumen generado desde el documento fuente.",
      },
      {
        title: "De joins a insights",
        subtitle: "Relaciona tablas con criterio y evita duplicados",
        body: "Los JOINs conectan entidades. La calidad del resultado depende de claves correctas y filtros consistentes.",
        bullets: [
          "Valida cardinalidad antes de unir",
          "Usa alias claros",
          "Revisa filas inesperadas",
        ],
        takeaway: "Relaciones limpias, conclusiones confiables.",
        sourceNote: "Segundo bloque del documento original.",
      },
    ],
    async (payload) => {
      persistedPayload = payload;
      return { projectId: "proj_generated_001" };
    },
  );

  const response = await request(app)
    .post("/api/v1/slide-tracks")
    .send({
      text: "A".repeat(500),
      language: "es",
      maxSlides: 6,
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.projectId, "proj_generated_001");
  assert.equal(response.body.data.slides, 2);
  assert.equal(response.body.data.durationSeconds, 24);
  assert.equal(Array.isArray(response.body.data.tracks), true);
  assert.equal(response.body.data.tracks.length, 3);
  assert.ok(persistedPayload);
  assert.equal(persistedPayload.generated.durationSeconds, 24);
  assert.equal(persistedPayload.generated.tracks.length, 3);

  const textTrack = response.body.data.tracks.find(
    (track) => track.id === "track_text",
  );
  assert.ok(textTrack);
  assert.ok(textTrack.elements.length > 0);
  assert.equal(textTrack.elements[0].fontSize, 46);
  assert.equal(typeof textTrack.elements[0].text, "string");
  assert.equal(
    textTrack.elements.some((element) => String(element.text).includes("\n")),
    true,
  );

  const mediaTrack = response.body.data.tracks.find(
    (track) => track.id === "track_media",
  );
  assert.ok(mediaTrack);
  assert.equal(mediaTrack.elements.length, 16);
  assert.equal(
    mediaTrack.elements.some((element) => element.id.includes("takeaway-card")),
    true,
  );
  assert.equal(
    mediaTrack.elements.some((element) => element.id.includes("decor-left")),
    true,
  );
  assert.equal(
    mediaTrack.elements.some((element) => element.id.includes("decor-right")),
    true,
  );
  assert.equal(
    mediaTrack.elements.some((element) => element.id.includes("decor-bottom")),
    true,
  );
  assert.equal(
    mediaTrack.elements.some(
      (element) => element.id.includes("bg") && element.fillColor === "#fbfffe",
    ),
    true,
  );
});

test("POST /api/v1/slide-tracks validates payload", async () => {
  const app = buildTestApp(async () => []);

  const response = await request(app).post("/api/v1/slide-tracks").send({
    text: "Muy corto",
    maxSlides: 2,
  });

  assert.equal(response.status, 422);
  assert.equal(response.body.success, false);
  assert.equal(response.body.message, "Validation failed");
  assert.ok(Array.isArray(response.body.errors));
  assert.ok(response.body.errors.length >= 1);
});
