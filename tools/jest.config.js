module.exports = {
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {isolatedModules: true}],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
};
