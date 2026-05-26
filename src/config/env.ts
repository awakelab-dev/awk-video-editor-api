import { config } from "dotenv";

config();

const NODE_ENV = (process.env.NODE_ENV ?? "development").trim();
const IS_PRODUCTION = NODE_ENV === "production";
const FORBIDDEN_JWT_SECRETS = new Set([
  "",
  "change-me-in-production",
  "dev-only-change-this-secret-please-123456789",
  "test-secret-1234567890",
  "secret",
  "jwt-secret",
  "example-secret",
  "password",
  "changeme",
  "please-change-me",
]);
const MIN_PRODUCTION_JWT_SECRET_LENGTH = 32;

function value(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

function requiredInProduction(name: string, fallback = ""): string {
  const v = value(name, fallback);
  if (IS_PRODUCTION && !v) {
    throw new Error(
      `Missing required environment variable in production: ${name}`,
    );
  }
  return v;
}

function assertProductionJwtSecret(secret: string) {
  if (!IS_PRODUCTION) return;

  const normalized = secret.trim().toLowerCase();
  if (secret.length < MIN_PRODUCTION_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be at least ${MIN_PRODUCTION_JWT_SECRET_LENGTH} characters in production`,
    );
  }
  if (FORBIDDEN_JWT_SECRETS.has(normalized)) {
    throw new Error(
      "JWT_SECRET uses a forbidden placeholder value in production",
    );
  }
  if (/^(.)\1+$/.test(secret)) {
    throw new Error("JWT_SECRET is too weak for production");
  }
  if (
    /(change|changeme|placeholder|example|dev-only|development|default|sample)/i.test(
      secret,
    )
  ) {
    throw new Error("JWT_SECRET looks like a placeholder value in production");
  }
}

const port = Number(process.env.PORT ?? 4000);
const rateLimitWindowMs = Number(
  process.env.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000,
);
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX ?? 100);
const authRateLimitMax = Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10);
const bcryptRounds = Number(process.env.BCRYPT_ROUNDS ?? 12);
const jwtSecret = requiredInProduction(
  "JWT_SECRET",
  IS_PRODUCTION ? "" : "dev-only-change-this-secret-please-123456789",
);

assertProductionJwtSecret(jwtSecret);

export const env = {
  NODE_ENV,
  IS_PRODUCTION,
  PORT: Number.isNaN(port) ? 4000 : port,
  MONGODB_URI: requiredInProduction("MONGODB_URI", ""),
  MONGODB_DB_NAME: value("MONGODB_DB_NAME", "awk_video_editor"),
  DEFAULT_PROJECT_ID: value("DEFAULT_PROJECT_ID", "demo-project"),
  RATE_LIMIT_WINDOW_MS: Number.isNaN(rateLimitWindowMs)
    ? 15 * 60 * 1000
    : rateLimitWindowMs,
  RATE_LIMIT_MAX: Number.isNaN(rateLimitMax) ? 100 : rateLimitMax,
  AUTH_RATE_LIMIT_MAX:
    Number.isFinite(authRateLimitMax) && authRateLimitMax > 0
      ? authRateLimitMax
      : 10,
  JWT_SECRET: jwtSecret,
  JWT_EXPIRES_IN: value("JWT_EXPIRES_IN", "1h"),
  JWT_ISSUER: requiredInProduction(
    "JWT_ISSUER",
    IS_PRODUCTION ? "" : "awk-video-editor-api",
  ),
  JWT_AUDIENCE: requiredInProduction(
    "JWT_AUDIENCE",
    IS_PRODUCTION ? "" : "awk-video-editor-client",
  ),
  JWT_ALGORITHM: "HS256" as const,
  BCRYPT_ROUNDS:
    Number.isFinite(bcryptRounds) && bcryptRounds >= 10 && bcryptRounds <= 15
      ? bcryptRounds
      : 12,
  OPENAI_API_KEY: value("OPENAI_API_KEY", ""),
};
