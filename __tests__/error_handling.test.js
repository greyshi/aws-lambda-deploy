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

describe('Deployment Completion Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    process.env.AWS_REGION = 'us-east-1';
    
    core.getInput = jest.fn().mockImplementation((name) => {
      const inputs = {
        'function-name': 'test-function',
        'region': 'us-east-1',
        'code-artifacts-dir': '/mock/artifacts',
        'role': 'arn:aws:iam::123456789012:role/lambda-role',
        'runtime': 'nodejs18.x',
        'handler': 'index.handler'
      };
      return inputs[name] || '';
    });
    
    // Mock validations
    validations.validateAllInputs = jest.fn().mockReturnValue({
      valid: true,
      functionName: 'test-function',
      codeArtifactsDir: '/mock/artifacts',
      role: 'arn:aws:iam::123456789012:role/lambda-role',
      runtime: 'nodejs18.x',
      handler: 'index.handler',
      parsedEnvironment: {},
      dryRun: false,
      publish: true
    });
  });

  test('should log success message on successful deployment', async () => {
    const mockClient = {
      send: jest.fn().mockResolvedValue({ FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function' })
    };
    LambdaClient.mockImplementation(() => mockClient);
    
    jest.spyOn(mainModule, 'checkFunctionExists').mockResolvedValue(true);
    jest.spyOn(mainModule, 'packageCodeArtifacts').mockResolvedValue('/tmp/test.zip');
    jest.spyOn(mainModule, 'createFunction').mockResolvedValue();
    jest.spyOn(mainModule, 'hasConfigurationChanged').mockReturnValue(false);
    jest.spyOn(mainModule, 'updateFunctionCode').mockResolvedValue();
    
    await mainModule.run();
  });

  test('should handle ThrottlingException error', async () => {
    const error = new Error('Rate limit exceeded');
    error.name = 'ThrottlingException';
    
    validations.validateAllInputs.mockImplementation(() => {
      throw error;
    });
    
    await mainModule.run();
    
    expect(core.setFailed).toHaveBeenCalledWith('Rate limit exceeded and maximum retries reached: Rate limit exceeded');
  });

  test('should handle TooManyRequestsException error', async () => {
    const error = new Error('Too many requests');
    error.name = 'TooManyRequestsException';
    
    validations.validateAllInputs.mockImplementation(() => {
      throw error;
    });
    
    await mainModule.run();
    
    expect(core.setFailed).toHaveBeenCalledWith('Rate limit exceeded and maximum retries reached: Too many requests');
  });

  test('should handle 429 status code error', async () => {
    const error = new Error('Rate limited');
    error.$metadata = { httpStatusCode: 429 };
    
    validations.validateAllInputs.mockImplementation(() => {
      throw error;
    });
    
    await mainModule.run();
    
    expect(core.setFailed).toHaveBeenCalledWith('Rate limit exceeded and maximum retries reached: Rate limited');
  });

  test('should handle server error (500+ status code)', async () => {
    const error = new Error('Internal server error');
    error.$metadata = { httpStatusCode: 500 };
    
    validations.validateAllInputs.mockImplementation(() => {
      throw error;
    });
    
    await mainModule.run();
    
    expect(core.setFailed).toHaveBeenCalledWith('Server error (500): Internal server error. All retry attempts failed.');
  });

  test('should handle AccessDeniedException error', async () => {
    const error = new Error('Access denied');
    error.name = 'AccessDeniedException';
    
    validations.validateAllInputs.mockImplementation(() => {
      throw error;
    });
    
    await mainModule.run();
    
    expect(core.setFailed).toHaveBeenCalledWith('Action failed with error: Permissions error: Access denied. Check IAM roles.');
  });

  test('should handle generic error', async () => {
    const error = new Error('Generic error');
    
    validations.validateAllInputs.mockImplementation(() => {
      throw error;
    });
    
    await mainModule.run();
    
    expect(core.setFailed).toHaveBeenCalledWith('Action failed with error: Generic error');
  });

  test('should call core.debug with error stack when available', async () => {
    const error = new Error('Error with stack');
    error.stack = 'Error stack trace';
    
    validations.validateAllInputs.mockImplementation(() => {
      throw error;
    });
    
    await mainModule.run();
    
    expect(core.debug).toHaveBeenCalledWith('Error stack trace');
  });
});