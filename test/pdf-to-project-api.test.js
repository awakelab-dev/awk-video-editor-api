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

function buildSimplePdf(text) {
  const escapedText = text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
  const parts = [];
  let length = 0;
  const offsets = [0];

  function add(part) {
    parts.push(part);
    length += Buffer.byteLength(part, "utf8");
  }

  function addObject(objectNumber, body) {
    offsets[objectNumber] = length;
    add(`${objectNumber} 0 obj\n${body}\nendobj\n`);
  }

  add("%PDF-1.4\n");
  addObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  addObject(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  addObject(
    3,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
  );

  const stream = `BT /F1 24 Tf 72 720 Td (${escapedText}) Tj ET`;
  addObject(
    4,
    `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
  );
  addObject(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const xrefOffset = length;
  add("xref\n");
  add("0 6\n");
  add("0000000000 65535 f \n");

  for (let objectNumber = 1; objectNumber <= 5; objectNumber += 1) {
    add(`${String(offsets[objectNumber]).padStart(10, "0")} 00000 n \n`);
  }

  add("trailer\n<< /Root 1 0 R /Size 6 >>\n");
  add("startxref\n");
  add(`${xrefOffset}\n`);
  add("%%EOF");

  return Buffer.from(parts.join(""), "utf8");
}

async function loadRouter() {
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
  const { __setTestMongoState } = require("../dist/config/mongodb.js");
  const fakeDb = new FakeDb();
  __setTestMongoState(fakeDb, true);
  const { createPdfToProjectRouter } = require("../dist/routes/pdftotext.js");
  const app = express();
  app.use(
    "/api/v1",
    createPdfToProjectRouter(
      async (buffer) => {
        assert.ok(buffer.length > 0);
        return {
          text: "Documento de prueba para crear un proyecto desde un PDF. Este texto supera el minimo requerido por la validacion del esquema de slide tracks.",
          pages: 1,
        };
      },
      async () => [
        {
          title: "Analisis de documentos",
          subtitle: "Convertir un PDF en un proyecto editable",
          body: "El contenido extraido del PDF se transforma en una estructura de slides y se persiste como proyecto.",
          bullets: [
            "Se extrae texto del PDF",
            "Se generan tracks de slides",
            "Se guarda el proyecto en MongoDB",
          ],
          takeaway: "El flujo completo termina con un proyecto creado.",
          sourceNote: "Documento de prueba para el endpoint combinado.",
        },
      ],
    ),
  );

  return { app, fakeDb };
}

test("POST /api/v1/pdf-to-project creates and persists a project from a PDF", async () => {
  const { app, fakeDb } = await loadRouter();
  const pdfBuffer = buildSimplePdf(
    "Documento de prueba para crear un proyecto desde un PDF. Este texto supera el minimo requerido por la validacion del esquema de slide tracks.",
  );

  const response = await request(app)
    .post("/api/v1/pdf-to-project")
    .attach("file", pdfBuffer, "demo.pdf");

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  assert.equal(typeof response.body.data.projectId, "string");
  assert.equal(response.body.data.pages, 1);
  assert.equal(response.body.data.filename, "demo.pdf");
  assert.equal(response.body.data.slides, 1);
  assert.equal(response.body.data.durationSeconds, 12);

  const projectsCollection = fakeDb.collection("projects");
  assert.equal(projectsCollection.docs.length, 1);
  assert.equal(projectsCollection.docs[0].id, response.body.data.projectId);
  assert.equal(projectsCollection.docs[0].name, "Analisis de documentos");
  assert.equal(projectsCollection.docs[0].tracks.length, 3);
});
