import * as semver from "semver";
import * as readline from "readline";

export type EnvKeyMigrationScript = (params: {
  deploymentTag: string;
  primaryRegion: string;
  failoverRegion?: string;
  profile: string | undefined;
}) => Promise<void>;

export const waitForEnterKeyPromise = (message: string) => {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(message, (res) => {
      rl.close();
      resolve(res);
    });
  });
};

export const getMinimumInfraForApi = (
  apiToInfraVersions: Record<string, string>,
  apiVersionAny: string
): string => {
  const apiVersion = semver.coerce(apiVersionAny)?.version;
  if (!apiVersion) {
    throw new TypeError(
      `Failed coercing apiVersion to semver version when looking for infra version: ${apiVersionAny}`
    );
  }
  // descending
  const listedApiVersions = semver
    .sort(Object.keys(apiToInfraVersions))
    .reverse();
  const firstApiVersion = listedApiVersions[listedApiVersions.length - 1];
  const lastApiVersion = listedApiVersions[0];

  // exact match
  if (apiToInfraVersions[apiVersion]) {
    return apiToInfraVersions[apiVersion];
  }
  // under first listed
  if (semver.lte(apiVersion, firstApiVersion)) {
    return apiToInfraVersions[firstApiVersion];
  }
  // greater than last listed
  if (semver.gte(apiVersion, lastApiVersion)) {
    return apiToInfraVersions[lastApiVersion];
  }

  // finds the first version under the desired version
  for (let i = 0; i < listedApiVersions.length; i++) {
    const testApiV = listedApiVersions[i];
    if (semver.gt(apiVersion, testApiV)) {
      return apiToInfraVersions[testApiV];
    }
  }

  return apiToInfraVersions[firstApiVersion];
};
