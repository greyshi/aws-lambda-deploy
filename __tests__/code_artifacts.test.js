const { packageCodeArtifacts } = require('../index');
const fs = require('fs/promises');
const AdmZip = require('adm-zip');
const path = require('path');
const os = require('os');
const validations = require('../validations');

jest.mock('@actions/core');
jest.mock('fs/promises');
jest.mock('adm-zip');
jest.mock('path');
jest.mock('os');
jest.mock('../validations');

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

  test('should throw ZIP validation error when stat fails', async () => {
    const mockTimestamp = 1234567890;
    global.Date.now = jest.fn().mockReturnValue(mockTimestamp);
    
    os.tmpdir = jest.fn().mockReturnValue('/mock/tmp');
    path.join.mockImplementation((...parts) => parts.join('/'));
    
    fs.rm.mockResolvedValue(undefined);
    fs.mkdir.mockResolvedValue(undefined);
    fs.access.mockResolvedValue(undefined);
    fs.readdir.mockResolvedValue(['file1.js']);
    fs.cp.mockResolvedValue(undefined);
    
    const mockZipInstance = {
      addLocalFile: jest.fn(),
      writeZip: jest.fn()
    };
    AdmZip.mockImplementation(() => mockZipInstance);
    
    fs.readdir.mockImplementation((dir, options) => {
      if (options && options.withFileTypes) {
        return Promise.resolve([{ name: 'file1.js', isDirectory: () => false }]);
      }
      return Promise.resolve(['file1.js']);
    });
    
    fs.stat.mockRejectedValue(new Error('Stat failed'));
    
    validations.validateAndResolvePath = jest.fn().mockReturnValue('/resolved/path');
    
    await expect(packageCodeArtifacts('/mock/artifacts')).rejects.toThrow('ZIP validation failed: Stat failed');
  });
});