import type { Config } from 'jest';

const config: Config = {
  projects: [
    // ─── UNIT TESTS ──────────────────────────────────────────
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/tests/unit'],
      setupFilesAfterFramework: ['<rootDir>/tests/setup/jest.setup.ts'],
      moduleNameMapper: {
        '^../../infrastructure/database$': '<rootDir>/tests/mocks/database.mock.ts',
        '^../../infrastructure/redis$': '<rootDir>/tests/mocks/redis.mock.ts',
        '^../../infrastructure/kafka$': '<rootDir>/tests/mocks/kafka.mock.ts',
        '^../infrastructure/database$': '<rootDir>/tests/mocks/database.mock.ts',
        '^../infrastructure/redis$': '<rootDir>/tests/mocks/redis.mock.ts',
        '^../infrastructure/kafka$': '<rootDir>/tests/mocks/kafka.mock.ts',
      },
      globals: {
        'ts-jest': {
          tsconfig: {
            strict: false,
            esModuleInterop: true,
          },
        },
      },
    },

    // ─── E2E TESTS ───────────────────────────────────────────
    {
      displayName: 'e2e',
      testMatch: ['<rootDir>/tests/e2e/**/*.test.ts'],
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/tests/e2e'],
      setupFilesAfterFramework: ['<rootDir>/tests/setup/jest.setup.ts'],
      testTimeout: 30000,
      globals: {
        'ts-jest': {
          tsconfig: {
            strict: false,
            esModuleInterop: true,
          },
        },
      },
    },
  ],

  // ─── COVERAGE ──────────────────────────────────────────────
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/server.ts',
    '!src/**/*.d.ts',
    '!src/infrastructure/database.ts',
  ],
  coverageThreshold: {
    global: {
      lines: 70,
      functions: 70,
      branches: 60,
      statements: 70,
    },
  },
  coverageReporters: ['text', 'lcov', 'html'],
  coverageDirectory: 'coverage',
};

export default config;
