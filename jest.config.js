module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: './',
  globals: {
    'ts-jest': {
      tsConfig: 'tsconfig.test.json',
    },
  },
  // We use an increased timeout here because in the worst case
  // AWS SAM needs to download a docker image before the test can run
  testTimeout: 60000,
};
