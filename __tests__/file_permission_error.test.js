const core = require('@actions/core');
const fs = require('fs/promises');
const { createFunction } = require('../index');

jest.mock('@actions/core');
jest.mock('fs/promises');

describe('File Permission Error Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should handle EACCES error when reading zip file', async () => {
    const mockClient = { send: jest.fn() };
    const error = new Error('Permission denied');
    error.code = 'EACCES';
    
    fs.readFile = jest.fn().mockRejectedValue(error);

    const inputs = {
      functionName: 'test-function',
      finalZipPath: '/tmp/test.zip',
      dryRun: false,
      role: 'arn:aws:iam::123456789012:role/lambda-role'
    };

    await expect(createFunction(mockClient, inputs, false)).rejects.toThrow();
    
    expect(core.setFailed).toHaveBeenCalledWith('Failed to read Lambda deployment package: Permission denied');
    expect(core.error).toHaveBeenCalledWith('Permission denied. Check file access permissions.');
  });
});