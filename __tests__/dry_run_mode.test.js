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

  test('should check if function exists even in dry run mode', async () => {
    const mockSend = jest.fn()
      // First call: checkFunctionExists - function exists
      .mockResolvedValueOnce({ Runtime: 'nodejs18.x' })
      // Second call: GetFunctionConfigurationCommand for config check
      .mockResolvedValueOnce({ Runtime: 'nodejs18.x', MemorySize: 256 })
      // Third call: UpdateFunctionCodeCommand dry run
      .mockResolvedValueOnce({
        FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
        Version: '$LATEST'
      });

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
    const fs = require('fs/promises');
    fs.readFile = jest.fn().mockResolvedValue(Buffer.from('test'));

    await mainModule.run();

    // Verify that checkFunctionExists was called (first send call should be GetFunctionConfigurationCommand)
    expect(mockSend).toHaveBeenCalled();
    expect(mockSend.mock.calls[0][0].constructor.name).toEqual('GetFunctionConfigurationCommand');

    // Verify dry run proceeded successfully
    expect(core.info).toHaveBeenCalledWith('Checking if test-function exists');
    expect(core.info).toHaveBeenCalledWith('DRY RUN MODE: No AWS resources will be created or modified');
    expect(core.setFailed).not.toHaveBeenCalledWith('DRY RUN MODE can only be used for updating function code of existing functions');
  });

  test('should fail dry run mode when function does not exist', async () => {
    const mockSend = jest.fn()
      // checkFunctionExists - function does not exist (ResourceNotFoundException)
      .mockRejectedValueOnce({ name: 'ResourceNotFoundException' });

    const mockClient = { send: mockSend };
    LambdaClient.mockImplementation(() => mockClient);

    validations.validateAllInputs = jest.fn().mockReturnValue({
      valid: true,
      functionName: 'non-existent-function',
      parsedEnvironment: {},
      dryRun: true,
      codeArtifactsDir: './code'
    });

    jest.spyOn(mainModule, 'packageCodeArtifacts').mockResolvedValue('/tmp/test.zip');

    await mainModule.run();

    // Verify that checkFunctionExists was called (first send call should be GetFunctionConfigurationCommand)
    expect(mockSend).toHaveBeenCalled();
    expect(mockSend.mock.calls[0][0].constructor.name).toEqual('GetFunctionConfigurationCommand');

    // Verify dry run failed with correct error message
    expect(core.info).toHaveBeenCalledWith('Checking if non-existent-function exists');
    expect(core.info).toHaveBeenCalledWith('DRY RUN MODE: No AWS resources will be created or modified');
    expect(core.setFailed).toHaveBeenCalledWith('DRY RUN MODE can only be used for updating function code of existing functions');
  });
});
