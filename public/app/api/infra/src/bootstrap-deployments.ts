// Run from CLI by an end user (via core process register action),
// to startup the big deploy which runs out of CodeBuild using the latest versions of everything.
import {
  codebuildProjectNames,
  getCodebuildRoleName,
  getSnsAlertTopicName,
  getSourcesBucketName,
  installerBuildspec,
  installerFile,
  updaterBuildspec,
  updaterFile,
  ENVKEY_RELEASES_BUCKET,
  getS3CredsSecretName,
} from "./stack-constants";
import { SharedIniFileCredentials, SNS } from "aws-sdk";
import CodeBuild from "aws-sdk/clients/codebuild";
import S3 from "aws-sdk/clients/s3";
import IAM from "aws-sdk/clients/iam";
import { createBucketIfNeeded, putDeployTag } from "./aws-helpers";
import { getReleaseAsset, getLatestReleaseVersion } from "./artifact-helpers";
import { Infra } from "@core/types";
import SecretsManager from "aws-sdk/clients/secretsmanager";

export const bootstrapSelfHostedDeployment = async (
  params: Infra.DeploySelfHostedParams & {
    deploymentTag: string;
    subdomain: string;
    updateStatus: (status: string) => void;
  }
) => {
  if (params.failoverRegion && params.failoverRegion == params.primaryRegion) {
    throw new Error("Failover region can't be the same as primary region");
  }

  const credentials = new SharedIniFileCredentials({
    profile: params.profile,
  });
  const codebuild = new CodeBuild({
    region: params.primaryRegion,
    credentials,
  });
  const sns = new SNS({ region: params.primaryRegion, credentials });
  const s3 = new S3({
    region: params.primaryRegion,
    credentials,
  });
  const secrets = new SecretsManager({
    region: params.primaryRegion,
    credentials,
  });
  const iam = new IAM({
    credentials,
  });
  const sourcesBucketName = getSourcesBucketName(params.deploymentTag);
  const snsAlertTopicName = getSnsAlertTopicName(params.deploymentTag);

  const overrideBucket =
    "overrideReleaseBucket" in params && params.overrideReleaseBucket
      ? params.overrideReleaseBucket
      : undefined;
  const bucket: string = overrideBucket || ENVKEY_RELEASES_BUCKET;
  const creds = "creds" in params ? params.creds : undefined;

  params.updateStatus("Determining latest API and Infrastructure versions...");
  const apiVersionNumber =
    params.apiVersionNumber ??
    (await getLatestReleaseVersion({
      project: "apienterprise",
      creds,
      bucket,
    }));
  const infraVersionNumber =
    params.infraVersionNumber ??
    (await getLatestReleaseVersion({
      project: "infra",
      creds,
      bucket,
    }));
  params.updateStatus(
    "EnvKey API version: " +
      apiVersionNumber +
      "\n" +
      "EnvKey Infrastructure version: " +
      infraVersionNumber
  );

  await putDeployTag({
    profile: params.profile,
    primaryRegion: params.primaryRegion,
    deploymentTag: params.deploymentTag,
  });

  let s3CredsSecretArn: string | undefined;
  if (creds) {
    ({ ARN: s3CredsSecretArn } = await secrets
      .createSecret({
        SecretString: JSON.stringify(creds),
        Name: getS3CredsSecretName(params.deploymentTag),
      })
      .promise());
  }
  const codebuildPersistCreds = s3CredsSecretArn
    ? {
        // pre-release aws creds are the only one that'd be used for self-hosted, and this
        // would indicate a developer is testing a self-hosted version
        s3CredsSecretArn,
      }
    : {};

  const extraCodebuildEnvVars = overrideBucket
    ? [
        {
          name: "ENVKEY_RELEASES_BUCKET",
          value: overrideBucket,
        },
      ]
    : [];

  const topic = await sns
    .createTopic({
      Name: snsAlertTopicName,
    })
    .promise();

  await sns
    .subscribe({
      Endpoint: params.infraAlertsEmail,
      Protocol: "email",
      TopicArn: topic.TopicArn!,
    })
    .promise();

  params.updateStatus("Setting up an EnvKey build project role...");

  const codebuildRole = await createCodebuildRoleIfNeeded({
    iam,
    deploymentTag: params.deploymentTag,
  });

  params.updateStatus("Creating source S3 bucket...");
  await createBucketIfNeeded(s3)(sourcesBucketName);

  params.updateStatus("Copying installer into your source bucket...");
  const installerZip = await getReleaseAsset({
    releaseTag: `infra-v${infraVersionNumber}`,
    assetName: installerFile,
    creds,
    bucket,
  });
  await s3
    .putObject({
      Bucket: sourcesBucketName,
      Key: installerFile,
      Body: installerZip,
    })
    .promise();

  params.updateStatus("Creating EnvKey build projects...");

  const updaterZip = await getReleaseAsset({
    releaseTag: `infra-v${infraVersionNumber}`,
    assetName: updaterFile,
    creds,
    bucket,
  });
  await s3
    .putObject({
      Bucket: sourcesBucketName,
      Key: updaterFile,
      Body: updaterZip,
    })
    .promise();

  await Promise.all([
    // installer
    await createInstallerProject({
      codebuild,
      domain: params.domain,
      primaryRegion: params.primaryRegion,
      failoverRegion: params.failoverRegion,
      verifiedSenderEmail: params.verifiedSenderEmail,
      deploymentTag: params.deploymentTag,
      subdomain: params.subdomain,
      snsTopicArn: topic.TopicArn!,
      apiVersionNumber,
      infraVersionNumber,
      failoverVersionNumber: params.failoverVersionNumber,
      isCustomDomain: params.customDomain ? "1" : "",
      notifySmsWhenDone: params.notifySmsWhenDone,
      registerAction: params.registerAction,
      serviceRole: codebuildRole.Arn,
      extraCodebuildEnvVars,
      internalMode: params.internalMode,
      authorizedAccounts: params.authorizedAccounts,
      deployWaf: params.deployWaf,
      ...codebuildPersistCreds,
    }),
    // updater
    await createUpdaterProject({
      codebuild,
      deploymentTag: params.deploymentTag,
      serviceRole: codebuildRole.Arn,
      snsTopicArn: topic.TopicArn!,
      extraCodebuildEnvVars,
      ...codebuildPersistCreds,
    }),
  ]);
  params.updateStatus("Kicking off EnvKey install...");
  await codebuild
    .startBuild({
      projectName: codebuildProjectNames.initialInstall(params.deploymentTag),
    })
    .promise();
};

export const createCodebuildRoleIfNeeded = async (params: {
  iam: IAM;
  deploymentTag: string;
}): Promise<IAM.Role> => {
  const { iam, deploymentTag } = params;

  const codebuildRoleName = getCodebuildRoleName(deploymentTag);

  try {
    const { Role } = await iam
      .getRole({ RoleName: codebuildRoleName })
      .promise();
    if (Role) {
      return Role;
    }
  } catch (ignored) {}

  const codebuildRole = await iam
    .createRole({
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              Service: ["codebuild.amazonaws.com"],
            },
            Action: ["sts:AssumeRole"],
          },
        ],
      }),
      Path: "/",
      RoleName: codebuildRoleName,
    })
    .promise();
  // Important: policy takes a few seconds to attach, despite the promise returning!
  await iam
    .attachRolePolicy({
      RoleName: codebuildRoleName,
      PolicyArn: "arn:aws:iam::aws:policy/AdministratorAccess",
    })
    .promise();

  return codebuildRole.Role;
};

export const createInstallerProject = async (params: {
  codebuild: CodeBuild;
  deploymentTag: string;
  primaryRegion: string;
  failoverRegion?: string;
  deployWaf?: boolean;
  domain: string;
  subdomain: string;
  snsTopicArn: string;
  verifiedSenderEmail: string;
  isCustomDomain: "1" | "";
  apiVersionNumber: string;
  infraVersionNumber: string;
  failoverVersionNumber?: string;
  serviceRole: string;
  // optionals
  extraCodebuildEnvVars?: { name: string; value: string }[];
  notifySmsWhenDone?: string;
  registerAction?: Record<string, any>;
  s3CredsSecretArn?: string;
  internalMode?: boolean;
  authorizedAccounts?: string[];
}): Promise<void> => {
  const { codebuild, deploymentTag, serviceRole } = params;

  const sourcesBucketName = getSourcesBucketName(deploymentTag);

  const environmentVariables: CodeBuild.EnvironmentVariables = [
    { name: "PRIMARY_REGION", value: params.primaryRegion },
    { name: "DOMAIN", value: params.domain },
    {
      name: "SENDER_EMAIL",
      value: params.verifiedSenderEmail,
    },
    { name: "DEPLOYMENT_TAG", value: deploymentTag },
    { name: "SUBDOMAIN", value: params.subdomain },
    { name: "SNS_TOPIC_ARN", value: params.snsTopicArn },
    { name: "API_VERSION_NUMBER", value: params.apiVersionNumber },
    { name: "INFRA_VERSION_NUMBER", value: params.infraVersionNumber },
    {
      name: "FAILOVER_VERSION_NUMBER",
      value: params.failoverVersionNumber || "",
    },
    {
      name: "USE_CUSTOM_DOMAIN",
      value: params.isCustomDomain || "",
    },

    {
      name: "FAILOVER_REGION",
      value: params.failoverRegion ?? "",
    },

    {
      name: "INTERNAL_MODE",
      value: params.internalMode ? "1" : "",
    },

    {
      name: "DEPLOY_WAF",
      value: params.deployWaf ? "1" : "",
    },

    {
      name: "AUTHORIZED_ACCOUNTS_JSON",
      value: params.internalMode
        ? JSON.stringify(params.authorizedAccounts)
        : "",
    },

    // optionals
    {
      name: "NOTIFY_SMS_WHEN_DONE",
      value: params.notifySmsWhenDone ?? "",
    },
    {
      name: "REGISTER_ACTION",
      value: params.registerAction ? JSON.stringify(params.registerAction) : "",
    },
  ];

  if (params.extraCodebuildEnvVars?.length) {
    environmentVariables.push(...params.extraCodebuildEnvVars);
  }

  if ("s3CredsSecretArn" in params && params.s3CredsSecretArn) {
    environmentVariables.push({
      name: "ENVKEY_RELEASES_S3_CREDS_JSON",
      // the docs are confusing for this; it's just the secret arn
      value: params.s3CredsSecretArn,
      type: "SECRETS_MANAGER",
    });
  }

  await codebuild
    .createProject({
      name: codebuildProjectNames.initialInstall(deploymentTag),
      artifacts: { type: "NO_ARTIFACTS" },
      environment: {
        privilegedMode: true, // for docker
        computeType: "BUILD_GENERAL1_SMALL",
        image: "aws/codebuild/standard:4.0",
        imagePullCredentialsType: "CODEBUILD",
        type: "LINUX_CONTAINER",
        environmentVariables,
      },
      serviceRole,
      source: {
        type: "S3",
        location: `${sourcesBucketName}/${installerFile}`,
        buildspec: installerBuildspec,
      },
      timeoutInMinutes: 90,
    })
    .promise();
};

export const createUpdaterProject = async (params: {
  codebuild: CodeBuild;
  deploymentTag: string;
  snsTopicArn: string;
  serviceRole: string;
  extraCodebuildEnvVars?: { name: string; value: string }[];
  s3CredsSecretArn?: string;
}): Promise<void> => {
  const { codebuild, deploymentTag, snsTopicArn, serviceRole } = params;

  const sourcesBucketName = getSourcesBucketName(deploymentTag);
  const environmentVariables: CodeBuild.EnvironmentVariables = [
    { name: "DEPLOYMENT_TAG", value: deploymentTag },
    {
      name: "SNS_TOPIC_ARN",
      value: snsTopicArn,
    },
    // the next three be updated later when an actual api update is needed
    { name: "API_VERSION_NUMBER", value: "" },
    { name: "INFRA_VERSION_NUMBER_TO", value: "" },
    // Allows testing deployments or overriding deployments by deploying using a specific version
    // of the Infra which is different than its published latest infra-version.txt on main.
    { name: "RUN_FROM_INFRA_VERSION_NUMBER_OVERRIDE", value: "" },
  ];

  if (params.extraCodebuildEnvVars?.length) {
    environmentVariables.push(...params.extraCodebuildEnvVars);
  }

  if ("s3CredsSecretArn" in params && params.s3CredsSecretArn) {
    environmentVariables.push({
      name: "ENVKEY_RELEASES_S3_CREDS_JSON",
      // the docs are confusing for this; it's just the secret arn
      value: params.s3CredsSecretArn,
      type: "SECRETS_MANAGER",
    });
  }

  await codebuild
    .createProject({
      name: codebuildProjectNames.updater(deploymentTag),
      artifacts: { type: "NO_ARTIFACTS" },
      environment: {
        privilegedMode: true, // for docker
        computeType: "BUILD_GENERAL1_SMALL",
        image: "aws/codebuild/standard:4.0",
        imagePullCredentialsType: "CODEBUILD",
        type: "LINUX_CONTAINER",
        environmentVariables,
      },
      serviceRole,
      source: {
        type: "S3",
        location: `${sourcesBucketName}/${updaterFile}`,
        buildspec: updaterBuildspec,
      },
      timeoutInMinutes: 60,
    })
    .promise();
};
