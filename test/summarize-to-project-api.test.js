const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const express = require("express");
const request = require("supertest");
const { FakeDb } = require("./helpers/fake-db");

function clearDistCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes(path.join("dist", ""))) delete require.cache[key];
  }
}

async function loadRouter() {
  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = "mongodb://fake";
  process.env.MONGODB_DB_NAME = "awk_video_editor";
  process.env.LOG_HASH_PEPPER = "test-log-hash-pepper-1234567890";

  clearDistCache();
  const { __setTestMongoState } = require("../dist/config/mongodb.js");
  const fakeDb = new FakeDb();
  __setTestMongoState(fakeDb, true);

  const {
    createSummarizeToProjectRouter,
  } = require("../dist/routes/summarizeToProject.js");
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use(
    "/api/v1",
    createSummarizeToProjectRouter(async () => ({
      title: "Resumen de prueba",
      slides: [
        {
          slideNumber: 1,
          title: "Introduccion al flujo",
          summary:
            "El texto se resume y luego se convierte en un proyecto editable.",
          bullets: [
            "Resume el texto de entrada",
            "Convierte el resumen en slides",
            "Persiste el proyecto en MongoDB",
          ],
          keywords: ["resumen", "slides", "proyecto"],
          speakerNotes: "Slide de prueba para validar el endpoint.",
        },
      ],
    })),
  );

  return { app, fakeDb };
}

test("POST /api/v1/summarize-to-project creates and persists a project from text", async () => {
  const { app, fakeDb } = await loadRouter();

  const response = await request(app)
    .post("/api/v1/summarize-to-project")
    .send({
      text: "Este es un texto de prueba suficientemente largo para validar el flujo completo de resumir, convertir a slides y guardar el proyecto.",
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  assert.equal(typeof response.body.data.projectId, "string");
  assert.equal(response.body.data.summary.title, "Resumen de prueba");
  assert.equal(response.body.data.slides, 1);
  assert.equal(response.body.data.durationSeconds, 12);
  assert.equal(Array.isArray(response.body.data.tracks), true);

  const projectsCollection = fakeDb.collection("projects");
  assert.equal(projectsCollection.docs.length, 1);
  assert.equal(projectsCollection.docs[0].id, response.body.data.projectId);
  assert.equal(projectsCollection.docs[0].name, "Resumen de prueba");
  assert.equal(projectsCollection.docs[0].tracks.length, 3);
});
