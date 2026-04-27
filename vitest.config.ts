import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    projects: [
      {
        name: 'unit',
        test: {
          include: ['test/unit/**/*.test.ts']
        }
      },
      {
        name: 'fixtures',
        test: {
          include: ['test/fixtures/**/*.test.ts']
        }
      },
      {
        name: 'smoke',
        test: {
          include: ['test/smoke/**/*.test.ts']
        }
      },
      {
        name: 'reference',
        test: {
          include: ['test/reference/**/*.test.ts']
        }
      },
      {
        name: 'invariant',
        test: {
          include: ['test/invariant/**/*.test.ts']
        }
      },
      {
        name: 'e2e',
        test: {
          include: ['test/e2e/**/*.test.ts']
        }
      },
      {
        name: 'cli',
        test: {
          include: ['test/cli/**/*.test.ts'],
          testTimeout: 60_000,
        }
      },
      {
        name: 'mcp',
        test: {
          include: ['test/mcp/**/*.test.ts']
        }
      }
    ]
  }
});
