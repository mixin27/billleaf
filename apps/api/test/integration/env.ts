import { testDatabaseUrl } from "./test-db.js"

// Environment for the Nest app under test (no .env file is read).
process.env.NODE_ENV = "test"
process.env.LOG_LEVEL = "error"
process.env.DATABASE_URL = testDatabaseUrl()
process.env.REDIS_URL ??= "redis://localhost:6379"
process.env.BETTER_AUTH_SECRET =
  "integration-test-secret-integration-test-secret"
process.env.API_URL = "http://localhost:4000"
process.env.WEB_URL = "http://localhost:3000"
process.env.TRUSTED_ORIGINS = ""
process.env.SMTP_URL = "smtp://localhost:1025"
process.env.SENTRY_DSN = ""
process.env.PLATFORM_ADMIN_EMAILS = "platform.admin@example.test"
process.env.HEALTH_CHECK_TOKEN = "integration-health-token-0123456789"
process.env.APP_VERSION = "test-build"
process.env.S3_BUCKET = "billleaf-test"
process.env.S3_ENDPOINT ??= "http://localhost:8333"
