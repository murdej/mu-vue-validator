import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'jsdom',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: './tsconfig.test.json',
      diagnostics: false,
    }],
    '^.+\\.m?js$': ['ts-jest', {
      useESM: true,
      diagnostics: false,
    }],
  },
  transformIgnorePatterns: [
    '/node_modules/.pnpm/(?!(vue|@vue|vue-router|@vue\\+test-utils)@)',
  ],
};

export default config;
