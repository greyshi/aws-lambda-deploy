const core = require('@actions/core');
const { LambdaClient } = require('@aws-sdk/client-lambda');
const mainModule = require('../index');
const validations = require('../validations');

jest.mock('@actions/core');
jest.mock('@aws-sdk/client-lambda');
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/client-sts');
jest.mock('fs/promises');
jest.mock('adm-zip');
jest.mock('path');

describe('Dry Run Mode Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.WS_REGION = 'us-east-1';
  });

  test('should skip configuration updates in dry run mode when config changed', async () => {
    const mockClient = {
      send: jest.fn().mockResolvedValue({ Runtime: 'nodejs18.x', MemorySize: 256 })
    };
    LambdaClient.mockImplementation(() => mockClient);

    validations.validateAllInputs = jest.fn().mockReturnValue({
      valid: true,
      functionName: 'test-function',
      parsedEnvironment: {},
      dryRun: true,
      role: 'arn:aws:iam::123456789012:role/lambda-role'
    });

    jest.spyOn(mainModule, 'checkFunctionExists').mockResolvedValue(true);
    jest.spyOn(mainModule, 'packageCodeArtifacts').mockResolvedValue('/tmp/test.zip');
    jest.spyOn(mainModule, 'createFunction').mockResolvedValue();
    jest.spyOn(mainModule, 'hasConfigurationChanged').mockReturnValue(true);

    await mainModule.run();
  });
});