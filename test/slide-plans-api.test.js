const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const request = require("supertest");
const { FakeDb } = require("./helpers/fake-db");

function clearDistCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes(path.join("dist", ""))) delete require.cache[key];
  }
}

async function loadApp() {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-secret-1234567890";
  process.env.JWT_ISSUER = "awk-video-editor-api";
  process.env.JWT_AUDIENCE = "awk-video-editor-client";
  process.env.MONGODB_URI = "mongodb://fake";
  process.env.MONGODB_DB_NAME = "awk_video_editor";
  process.env.LOG_HASH_PEPPER = "test-log-hash-pepper-1234567890";
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.AUTH_RATE_LIMIT_MAX = "100";

  clearDistCache();
  const {
    __setTestMongoState,
    ensureIndexes,
  } = require("../dist/config/mongodb.js");
  const fakeDb = new FakeDb();
  await ensureIndexes(fakeDb);
  __setTestMongoState(fakeDb, true);
  const app = require("../dist/app.js").default;
  return { app };
}

test("generates a slide plan from long text using multiple slide templates", async () => {
  const { app } = await loadApp();

  const text = [
    "La estrategia de contenidos empieza por identificar la idea central y después ordenar el resto del material en una progresión lógica.",
    "El primer bloque presenta el contexto y sitúa al lector en el problema principal, mientras que el segundo bloque descompone la solución en pasos concretos.",
    "A continuación se añaden ejemplos, comparaciones y notas prácticas para que el mensaje sea fácil de recordar y se pueda convertir en una secuencia visual.",
    "El cierre resume las decisiones importantes, refuerza la propuesta de valor y deja una llamada a la acción clara para la siguiente etapa.",
    "Cuando el texto es más largo, conviene repartir el contenido en más slides para mantener el ritmo y usar más layouts distintos sin perder coherencia narrativa.",
  ].join(" ");

  const response = await request(app).post("/api/v1/slide-plans").send({
    text,
    title: "Guion de contenidos",
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.templateId, "template-sql-fundamentos");
  assert.ok(response.body.data.slides.length >= 4);
  assert.equal(response.body.data.slides[0].id, "sql-cover");
  assert.equal(response.body.data.slides[0].content.cards.length, 3);
  assert.ok(Array.isArray(response.body.data.slides[0].content.notes));
  assert.ok(response.body.data.slides[0].content.subtitle.length <= 140);
  assert.ok(!response.body.data.slides[0].content.subtitle.includes("…"));

  const ids = new Set(response.body.data.slides.map((slide) => slide.id));
  assert.equal(ids.size, response.body.data.slides.length);
  assert.ok(
    response.body.data.slides.some(
      (slide) => slide.layout === "title_paragraph_3_blocks",
    ),
  );
});

test("generates an editor template with slide elements", async () => {
  const { app } = await loadApp();

  const response = await request(app)
    .post("/api/v1/slide-plans/editor-template")
    .send({
      text: "Primera frase larga para portada. Segunda frase con detalles y más contexto. Tercera frase para cerrar la idea principal y darle estructura visual.",
      title: "Plantilla editable",
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.ok(response.body.data.id.startsWith("template-"));
  assert.equal(
    response.body.data.durationSeconds,
    response.body.data.slides * 12,
  );
  assert.equal(response.body.data.tracks.length, 2);
  assert.equal(response.body.data.tracks[0].kind, "text");
  assert.equal(response.body.data.tracks[1].kind, "media");
  assert.ok(response.body.data.tracks[0].elements.length > 0);
  assert.ok(response.body.data.tracks[1].elements.length > 0);
  assert.ok(
    response.body.data.tracks[0].elements.length >= response.body.data.slides,
  );
  assert.equal(response.body.data.tracks[0].elements[0].type, "text");
  assert.equal(response.body.data.tracks[0].elements[0].startTime, 0);
  assert.ok(
    response.body.data.tracks[1].elements.some(
      (element) => element.type === "shape",
    ),
  );
  assert.ok(
    response.body.data.tracks[1].elements.some(
      (element) => element.type === "image",
    ),
  );
});

test("rejects invalid slide plan payloads", async () => {
  const { app } = await loadApp();

  const response = await request(app).post("/api/v1/slide-plans").send({
    text: "   ",
    unknown: true,
  });

  assert.equal(response.status, 422);
  assert.equal(response.body.success, false);
  assert.ok(response.body.errors.some((error) => error.field === "text"));
});
