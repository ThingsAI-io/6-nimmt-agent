import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

// Node built-in modules banned from engine code (bare and node:-prefixed)
const bannedNodeModules = [
  'fs', 'path', 'child_process', 'http', 'https', 'net',
  'dgram', 'dns', 'tls', 'cluster', 'worker_threads', 'os'
];

const bannedImportPatterns = bannedNodeModules.flatMap(mod => [
  { name: mod, message: `I/O module "${mod}" is banned in engine code.` },
  { name: `node:${mod}`, message: `I/O module "node:${mod}" is banned in engine code.` }
]);

// Fixture file names that must not appear as string literals in engine code
const fixtureNames = [
  'cattle-heads', 'placement-scenarios', 'overflow-scenarios',
  'must-pick-row', 'round-scoring', 'full-game-traces'
];

const fixtureSelectors = fixtureNames.map(name => ({
  selector: `Literal[value=/.*${name}.*/]`,
  message: `Fixture name "${name}" is banned in engine code.`
}));

// Test API identifiers banned in engine code
const testApis = ['describe', 'it', 'test', 'expect', 'jest', 'vitest'];

const testApiSelectors = testApis.map(api => ({
  selector: `Identifier[name="${api}"]`,
  message: `Test API "${api}" is banned in engine code.`
}));

export default [
  {
    ignores: ['node_modules/', 'dist/', '**/*.d.ts', '**/*.js.map', '**/*.d.ts.map']
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/explicit-module-boundary-types': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['error', 'warn'] }]
    }
  },
  // Anti-cheat rules scoped to engine code
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      // 1. I/O ban: no Node built-in I/O modules
      'no-restricted-imports': ['error', {
        paths: bannedImportPatterns
      }],
      // 2-4. AST-based bans via no-restricted-syntax
      'no-restricted-syntax': ['error',
        // 2. process.env ban
        {
          selector: 'MemberExpression[object.name="process"][property.name="env"]',
          message: 'process.env access is banned in engine code.'
        },
        // 3. Fixture name ban
        ...fixtureSelectors,
        // 4. Test API ban
        ...testApiSelectors,
        // 5. Dependency boundary: no imports from sim, cli, or mcp
        {
          selector: 'ImportDeclaration[source.value=/.*[\\/]sim[\\/].*/]',
          message: 'Engine code cannot import from src/sim/.'
        },
        {
          selector: 'ImportDeclaration[source.value=/.*[\\/]cli[\\/].*/]',
          message: 'Engine code cannot import from src/cli/.'
        },
        {
          selector: 'ImportDeclaration[source.value=/.*[\\/]mcp[\\/].*/]',
          message: 'Engine code cannot import from src/mcp/.'
        }
      ]
    }
  }
];
