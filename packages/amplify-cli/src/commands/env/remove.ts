import * as fs from 'fs-extra';
import * as path from 'path';
import ora from 'ora';
import { FeatureFlags } from 'amplify-cli-core';
import { readJsonFile } from '../../extensions/amplify-helpers/read-json-file';
import { getConfirmation } from '../../extensions/amplify-helpers/delete-project';

export const run = async context => {
  const envName = context.parameters.first;
  const currentEnv = context.amplify.getEnvInfo().envName;

  if (!envName) {
    context.print.error("You must pass in the name of the environment as a part of the 'amplify env remove <env-name>' command");
    process.exit(1);
  }
  let envFound = false;
  const allEnvs = context.amplify.getEnvDetails();

  Object.keys(allEnvs).forEach(env => {
    if (env === envName) {
      envFound = true;
      delete allEnvs[env];
    }
  });

  if (!envFound) {
    context.print.error('No environment found with the corresponding name provided');
  } else {
    if (currentEnv === envName) {
      context.print.error(
        'You cannot delete your current environment. Please switch to another environment to delete your current environment',
      );
      context.print.error("If this is your only environment you can use the 'amplify delete' command to delete your project");
      process.exit(1);
    }

    const confirmation = await getConfirmation(context, envName);
    if (confirmation.proceed) {
      const spinner = ora('Deleting resources from the cloud. This may take a few minutes...');
      spinner.start();
      try {
        await context.amplify.removeEnvFromCloud(context, envName, confirmation.deleteS3);
      } catch (ex) {
        spinner.fail(`remove env failed: ${ex.message}`);
        throw ex;
      }
      spinner.succeed('Successfully removed environment from the cloud');

      // Remove from team-provider-info
      const envProviderFilepath = context.amplify.pathManager.getProviderInfoFilePath();
      let jsonString = JSON.stringify(allEnvs, null, '\t');
      fs.writeFileSync(envProviderFilepath, jsonString, 'utf8');

      // Remove entry from aws-info
      const dotConfigDirPath = context.amplify.pathManager.getDotConfigDirPath();
      const awsInfoFilePath = path.join(dotConfigDirPath, 'local-aws-info.json');
      const awsInfo = readJsonFile(awsInfoFilePath);
      if (awsInfo[envName]) {
        delete awsInfo[envName];
        jsonString = JSON.stringify(awsInfo, null, '\t');
        fs.writeFileSync(awsInfoFilePath, jsonString, 'utf8');
      }

      await FeatureFlags.removeFeatureFlagConfiguration(false, [envName]);

      context.print.success('Successfully removed environment from your project locally');
    }
  }
};
