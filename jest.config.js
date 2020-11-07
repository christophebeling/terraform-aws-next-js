module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: './',
  globalSetup: '<rootDir>/test/jest.setup.ts',
  globals: {
    'ts-jest': {
      tsConfig: 'tsconfig.test.json',
    },
  },
};
