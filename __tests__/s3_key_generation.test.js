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

describe('S3 Key Generation and Dry Run Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AWS_REGION = 'us-east-1';
  });

  test('should auto-generate S3 key when not provided', async () => {
    validations.validateAllInputs = jest.fn().mockReturnValue({
      valid: true,
      functionName: 'test-function',
      s3Bucket: 'test-bucket',
      s3Key: '',
      useS3Method: true
    });

    jest.spyOn(mainModule, 'generateS3Key').mockReturnValue('auto-generated-key.zip');
    jest.spyOn(mainModule, 'checkFunctionExists').mockResolvedValue(true);
    jest.spyOn(mainModule, 'packageCodeArtifacts').mockResolvedValue('/tmp/test.zip');
    jest.spyOn(mainModule, 'createFunction').mockResolvedValue();
    jest.spyOn(mainModule, 'hasConfigurationChanged').mockReturnValue(false);
    jest.spyOn(mainModule, 'updateFunctionCode').mockResolvedValue();

    await mainModule.run();
  });

  test('should log dry run message and fail when function does not exist', async () => {
    const mockSend = jest.fn()
      // checkFunctionExists - function does not exist (ResourceNotFoundException)
      .mockRejectedValueOnce({ name: 'ResourceNotFoundException' });

    const mockClient = { send: mockSend };
    LambdaClient.mockImplementation(() => mockClient);

    validations.validateAllInputs = jest.fn().mockReturnValue({
      valid: true,
      functionName: 'test-function',
      parsedEnvironment: {},
      dryRun: true,
      codeArtifactsDir: './code'
    });

    jest.spyOn(mainModule, 'packageCodeArtifacts').mockResolvedValue('/tmp/test.zip');

    await mainModule.run();

    expect(core.info).toHaveBeenCalledWith('DRY RUN MODE: No AWS resources will be created or modified');
    expect(core.setFailed).toHaveBeenCalledWith('DRY RUN MODE can only be used for updating function code of existing functions');
  });
});
