const { packageCodeArtifacts } = require('../index');

jest.mock('@actions/core');
jest.mock('fs/promises');
jest.mock('adm-zip');
jest.mock('path');

describe('Code Artifacts Tests', () => {
  test('should throw error when artifactsDir is not provided', async () => {
    await expect(packageCodeArtifacts()).rejects.toThrow('Code artifacts directory path must be provided');
  });

  test('should throw error when artifactsDir is null', async () => {
    await expect(packageCodeArtifacts(null)).rejects.toThrow('Code artifacts directory path must be provided');
  });

  test('should throw error when artifactsDir is empty string', async () => {
    await expect(packageCodeArtifacts('')).rejects.toThrow('Code artifacts directory path must be provided');
  });
});