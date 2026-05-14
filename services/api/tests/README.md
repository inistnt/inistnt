# Inistnt API Test Suite

Industry-grade testing infrastructure for the Inistnt API service.

## 🏗 Architecture

The test suite is divided into three layers:

1.  **Unit Tests (`tests/unit/`)**:
    *   Tests individual services, utilities, and logic in isolation.
    *   Dependencies (DB, Redis, Kafka, S3) are **completely mocked**.
    *   Fastest execution time.
2.  **Integration Tests**:
    *   Tests repository-level logic against a real (test) database.
    *   (Currently merged into E2E/Unit mocks for speed, but can be expanded).
3.  **E2E Tests (`tests/e2e/`)**:
    *   Tests full HTTP round-trips using Fastify's `inject()`.
    *   Uses real routes but mocked infrastructure to ensure consistency and speed in CI.

## 🚀 Running Tests

### All Tests
```bash
pnpm test
```

### Unit Tests Only
```bash
pnpm test:unit
```

### E2E Tests Only
```bash
pnpm test:e2e
```

### Coverage Report
```bash
pnpm test:coverage
```

## 🛠 Tooling

*   **Jest**: Test runner.
*   **ts-jest**: TypeScript support for Jest.
*   **@faker-js/faker**: Deterministic test data generation.
*   **ioredis-mock**: In-memory Redis emulation.
*   **Prisma Mocking**: Centralized `database.mock.ts` for all models.

## 📁 Directory Structure

```text
tests/
├── e2e/           # HTTP Round-trip tests
├── fixtures/      # Faker-powered data factories
├── helpers/       # App builder & Auth helpers
├── mocks/         # Infra mocks (DB, Redis, Kafka, S3)
├── setup/         # Global Jest setup/teardown
└── unit/          # Pure logic tests
```

## 🔐 Environment Variables

Tests use `.env.test` in the API root. Never use production secrets here. Dummy credentials are provided for all external services.
