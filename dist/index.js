/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 216:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const core = __nccwpck_require__(56);
const { LambdaClient, CreateFunctionCommand, GetFunctionConfigurationCommand, UpdateFunctionConfigurationCommand, UpdateFunctionCodeCommand, waitUntilFunctionUpdated } = __nccwpck_require__(965);
const { S3Client, PutObjectCommand, CreateBucketCommand, HeadBucketCommand, PutBucketEncryptionCommand, PutPublicAccessBlockCommand, PutBucketVersioningCommand} = __nccwpck_require__(998);
const { STSClient, GetCallerIdentityCommand } = __nccwpck_require__(448);
const fs = __nccwpck_require__(943); 
const path = __nccwpck_require__(928);
const AdmZip = __nccwpck_require__(931);
const validations = __nccwpck_require__(584);
const { version } = __nccwpck_require__(330);
async function run() {
  try {  

    // Receiving and validating inputs
    const inputs = validations.validateAllInputs();
    if (!inputs.valid) {
      return;
    }

    const {
      functionName, codeArtifactsDir,
      ephemeralStorage, parsedMemorySize, timeout,
      role, codeSigningConfigArn, kmsKeyArn, sourceKmsKeyArn,
      environment, vpcConfig, deadLetterConfig, tracingConfig, 
      layers, fileSystemConfigs, imageConfig, snapStart, 
      loggingConfig, tags,
      parsedEnvironment, parsedVpcConfig, parsedDeadLetterConfig, 
      parsedTracingConfig, parsedLayers, parsedFileSystemConfigs, 
      parsedImageConfig, parsedSnapStart, parsedLoggingConfig, parsedTags,
      functionDescription, dryRun, publish, revisionId,
      runtime, handler, architectures
    } = inputs;

    const region = process.env.AWS_REGION;

    // Set up custom user agent string
    const customUserAgentString = `LambdaGitHubAction/${version}`;
    core.info(`Setting custom user agent: ${customUserAgentString}`);

    // Creating new Lambda client
    const client = new LambdaClient({
      region,
      customUserAgent: customUserAgentString
    });
      
    // Handling S3 Buckets
    const { s3Bucket, useS3Method } = inputs;
    let s3Key = inputs.s3Key;
    if (s3Bucket && !s3Key) {
      s3Key = generateS3Key(functionName);
      core.info(`No S3 key provided. Auto-generated key: ${s3Key}`);
    }

    // Determine if function exists
    let functionExists;
    if (!dryRun) {
      core.info(`Checking if ${functionName} exists`);
      functionExists = await checkFunctionExists(client, functionName);
    }
    if (dryRun) {
      core.info('DRY RUN MODE: No AWS resources will be created or modified');
      if (!functionExists) {
        core.setFailed('DRY RUN MODE can only be used for updating function code of existing functions');
        return; 
      }
    }
    
    // Creating zip file
    core.info(`Packaging code artifacts from ${codeArtifactsDir}`);
    let finalZipPath = await packageCodeArtifacts(codeArtifactsDir);

    // Create function
    await createFunction(client, {
      functionName, region, finalZipPath, dryRun, role,
      s3Bucket, s3Key, sourceKmsKeyArn, runtime, handler,
      functionDescription, parsedMemorySize, timeout,
      publish, architectures, ephemeralStorage,
      revisionId, vpcConfig, parsedEnvironment, deadLetterConfig,
      tracingConfig, layers, fileSystemConfigs, imageConfig,
      snapStart, loggingConfig, tags, kmsKeyArn, codeSigningConfigArn,
      parsedVpcConfig, parsedDeadLetterConfig, parsedTracingConfig,
      parsedLayers, parsedFileSystemConfigs, parsedImageConfig,
      parsedSnapStart, parsedLoggingConfig, parsedTags
    }, functionExists);

    // Update function configuration
    core.info(`Getting current configuration for function ${functionName}`);
    const configCommand = new GetFunctionConfigurationCommand({FunctionName: functionName});
    let currentConfig = await client.send(configCommand);

    const configChanged = hasConfigurationChanged(currentConfig, {
      ...(role && { Role: role }),
      ...(handler && { Handler: handler }),
      ...(functionDescription && { Description: functionDescription }),
      ...(parsedMemorySize && { MemorySize: parsedMemorySize }),
      ...(timeout && { Timeout: timeout }),
      ...(runtime && { Runtime: runtime }),
      ...(kmsKeyArn && { KMSKeyArn: kmsKeyArn }),
      ...(ephemeralStorage && { EphemeralStorage: { Size: ephemeralStorage } }),
      ...(vpcConfig && { VpcConfig: parsedVpcConfig }),
      Environment: { Variables: parsedEnvironment },
      ...(deadLetterConfig && { DeadLetterConfig: parsedDeadLetterConfig }),
      ...(tracingConfig && { TracingConfig: parsedTracingConfig }),
      ...(layers && { Layers: parsedLayers }),
      ...(fileSystemConfigs && { FileSystemConfigs: parsedFileSystemConfigs }),
      ...(imageConfig && { ImageConfig: parsedImageConfig }),
      ...(snapStart && { SnapStart: parsedSnapStart }),
      ...(loggingConfig && { LoggingConfig: parsedLoggingConfig })
    });

    if (configChanged) {
      if (dryRun) {
        core.info('[DRY RUN] Configuration updates are not simulated in dry run mode');
        return;
      } 

      await updateFunctionConfiguration(client, {
        functionName,
        role,
        handler,
        functionDescription,
        parsedMemorySize,
        timeout,
        runtime,
        kmsKeyArn,
        ephemeralStorage,
        vpcConfig,
        parsedEnvironment,
        deadLetterConfig,
        tracingConfig,
        layers,
        fileSystemConfigs,
        imageConfig,
        snapStart,
        loggingConfig,
        parsedVpcConfig,
        parsedDeadLetterConfig,
        parsedTracingConfig,
        parsedLayers,
        parsedFileSystemConfigs,
        parsedImageConfig,
        parsedSnapStart,
        parsedLoggingConfig
      });
    } else {
      core.info('No configuration changes detected');
    }

    // Update Function Code
    await updateFunctionCode(client, {
      functionName,
      finalZipPath,
      useS3Method,
      s3Bucket,
      s3Key,
      codeArtifactsDir,
      architectures,
      publish,
      revisionId,
      sourceKmsKeyArn,
      dryRun,
      region
    });

    core.info('Lambda function deployment completed successfully');
    
  } catch (error) {
    if (error.name === 'ThrottlingException' || error.name === 'TooManyRequestsException' || error.$metadata?.httpStatusCode === 429) {
      core.setFailed(`Rate limit exceeded and maximum retries reached: ${error.message}`);
    } else if (error.$metadata?.httpStatusCode >= 500) {
      core.setFailed(`Server error (${error.$metadata?.httpStatusCode}): ${error.message}. All retry attempts failed.`);
    } else if (error.name === 'AccessDeniedException') {
      core.setFailed(`Action failed with error: Permissions error: ${error.message}. Check IAM roles.`);
    } else {
      core.setFailed(`Action failed with error: ${error.message}`);
    }
    if (error.stack) {
      core.debug(error.stack);
    }
  }
}

// Helper functions for zip files
async function packageCodeArtifacts(artifactsDir) {
  const tempDir = path.join((__nccwpck_require__(857).tmpdir)(), `lambda-temp-${Date.now()}`);
  const zipPath = path.join((__nccwpck_require__(857).tmpdir)(), `lambda-function-${Date.now()}.zip`);
  
  try {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
    }
    
    await fs.mkdir(tempDir, { recursive: true });

    const workingDir = process.cwd();
    
    if (!artifactsDir) {
      throw new Error('Code artifacts directory path must be provided');
    }
    
    const resolvedArtifactsDir = validations.validateAndResolvePath(artifactsDir, workingDir);
    
    core.info(`Copying artifacts from ${resolvedArtifactsDir} to ${tempDir}`);
    
    try {
      await fs.access(resolvedArtifactsDir);
    } catch (error) {
      throw new Error(`Code artifacts directory '${resolvedArtifactsDir}' does not exist or is not accessible: ${error.message}`);
    }
    
    const sourceFiles = await fs.readdir(resolvedArtifactsDir);
    
    if (sourceFiles.length === 0) {
      throw new Error(`Code artifacts directory '${resolvedArtifactsDir}' is empty, no files to package`);
    }
    
    core.info(`Found ${sourceFiles.length} files/directories to copy`);
    
    for (const file of sourceFiles) {
      const sourcePath = path.join(resolvedArtifactsDir, file);
      const destPath = path.join(tempDir, file);
      
      core.info(`Copying ${sourcePath} to ${destPath}`);
      
      await fs.cp(
        sourcePath,
        destPath,
        { recursive: true }
      );
    }

    core.info('Creating ZIP file with standard options');
    const zip = new AdmZip();
    
    const tempFiles = await fs.readdir(tempDir, { withFileTypes: true });
    
    for (const file of tempFiles) {
      const fullPath = path.join(tempDir, file.name);
      
      if (file.isDirectory()) {
        core.info(`Adding directory: ${file.name}`);
        zip.addLocalFolder(fullPath, file.name);
      } else {
        core.info(`Adding file: ${file.name}`);
        zip.addLocalFile(fullPath);
      }
    }
    
    core.info('Writing ZIP file with standard options');
    zip.writeZip(zipPath);
    
    try {
      const stats = await fs.stat(zipPath);
      core.info(`Generated ZIP file size: ${stats.size} bytes`);
      
      const verifyZip = new AdmZip(zipPath);
      const entries = verifyZip.getEntries();
      
      core.info(`ZIP verification passed - contains ${entries.length} entries:`);
      for (let i = 0; i < entries.length; i++) {
        core.info(`  ${i+1}. ${entries[i].entryName} (${entries[i].header.size} bytes)`);
      }
    } catch (error) {
      throw new Error(`ZIP validation failed: ${error.message}`);
    }

    return zipPath;
  } catch (error) {
    core.error(`Failed to package artifacts: ${error.message}`);
    throw error;
  }
}


//Helper function for checking if function exists
async function checkFunctionExists(client, functionName) {
  try {
    const input = {
      FunctionName: functionName
    };
    const command = new GetFunctionConfigurationCommand(input);
    await client.send(command);
    return true;
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      return false;
    }
    throw error;
  }
}

// Helper functions for creating Lambda function
async function createFunction(client, inputs, functionExists) {
  const {
    functionName, region, finalZipPath, dryRun, role, s3Bucket, s3Key, 
    sourceKmsKeyArn, runtime, handler, functionDescription, parsedMemorySize,
    timeout, publish, architectures, ephemeralStorage, revisionId,
    vpcConfig, parsedEnvironment, deadLetterConfig, tracingConfig,
    layers, fileSystemConfigs, imageConfig, snapStart, loggingConfig, tags,
    kmsKeyArn, codeSigningConfigArn, parsedVpcConfig, parsedDeadLetterConfig,
    parsedTracingConfig, parsedLayers, parsedFileSystemConfigs, parsedImageConfig,
    parsedSnapStart, parsedLoggingConfig, parsedTags
  } = inputs;
  
  if (!functionExists) {
      if (dryRun) {
        core.setFailed('DRY RUN MODE can only be used for updating function code of existing functions');
        return; 
      }

      core.info(`Function ${functionName} doesn't exist, creating new function`);

      if(!role) {
        core.setFailed('Role ARN must be provided when creating a new function');
        return;
      }

      try {
        core.info('Creating Lambda function with deployment package');

        let codeParameter;

        if (s3Bucket) {
          try {
            await uploadToS3(finalZipPath, s3Bucket, s3Key, region);
            core.info(`Successfully uploaded package to S3: s3://${s3Bucket}/${s3Key}`);
            
            codeParameter = {
              S3Bucket: s3Bucket,
              S3Key: s3Key,
              ...(sourceKmsKeyArn && { SourceKmsKeyArn: sourceKmsKeyArn })
            };
          } catch (error) {
            core.setFailed(`Failed to upload package to S3: ${error.message}`);
            if (error.stack) {
              core.debug(error.stack);
            }
            throw error; 
          }
        } else {
          try {
            const zipFileContent = await fs.readFile(finalZipPath);
            core.info(`Zip file read successfully, size: ${zipFileContent.length} bytes`);
            
            codeParameter = {
              ZipFile: zipFileContent,
              ...(sourceKmsKeyArn && { SourceKmsKeyArn: sourceKmsKeyArn })
            };
          } catch (error) {
            if (error.code === 'EACCES') {
              core.setFailed(`Failed to read Lambda deployment package: Permission denied`);
              core.error('Permission denied. Check file access permissions.');
            } else {
              core.setFailed(`Failed to read Lambda deployment package: ${error.message}`);
            }
            if (error.stack) {
              core.debug(error.stack);
            }
            throw error; 
          }
        }

        const input = {
          FunctionName: functionName,
          Code: codeParameter,
          ...(runtime && { Runtime: runtime }),
          ...(role && { Role: role }),
          ...(handler && { Handler: handler }),
          ...(functionDescription && { Description: functionDescription }),
          ...(parsedMemorySize && { MemorySize: parsedMemorySize }),
          ...(timeout && { Timeout: timeout }),
          ...(publish !== undefined && { Publish: publish }),
          ...(architectures && { Architectures: Array.isArray(architectures) ? architectures : [architectures] }),
          ...(ephemeralStorage && { EphemeralStorage: { Size: ephemeralStorage } }),
          ...(revisionId && { RevisionId: revisionId }),
          ...(vpcConfig && { VpcConfig: parsedVpcConfig }),
          Environment: { Variables: parsedEnvironment },
          ...(deadLetterConfig && { DeadLetterConfig: parsedDeadLetterConfig }),
          ...(tracingConfig && { TracingConfig: parsedTracingConfig }),
          ...(layers && { Layers: parsedLayers }),
          ...(fileSystemConfigs && { FileSystemConfigs: parsedFileSystemConfigs }),
          ...(imageConfig && { ImageConfig: parsedImageConfig }),
          ...(snapStart && { SnapStart: parsedSnapStart }),
          ...(loggingConfig && { LoggingConfig: parsedLoggingConfig }),
          ...(tags && { Tags: parsedTags }),
          ...(kmsKeyArn && { KMSKeyArn: kmsKeyArn }),
          ...(codeSigningConfigArn && { CodeSigningConfigArn: codeSigningConfigArn }),
        };

        core.info(`Creating new Lambda function: ${functionName}`);
        const command = new CreateFunctionCommand(input);
        const response = await client.send(command);
        
        core.setOutput('function-arn', response.FunctionArn);
        if (response.Version) {
          core.setOutput('version', response.Version);
        }
        
        core.info('Lambda function created successfully');
        
        core.info(`Waiting for function ${functionName} to become active before proceeding`);
        await waitForFunctionActive(client, functionName);
      } catch (error) {
        if (error.name === 'ThrottlingException' || error.name === 'TooManyRequestsException' || error.$metadata?.httpStatusCode === 429) {
          core.setFailed(`Rate limit exceeded and maximum retries reached: ${error.message}`);
        } else if (error.$metadata?.httpStatusCode >= 500) {
          core.setFailed(`Server error (${error.$metadata?.httpStatusCode}): ${error.message}. All retry attempts failed.`);
        } else if (error.name === 'AccessDeniedException') {
          core.setFailed(`Action failed with error: Permissions error: ${error.message}. Check IAM roles.`);
        } else {
          core.setFailed(`Failed to create function: ${error.message}`);
        }
        
        if (error.stack) {
          core.debug(error.stack);
        }
        throw error; 
      }
    }
}

async function waitForFunctionActive(client, functionName, waitForMinutes = 5) {
  const MAX_WAIT_MINUTES = 30;
  
  if (waitForMinutes > MAX_WAIT_MINUTES) {
    waitForMinutes = MAX_WAIT_MINUTES;
    core.info(`Wait time capped to maximum of ${MAX_WAIT_MINUTES} minutes`);
  }
  
  core.info(`Waiting for function ${functionName} to become active. Will wait for up to ${waitForMinutes} minutes`);
  
  const startTime = Date.now();
  const maxWaitTimeMs = waitForMinutes * 60 * 1000;
  const DELAY_BETWEEN_CHECKS_MS = 5000; 
  let lastState = null;
  
  while (Date.now() - startTime < maxWaitTimeMs) {
    try {
      const command = new GetFunctionConfigurationCommand({ FunctionName: functionName });
      const response = await client.send(command);
      
      const currentState = response.State;
      
      if (currentState !== lastState) {
        core.info(`Function ${functionName} is in state: ${currentState}`);
        lastState = currentState;
      }
      
      if (currentState === 'Active') {
        core.info(`Function ${functionName} is now active`);
        return;
      } else if (currentState === 'Failed') {
        throw new Error(`Function ${functionName} deployment failed with reason: ${response.StateReason || 'Unknown reason'}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CHECKS_MS));
    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        throw new Error(`Function ${functionName} not found`);
      } else if (error.$metadata && error.$metadata.httpStatusCode === 403) {
        throw new Error(`Permission denied while checking function ${functionName} status`);
      } else {
        core.warning(`Function status check error: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CHECKS_MS));
      }
    }
  }
  
  throw new Error(`Timed out waiting for function ${functionName} to become active after ${waitForMinutes} minutes`);
}

// Helper functions for updating Lambda function configuration
async function updateFunctionConfiguration(client, params) {
  const {
    functionName, role, handler, functionDescription, parsedMemorySize,
    timeout, runtime, kmsKeyArn, ephemeralStorage, vpcConfig,
    parsedEnvironment, deadLetterConfig, tracingConfig, layers,
    fileSystemConfigs, imageConfig, snapStart, loggingConfig,
    parsedVpcConfig, parsedDeadLetterConfig, parsedTracingConfig,
    parsedLayers, parsedFileSystemConfigs, parsedImageConfig,
    parsedSnapStart, parsedLoggingConfig
  } = params;

  try {
    const input = {
      FunctionName: functionName,
      ...(role && { Role: role }),
      ...(handler && { Handler: handler }),
      ...(functionDescription && { Description: functionDescription }),
      ...(parsedMemorySize && { MemorySize: parsedMemorySize }),
      ...(timeout && { Timeout: timeout }),
      ...(runtime && { Runtime: runtime }),
      ...(kmsKeyArn && { KMSKeyArn: kmsKeyArn }),
      ...(ephemeralStorage && { EphemeralStorage: { Size: ephemeralStorage } }),
      ...(vpcConfig && { VpcConfig: parsedVpcConfig }),
      Environment: { Variables: parsedEnvironment },
      ...(deadLetterConfig && { DeadLetterConfig: parsedDeadLetterConfig }),
      ...(tracingConfig && { TracingConfig: parsedTracingConfig }),
      ...(layers && { Layers: parsedLayers }),
      ...(fileSystemConfigs && { FileSystemConfigs: parsedFileSystemConfigs }),
      ...(imageConfig && { ImageConfig: parsedImageConfig }),
      ...(snapStart && { SnapStart: parsedSnapStart }),
      ...(loggingConfig && { LoggingConfig: parsedLoggingConfig })
    };

    core.info(`Updating function configuration for ${functionName}`);
    const command = new UpdateFunctionConfigurationCommand(input);
    await client.send(command);
    await waitForFunctionUpdated(client, functionName);
  } catch (error) {
    if (error.name === 'ThrottlingException' || error.name === 'TooManyRequestsException' || error.$metadata?.httpStatusCode === 429) {
      core.setFailed(`Rate limit exceeded and maximum retries reached: ${error.message}`);
    } else if (error.$metadata?.httpStatusCode >= 500) {
      core.setFailed(`Server error (${error.$metadata?.httpStatusCode}): ${error.message}. All retry attempts failed.`);
    } else if (error.name === 'AccessDeniedException') {
      core.setFailed(`Action failed with error: Permissions error: ${error.message}. Check IAM roles.`);
    } else {
      core.setFailed(`Failed to update function configuration: ${error.message}`);
    }
    
    if (error.stack) {
      core.debug(error.stack);
    }
    throw error; 
  }
}

async function waitForFunctionUpdated(client, functionName, waitForMinutes = 5) {
  const MAX_WAIT_MINUTES = 30;
  
  if (waitForMinutes > MAX_WAIT_MINUTES) {
    waitForMinutes = MAX_WAIT_MINUTES;
    core.info(`Wait time capped to maximum of ${MAX_WAIT_MINUTES} minutes`);
  }
  
  core.info(`Waiting for function update to complete. Will wait for ${waitForMinutes} minutes`);
  
  try {
    await waitUntilFunctionUpdated({
      client: client,
      minDelay: 2, 
      maxWaitTime: waitForMinutes * 60, 
    }, {
      FunctionName: functionName
    });
    
    core.info('Function update completed successfully');
  } catch (error) {
    if (error.name === 'TimeoutError') {
      throw new Error(`Timed out waiting for function ${functionName} update to complete after ${waitForMinutes} minutes`);
    } else if (error.name === 'ResourceNotFoundException') {
      throw new Error(`Function ${functionName} not found`);
    } else if (error.$metadata && error.$metadata.httpStatusCode === 403) {
      throw new Error(`Permission denied while checking function ${functionName} status`);
    } else if (error.message && error.message.includes("currently in the following state: 'Pending'")) {
      core.warning(`Function ${functionName} is in 'Pending' state. Waiting for it to become active...`);
      await waitForFunctionActive(client, functionName, waitForMinutes);
      core.info(`Function ${functionName} is now active`);
    } else {
      core.warning(`Function update check error: ${error.message}`);
      throw new Error(`Error waiting for function ${functionName} update: ${error.message}`);
    }
  }
}

// Helper function for updating Lambda function code
async function updateFunctionCode(client, params) {
  const {
    functionName, finalZipPath, useS3Method, s3Bucket, s3Key,
    codeArtifactsDir, architectures, publish, revisionId,
    sourceKmsKeyArn, dryRun, region
  } = params;

  core.info(`Updating function code for ${functionName} with ${finalZipPath}`);
  
  try {
    const commonCodeParams = {
      FunctionName: functionName,
      ...(architectures && { Architectures: Array.isArray(architectures) ? architectures : [architectures] }),
      ...(publish !== undefined && { Publish: publish }),
      ...(revisionId && { RevisionId: revisionId }),
      ...(sourceKmsKeyArn && { SourceKmsKeyArn: sourceKmsKeyArn })
    };
    
    let codeInput;
    
    if (useS3Method) {
      core.info(`Using S3 deployment method with bucket: ${s3Bucket}, key: ${s3Key}`);

      await uploadToS3(finalZipPath, s3Bucket, s3Key, region);
      core.info(`Successfully uploaded package to S3: s3://${s3Bucket}/${s3Key}`);
      
      codeInput = {
        ...commonCodeParams,
        S3Bucket: s3Bucket,
        S3Key: s3Key
      };
    } else {
      let zipFileContent;
      
      try {
        zipFileContent = await fs.readFile(finalZipPath);
      } catch (error) {
        core.setFailed(`Failed to read Lambda deployment package at ${finalZipPath}: ${error.message}`);

        if (error.code === 'ENOENT') {
          core.error(`File not found. Ensure the code artifacts directory "${codeArtifactsDir}" contains the required files.`);
        } else if (error.code === 'EACCES') {
          core.error('Permission denied. Check file access permissions.');
        }
        
        if (error.stack) {
          core.debug(error.stack);
        }
        
        throw error;
      }
      
      codeInput = {
        ...commonCodeParams,
        ZipFile: zipFileContent
      };
      
      core.info(`Original buffer length: ${zipFileContent.length} bytes`);
    }
          
    if (dryRun) {
      core.info(`[DRY RUN] Performing dry-run function code update with parameters:`);
      const logInput = {...codeInput};
      if (logInput.ZipFile) {
        logInput.ZipFile = `<Binary data of length ${logInput.ZipFile.length} bytes>`;
      }
      core.info(JSON.stringify(logInput, null, 2));
      codeInput.DryRun = true;
      
      const command = new UpdateFunctionCodeCommand(codeInput);
      const response = await client.send(command);
      
      core.info('[DRY RUN] Function code validation passed');
      core.setOutput('function-arn', response.FunctionArn || `arn:aws:lambda:${region}:000000000000:function:${functionName}`);
      core.setOutput('version', response.Version || '$LATEST');
      core.info('[DRY RUN] Function code update simulation completed');
    } else {
      const command = new UpdateFunctionCodeCommand(codeInput);
      const response = await client.send(command);
      core.setOutput('function-arn', response.FunctionArn);
      if (response.Version) {
        core.setOutput('version', response.Version);
      }
    }
  } catch (error) {
    if (error.name === 'ThrottlingException' || error.name === 'TooManyRequestsException' || error.$metadata?.httpStatusCode === 429) {
      core.setFailed(`Rate limit exceeded and maximum retries reached: ${error.message}`);
    } else if (error.$metadata?.httpStatusCode >= 500) {
      core.setFailed(`Server error (${error.$metadata?.httpStatusCode}): ${error.message}. All retry attempts failed.`);
    } else if (error.name === 'AccessDeniedException') {
      core.setFailed(`Action failed with error: Permissions error: ${error.message}. Check IAM roles.`);
    } else {
      core.setFailed(`Failed to update function code: ${error.message}`);
    }
    
    if (error.stack) {
      core.debug(error.stack);
    }
    throw error;
  }
}

// Helper functions for checking if configuration has changed
async function hasConfigurationChanged(currentConfig, updatedConfig) {
  if (!currentConfig || Object.keys(currentConfig).length === 0) {
    return true;
  }

  const cleanedUpdated = cleanNullKeys(updatedConfig) || {};
  let hasChanged = false;
  
  for (const [key, value] of Object.entries(cleanedUpdated)) {
    if (value !== undefined) {
      if (!(key in currentConfig)) {
        core.info(`Configuration difference detected in ${key}`);
        hasChanged = true;
        continue;
      }
      
      if (typeof value === 'object' && value !== null) {
        if (!deepEqual(currentConfig[key] || {}, value)) {
          core.info(`Configuration difference detected in ${key}`);
          hasChanged = true;
        }
      } else if (currentConfig[key] !== value) {
        core.info(`Configuration difference detected in ${key}: ${currentConfig[key]} -> ${value}`);
        hasChanged = true;
      }
    }
  }

  return hasChanged;
}

function isEmptyValue(value) {
  if (value === null || value === undefined || value === '') {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length === 0 || value.every(item => isEmptyValue(item));
  }

  if (typeof value === 'object') {
    if ('SubnetIds' in value || 'SecurityGroupIds' in value) {
      return false;
    }
    return Object.keys(value).length === 0 || 
           Object.values(value).every(val => isEmptyValue(val));
  }

  return false; 
}

function cleanNullKeys(obj) {
  if (obj === null || obj === undefined) {
    return undefined;
  }

  if (obj === '') {
    return undefined;
  }

  const isVpcConfig = obj && typeof obj === 'object' && ('SubnetIds' in obj || 'SecurityGroupIds' in obj);
  
  if (Array.isArray(obj)) {
    const filtered = obj.filter(item => !isEmptyValue(item));
    return filtered.length > 0 ? filtered : undefined;
  }

  if (typeof obj === 'object') {
    const result = {};
    let hasProperties = false;

    for (const [key, value] of Object.entries(obj)) {
      if (isVpcConfig && (key === 'SubnetIds' || key === 'SecurityGroupIds')) {
        result[key] = Array.isArray(value) ? value : [];
        hasProperties = true;
        continue;
      }

      if (value === null || value === undefined || value === '') {
        continue; 
      }

      const cleaned = cleanNullKeys(value);
      if (cleaned !== undefined) {
        result[key] = cleaned;
        hasProperties = true;
      }
    }

    return hasProperties ? result : undefined;
  }

  return obj; 
}

function deepEqual(obj1, obj2) {
  if (obj1 === null || obj2 === null || typeof obj1 !== 'object' || typeof obj2 !== 'object') {
    return obj1 === obj2;
  }
  
  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    if (obj1.length !== obj2.length) {
      return false;
    }
    
    for (let i = 0; i < obj1.length; i++) {
      if (!deepEqual(obj1[i], obj2[i])) {
        return false;
      }
    }
    
    return true;
  }
  
  if (Array.isArray(obj1) !== Array.isArray(obj2)) {
    return false;
  }
  
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) {
    return false;
  }
  
  for (const key of keys1) {
    if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) {
      return false;
    }
  }
  
  return true;
}

// Helper functions for S3 buckets
function generateS3Key(functionName) {
  const date = new Date();
  const timestamp = date.toISOString().replace(/[:.]/g, '-').replace('T', '-').split('Z')[0];
  
  let commitHash = '';
  if (process.env.GITHUB_SHA) {
    commitHash = `-${process.env.GITHUB_SHA.substring(0, 7)}`;
  }
  
  return `lambda-deployments/${functionName}/${timestamp}${commitHash}.zip`;
}

async function checkBucketExists(s3Client, bucketName) {
  try {
    const command = new HeadBucketCommand({ 
      Bucket: bucketName
    });
    await s3Client.send(command);
    core.info(`S3 bucket ${bucketName} exists`);
    return true;
  } catch (error) {
    if (error.$metadata?.httpStatusCode === 404 || error.name === 'NotFound') {
      core.info(`S3 bucket ${bucketName} does not exist`);
      return false;
    }

    core.error(`Error checking if bucket exists: ${error.$metadata?.httpStatusCode || error.name} - ${error.message}`);
    core.error(`Error details: ${JSON.stringify({
      code: error.code,
      name: error.name,
      message: error.message,
      statusCode: error.$metadata?.httpStatusCode,
      requestId: error.$metadata?.requestId
    })}`);
    
    if (error.$metadata?.httpStatusCode === 301) {
      core.error(`REGION MISMATCH ERROR: The bucket "${bucketName}" exists but in a different region than specified (${s3Client.config.region}). S3 buckets are global but region-specific. `);
      throw new Error(`Bucket "${bucketName}" exists in a different region than ${s3Client.config.region}`);
    } else if (error.name === 'AccessDenied' || error.$metadata?.httpStatusCode === 403) {
      core.error('Access denied.');
    }
    throw error;
  }
}

async function createBucket(s3Client, bucketName, region) {
  core.info(`Creating S3 bucket: ${bucketName}`);
  
  try {
    if (!validateBucketName(bucketName)) {
      throw new Error(`Invalid bucket name: "${bucketName}". Bucket names must be 3-63 characters, lowercase, start/end with a letter/number, and contain only letters, numbers, dots, and hyphens.`);
    }
    
    const input = {
      Bucket: bucketName,
    };

    if (region !== 'us-east-1') {
      input.CreateBucketConfiguration = {
        LocationConstraint: region
      };
    }

    core.info(`Sending CreateBucket request for bucket: ${bucketName} in region: ${region || 'default'}`);
    const command = new CreateBucketCommand(input);
    
    try {
      const response = await s3Client.send(command);
      core.info(`Successfully created S3 bucket: ${bucketName}`);
      core.info(`Bucket location: ${response.Location}`);
      
      // Apply security configurations after bucket creation
      try {
        core.info(`Configuring public access block for bucket: ${bucketName}`);
        await s3Client.send(new PutPublicAccessBlockCommand({
          Bucket: bucketName,
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: true,
            IgnorePublicAcls: true,
            BlockPublicPolicy: true,
            RestrictPublicBuckets: true
          }
        }));
        
        core.info(`Enabling default encryption for bucket: ${bucketName}`);
        await s3Client.send(new PutBucketEncryptionCommand({
          Bucket: bucketName,
          ServerSideEncryptionConfiguration: {
            Rules: [
              {
                ApplyServerSideEncryptionByDefault: {
                  SSEAlgorithm: 'AES256'
                },
                BucketKeyEnabled: true
              }
            ]
          }
        }));
        
        core.info(`Enabling versioning for bucket: ${bucketName}`);
        await s3Client.send(new PutBucketVersioningCommand({
          Bucket: bucketName,
          VersioningConfiguration: {
            Status: 'Enabled'
          }
        }));
        
        core.info(`Security configurations successfully applied to bucket: ${bucketName}`);
      } catch (securityError) {
        core.warning(`Applied partial security settings to bucket. Some security features couldn't be enabled: ${securityError.message}`);
        core.debug(securityError.stack);
      }
      
      return true;
    } catch (sendError) {
      core.error(`Error creating bucket: ${sendError.name} - ${sendError.message}`);
      core.error(`Error details: ${JSON.stringify({
        code: sendError.code,
        name: sendError.name,
        message: sendError.message,
        statusCode: sendError.$metadata?.httpStatusCode,
        requestId: sendError.$metadata?.requestId
      })}`);
      
      if (sendError.name === 'BucketAlreadyExists' || sendError.name === 'BucketAlreadyOwnedByYou') {
        core.error(`Bucket name ${bucketName} is already taken but may be owned by another account.`);
        throw sendError;
      } else if (sendError.$metadata?.httpStatusCode === 403) {
        core.error('Access denied when creating bucket. Check your IAM permissions for s3:CreateBucket.');
        throw new Error(`Access denied when creating bucket ${bucketName}. Ensure your IAM policy includes s3:CreateBucket permission.`);
      } else if (sendError.name === 'InvalidBucketName') {
        core.error(`The bucket name "${bucketName}" is invalid. See s3-troubleshooting.md for S3 bucket naming rules.`);
      }
      throw sendError;
    }
  } catch (error) {
    core.error(`Failed to create S3 bucket: ${error.name} - ${error.message}`);
    throw error;
  }
}

function validateBucketName(name) {
  if (!name || typeof name !== 'string') return false;
  
  if (name.length < 3 || name.length > 63) return false;
  
  if (!/^[a-z0-9.-]+$/.test(name)) return false;
  
  if (!/^[a-z0-9].*[a-z0-9]$/.test(name)) return false;
  
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(name)) return false;
  
  if (/\.\./.test(name)) return false;
  
  if (/^xn--/.test(name)) return false;
  
  if (/^sthree-/.test(name)) return false;
  
  if (/^sthree-configurator/.test(name)) return false;
  
  if (/^amzn-s3-demo-bucket/.test(name)) return false;
  
  return true;
}

async function uploadToS3(zipFilePath, bucketName, s3Key, region) {
  core.info(`Uploading Lambda deployment package to S3: s3://${bucketName}/${s3Key}`);
  
  try {
    const s3Client = new S3Client({ 
	    region,
      customUserAgent: `LambdaGitHubAction/${version}`
	  });
    let bucketExists = false;
    try {
      bucketExists = await checkBucketExists(s3Client, bucketName);
    } catch (checkError) {
      core.error(`Failed to check if bucket exists: ${checkError.name} - ${checkError.message}`);
      core.error(`Error type: ${checkError.name}, Code: ${checkError.code}`);
      
      if (checkError.$metadata?.httpStatusCode === 403) {
        throw new Error(`Access denied to S3 bucket`);
      } else {
        throw checkError;
      }
    }
    
    if (!bucketExists) {
      core.info(`Bucket ${bucketName} does not exist. Attempting to create it...`);
      try {
        await createBucket(s3Client, bucketName, region);
        core.info(`Bucket ${bucketName} created successfully.`);
      } catch (bucketError) {
        core.error(`Failed to create bucket ${bucketName}: ${bucketError.message}`);
        core.debug(bucketError.stack || "Bucket error stack trace");
        core.error(`Error details: ${JSON.stringify({
          code: bucketError.code,
          name: bucketError.name,
          message: bucketError.message,
          statusCode: bucketError.$metadata?.httpStatusCode
        })}`);
        
        if (bucketError.name === 'BucketAlreadyExists' || bucketError.name === 'BucketAlreadyOwnedByYou') {
          core.info(`Bucket name ${bucketName} is already taken. Please try a different name.`);
        } else if (bucketError.$metadata?.httpStatusCode === 403) {
          throw new Error(`Access denied when creating bucket. Ensure your IAM policy includes s3:CreateBucket permission.`);
        }
        throw bucketError;
      }
    }

    try {
      await fs.access(zipFilePath);
      core.info(`Deployment package verified at ${zipFilePath}`);
    } catch (fileError) {
      if (fileError.code === 'EACCES') {
        throw new Error(`Permission denied`);
      }
      throw new Error(`Cannot access deployment package at ${zipFilePath}: ${fileError.message}`);
    }
    
    const fileContent = await fs.readFile(zipFilePath);
    core.info(`Read deployment package, size: ${fileContent.length} bytes`);
    
    try {

      expectedBucketOwner = await getAwsAccountId(region);

      if(!expectedBucketOwner) {
        throw new Error("No AWS account ID found.");
      }

      const input = {
        Bucket: bucketName,
        Key: s3Key,
        Body: fileContent,
        ExpectedBucketOwner: expectedBucketOwner
      };
      
      core.info(`Sending PutObject request to S3 (bucket: ${bucketName}, key: ${s3Key})`);
      const command = new PutObjectCommand(input);
      const response = await s3Client.send(command);
      
      core.info(`S3 upload successful, file size: ${fileContent.length} bytes`);
      
      return {
        bucket: bucketName,
        key: s3Key,
        ...((response && response.VersionId) ? { versionId: response.VersionId } : {})
      };
    } catch (uploadError) {
      core.error(`Failed to upload file to S3: ${uploadError.name} - ${uploadError.message}`);
      core.error(`Upload error details: ${JSON.stringify({
        code: uploadError.code,
        name: uploadError.name,
        message: uploadError.message,
        statusCode: uploadError.$metadata?.httpStatusCode,
        requestId: uploadError.$metadata?.requestId
      })}`);
      
      if (uploadError.$metadata?.httpStatusCode === 403) {
        throw new Error('Access denied when uploading to S3. Ensure your IAM policy includes s3:PutObject permission.');
      }
      throw uploadError;
    }
    
  } catch (error) {
    core.error(`S3 upload failed: ${error.name} - ${error.message}`);
    
    if (error.code === 'NoSuchBucket') {
      core.error(`Bucket ${bucketName} does not exist and could not be created automatically. Please create it manually or check your permissions.`);
    } else if (error.code === 'AccessDenied' || error.name === 'AccessDenied' || error.$metadata?.httpStatusCode === 403) {
      core.error('Access denied. Ensure your AWS credentials have the following permissions:');
      core.error('- s3:HeadBucket (to check if the bucket exists)');
      core.error('- s3:CreateBucket (to create the bucket if it doesn\'t exist)');
      core.error('- s3:PutObject (to upload the file to the bucket)');
      core.error('See s3-troubleshooting.md for a complete IAM policy template.');
    } else if (error.name === 'CredentialsProviderError') {
      core.error('AWS credentials not found or invalid. Check your AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.');
    } else if (error.name === 'InvalidBucketName') {
      core.error(`Invalid bucket name: ${bucketName}. Bucket names must follow S3 naming rules.`);
      core.error('See s3-troubleshooting.md for S3 bucket naming rules.');
    }
    
    throw error;
  }
}

// Helper function for retrieving AWS account ID
async function getAwsAccountId(region) {
  try {
    const stsClient = new STSClient({ 
      region,
      customUserAgent: `LambdaGitHubAction/${version}`
    });
    const command = new GetCallerIdentityCommand({});
    const response = await stsClient.send(command);
    core.info(`Successfully retrieved AWS account ID: ${response.Account}`);
    return response.Account;
  } catch (error) {
    core.warning(`Failed to retrieve AWS account ID: ${error.message}`);
    core.debug(error.stack);
    return null;
  }
}

if (require.main === require.cache[eval('__filename')]) {
  run();
}

module.exports = {
  run,
  packageCodeArtifacts,
  checkFunctionExists,
  hasConfigurationChanged,
  waitForFunctionUpdated,
  waitForFunctionActive,
  isEmptyValue,
  cleanNullKeys,
  deepEqual,
  generateS3Key,
  uploadToS3,
  checkBucketExists,
  createBucket,
  validateBucketName,
  createFunction,
  updateFunctionConfiguration,
  updateFunctionCode,
  getAwsAccountId
};


/***/ }),

/***/ 584:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const core = __nccwpck_require__(56);
const path = __nccwpck_require__(928);

function validateNumericInputs() {
  const ephemeralStorageInput = core.getInput('ephemeral-storage', { required: false });
  const ephemeralStorage = parseInt(ephemeralStorageInput);
  if (ephemeralStorageInput && isNaN(ephemeralStorage)) {
    core.setFailed(`Ephemeral storage must be a number, got: ${ephemeralStorageInput}`);
    return { valid: false };
  }

  const memorySize = core.getInput('memory-size', { required: false });
  let parsedMemorySize;
  if (memorySize !== '') {
    parsedMemorySize = parseInt(memorySize);
    if (isNaN(parsedMemorySize)) {
      core.setFailed(`Memory size must be a number, got: ${memorySize}`);
      return { valid: false };
    }
  }

  const timeoutInput = core.getInput('timeout', { required: false });
  const timeout = parseInt(timeoutInput);
  if (timeoutInput && isNaN(timeout)) {
    core.setFailed(`Timeout must be a number, got: ${timeoutInput}`);
    return { valid: false };
  }

  return { 
    valid: true, 
    ephemeralStorage, 
    parsedMemorySize, 
    timeout 
  };
}

function validateRequiredInputs() {
  const functionName = core.getInput('function-name', { required: true });
  if (!functionName) {
    core.setFailed('Function name must be provided');
    return { valid: false };
  }

  const codeArtifactsDir = core.getInput('code-artifacts-dir');
  if (!codeArtifactsDir) {
    core.setFailed('Code-artifacts-dir must be provided');
    return { valid: false };
  }

  let handler = core.getInput('handler', { required: true });
  handler = handler || 'index.handler'; 
  
  let runtime = core.getInput('runtime', { required: true });
  runtime = runtime || 'node20js.x'; 

  return { 
    valid: true, 
    functionName, 
    codeArtifactsDir,
    handler,
    runtime
  };
}

function validateArnInputs() {
  const role = core.getInput('role', { required: false });
  const codeSigningConfigArn = core.getInput('code-signing-config-arn', { required: false });
  const kmsKeyArn = core.getInput('kms-key-arn', { required: false });
  const sourceKmsKeyArn = core.getInput('source-kms-key-arn', { required: false });
  
  if (role && !validateRoleArn(role)) {
    return { valid: false };
  }
  
  if (codeSigningConfigArn && !validateCodeSigningConfigArn(codeSigningConfigArn)) {
    return { valid: false };
  }
  
  if (kmsKeyArn && !validateKmsKeyArn(kmsKeyArn)) {
    return { valid: false };
  }
  
  if (sourceKmsKeyArn && !validateKmsKeyArn(sourceKmsKeyArn)) {
    return { valid: false };
  }

  return {
    valid: true,
    role,
    codeSigningConfigArn,
    kmsKeyArn,
    sourceKmsKeyArn
  };
}

function validateJsonInputs() {
  const environment = core.getInput('environment', { required: false });
  const vpcConfig = core.getInput('vpc-config', { required: false });
  const deadLetterConfig = core.getInput('dead-letter-config', { required: false });
  const tracingConfig = core.getInput('tracing-config', { required: false });
  const layers = core.getInput('layers', { required: false });
  const fileSystemConfigs = core.getInput('file-system-configs', { required: false });
  const imageConfig = core.getInput('image-config', { required: false });
  const snapStart = core.getInput('snap-start', { required: false });
  const loggingConfig = core.getInput('logging-config', { required: false });
  const tags = core.getInput('tags', { required: false });
  
  let parsedEnvironment, parsedVpcConfig, parsedDeadLetterConfig, parsedTracingConfig,
    parsedLayers, parsedFileSystemConfigs, parsedImageConfig, parsedSnapStart,
    parsedLoggingConfig, parsedTags;

  try {
    if (environment) {
      parsedEnvironment = parseJsonInput(environment, 'environment');
    }
    
    if (vpcConfig) {
      parsedVpcConfig = parseJsonInput(vpcConfig, 'vpc-config');
      if (!parsedVpcConfig.SubnetIds || !Array.isArray(parsedVpcConfig.SubnetIds)) {
        throw new Error("vpc-config must include 'SubnetIds' as an array");
      }
      if (!parsedVpcConfig.SecurityGroupIds || !Array.isArray(parsedVpcConfig.SecurityGroupIds)) {
        throw new Error("vpc-config must include 'SecurityGroupIds' as an array");
      }
    }
    
    if (deadLetterConfig) {
      parsedDeadLetterConfig = parseJsonInput(deadLetterConfig, 'dead-letter-config');
      if (!parsedDeadLetterConfig.TargetArn) {
        throw new Error("dead-letter-config must include 'TargetArn'");
      }
    }
    
    if (tracingConfig) {
      parsedTracingConfig = parseJsonInput(tracingConfig, 'tracing-config');
      if (!parsedTracingConfig.Mode || !['Active', 'PassThrough'].includes(parsedTracingConfig.Mode)) {
        throw new Error("tracing-config Mode must be 'Active' or 'PassThrough'");
      }
    }
    
    if (layers) {
      parsedLayers = parseJsonInput(layers, 'layers');
      if (!Array.isArray(parsedLayers)) {
        throw new Error("layers must be an array of layer ARNs");
      }
    }
    
    if (fileSystemConfigs) {
      parsedFileSystemConfigs = parseJsonInput(fileSystemConfigs, 'file-system-configs');
      if (!Array.isArray(parsedFileSystemConfigs)) {
        throw new Error("file-system-configs must be an array");
      }
      for (const config of parsedFileSystemConfigs) {
        if (!config.Arn || !config.LocalMountPath) {
          throw new Error("Each file-system-config must include 'Arn' and 'LocalMountPath'");
        }
      }
    }
    
    if (imageConfig) {
      parsedImageConfig = parseJsonInput(imageConfig, 'image-config');
    }
    
    if (snapStart) {
      parsedSnapStart = parseJsonInput(snapStart, 'snap-start');
      if (!parsedSnapStart.ApplyOn || !['PublishedVersions', 'None'].includes(parsedSnapStart.ApplyOn)) {
        throw new Error("snap-start ApplyOn must be 'PublishedVersions' or 'None'");
      }
    }
    
    if (loggingConfig) {
      parsedLoggingConfig = parseJsonInput(loggingConfig, 'logging-config');
    }
    
    if (tags) {
      parsedTags = parseJsonInput(tags, 'tags');
      if (typeof parsedTags !== 'object' || Array.isArray(parsedTags)) {
        throw new Error("tags must be an object of key-value pairs");
      }
    }
  } catch (error) {
    core.setFailed(`Input validation error: ${error.message}`);
    return { valid: false };
  }

  return {
    valid: true,
    environment,
    vpcConfig,
    deadLetterConfig,
    tracingConfig,
    layers,
    fileSystemConfigs, 
    imageConfig,
    snapStart,
    loggingConfig,
    tags,
    parsedEnvironment,
    parsedVpcConfig,
    parsedDeadLetterConfig,
    parsedTracingConfig,
    parsedLayers,
    parsedFileSystemConfigs,
    parsedImageConfig, 
    parsedSnapStart,
    parsedLoggingConfig,
    parsedTags
  };
}

function getAdditionalInputs() {
  const functionDescription = core.getInput('function-description', { required: false });
  const dryRun = core.getBooleanInput('dry-run', { required: false }) || false;
  let publish = false;
  const revisionId = core.getInput('revision-id', { required: false });
  const architectures = core.getInput('architectures', { required: false });
  const s3Bucket = core.getInput('s3-bucket', { required: false });
  let s3Key = core.getInput('s3-key', { required: false });

  try {
    publish = core.getBooleanInput('publish', { required: false });
  } catch (error) {
    publish = false;
  }

  const useS3Method = !!s3Bucket;

  return {
    functionDescription,
    dryRun,
    publish,
    revisionId,
    architectures,
    s3Bucket,
    s3Key,
    useS3Method
  };
}

function parseJsonInput(jsonString, inputName) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    throw new Error(`Invalid JSON in ${inputName} input: ${error.message}`);
  }
}

function validateRoleArn(arn) {
  const rolePattern = /^arn:aws(-[a-z0-9-]+)?:iam::[0-9]{12}:role\/[a-zA-Z0-9+=,.@_\/-]+$/;
  
  if (!rolePattern.test(arn)) {
    core.setFailed(`Invalid IAM role ARN format: ${arn}`);
    return false;
  }
  return true;
}

function validateCodeSigningConfigArn(arn) {
  const cscPattern = /^arn:aws(-[a-z0-9-]+)?:lambda:[a-z0-9-]+:[0-9]{12}:code-signing-config:[a-zA-Z0-9-]+$/;

  if (!cscPattern.test(arn)) {
    core.setFailed(`Invalid code signing config ARN format: ${arn}`);
    return false;
  }
  return true;
}

function validateKmsKeyArn(arn) {
  const kmsPattern = /^arn:aws(-[a-z0-9-]+)?:kms:[a-z0-9-]+:[0-9]{12}:key\/[a-zA-Z0-9-]+$/;
  
  if (!kmsPattern.test(arn)) {
    core.setFailed(`Invalid KMS key ARN format: ${arn}`);
    return false;
  }
  return true;
}

function validateAndResolvePath(userPath, basePath) {
  const normalizedPath = path.normalize(userPath);
  const resolvedPath = path.isAbsolute(normalizedPath) ? normalizedPath : path.resolve(basePath, normalizedPath);
  const relativePath = path.relative(basePath, resolvedPath);

  if (relativePath && (relativePath.startsWith('..') || path.isAbsolute(relativePath))) {
    throw new Error(
      `Security error: Path traversal attempt detected. ` +
      `The path '${userPath}' resolves to '${resolvedPath}' which is outside the allowed directory '${basePath}'.`
    );
  }
  return resolvedPath;
}

function validateAllInputs() {
  const requiredInputs = validateRequiredInputs();
  if (!requiredInputs.valid) {
    return { valid: false };
  }
  
  const numericInputs = validateNumericInputs();
  if (!numericInputs.valid) {
    return { valid: false };
  }
  
  const arnInputs = validateArnInputs();
  if (!arnInputs.valid) {
    return { valid: false };
  }
  
  const jsonInputs = validateJsonInputs();
  if (!jsonInputs.valid) {
    return { valid: false };
  }
  
  const additionalInputs = getAdditionalInputs();
  
  return {
    valid: true,
    ...requiredInputs,
    ...numericInputs,
    ...arnInputs,
    ...jsonInputs,
    ...additionalInputs
  };
}

module.exports = {
  validateAllInputs,
  parseJsonInput,
  validateRoleArn,
  validateCodeSigningConfigArn,
  validateKmsKeyArn,
  validateAndResolvePath,
  getAdditionalInputs
};


/***/ }),

/***/ 56:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 965:
/***/ ((module) => {

module.exports = eval("require")("@aws-sdk/client-lambda");


/***/ }),

/***/ 998:
/***/ ((module) => {

module.exports = eval("require")("@aws-sdk/client-s3");


/***/ }),

/***/ 448:
/***/ ((module) => {

module.exports = eval("require")("@aws-sdk/client-sts");


/***/ }),

/***/ 931:
/***/ ((module) => {

module.exports = eval("require")("adm-zip");


/***/ }),

/***/ 943:
/***/ ((module) => {

"use strict";
module.exports = require("fs/promises");

/***/ }),

/***/ 857:
/***/ ((module) => {

"use strict";
module.exports = require("os");

/***/ }),

/***/ 928:
/***/ ((module) => {

"use strict";
module.exports = require("path");

/***/ }),

/***/ 330:
/***/ ((module) => {

"use strict";
module.exports = /*#__PURE__*/JSON.parse('{"name":"@amzn/github-action-lambda-deploy","version":"1.0.0","description":"GitHub Action for AWS Lambda Function Deployment","main":"index.js","scripts":{"build":"ncc build index.js -o dist","test":"jest","lint":"eslint .","lint:fix":"eslint . --fix"},"keywords":["aws","lambda","deployment"],"author":"","license":"MIT","dependencies":{"@actions/core":"^1.10.0","@actions/github":"^5.1.1","@aws-sdk/client-lambda":"^3.826.0","@aws-sdk/client-s3":"^3.826.0","@aws-sdk/util-retry":"^3.370.0","@smithy/node-http-handler":"^4.0.6","@aws-sdk/client-sts":"3.844.0","adm-zip":"^0.5.16","glob":"^11.0.2"},"devDependencies":{"@vercel/ncc":"^0.36.1","eslint":"^8.45.0","eslint-plugin-jest":"^27.2.2","jest":"^29.5.0"}}');

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __nccwpck_require__(216);
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;