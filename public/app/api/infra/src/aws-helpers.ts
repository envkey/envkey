import S3 from "aws-sdk/clients/s3";
import { SecretsManager, SharedIniFileCredentials } from "aws-sdk";
import { parameterStoreDeploymentKey, Region } from "./stack-constants";
import IAM from "aws-sdk/clients/iam";
import Route53Domains from "aws-sdk/clients/route53domains";
import ACM from "aws-sdk/clients/acm";
import SES from "aws-sdk/clients/ses";
import SSM from "aws-sdk/clients/ssm";
import { execSync } from "child_process";
import CF from "aws-sdk/clients/cloudformation";
import CodeBuild from "aws-sdk/clients/codebuild";
import { waitForEnterKeyPromise } from "./lib";

const {
  // only available on aws
  CODEBUILD_BUILD_ARN,
} = process.env;

export const preDeployValidations = async (params: {
  profile?: string;
  primaryRegion: string;
  failoverRegion?: string;
  domain: string;
  customDomain: boolean;
  verifiedSenderEmail: string;
}) => {
  const {
    profile,
    primaryRegion,
    failoverRegion,
    domain,
    customDomain,
    verifiedSenderEmail,
  } = params;

  if (failoverRegion && failoverRegion == primaryRegion) {
    throw new Error("Failover region can't be the same as primary region");
  }

  const awsAccountId = await getAwsAccountId(profile);

  console.log(
    `Using region ${primaryRegion} and failover region ${failoverRegion}.`
  );

  await validateSenderEmail(profile, primaryRegion, verifiedSenderEmail);
  console.log(`Validated sender email allowed:\n  ${verifiedSenderEmail}`);

  if (customDomain) {
    console.log("Skipping domain validation and user must setup DNS later");
  } else {
    await validateDomain(profile, domain);
    console.log(`Validated domain:\n  ${domain}`);
  }

  const certificateArn = await getAwsCertArnForDomain(
    profile,
    primaryRegion,
    domain
  );
  console.log(`Using primary region certificate:\n  ${certificateArn}`);

  const failoverRegionCertificateArn = failoverRegion
    ? await getAwsCertArnForDomain(profile, failoverRegion, domain)
    : undefined;

  if (failoverRegionCertificateArn) {
    console.log(
      `Using failover region certificate:\n  ${failoverRegionCertificateArn}`
    );
  }

  return { awsAccountId, certificateArn, failoverRegionCertificateArn };
};

export const stackExists = async (
  client: CF,
  name: string
): Promise<boolean> => {
  try {
    const { Stacks } = await client
      .describeStacks({
        StackName: name,
      })
      .promise();

    if (!Stacks) {
      throw new Error("Error checking stack: " + name);
    }

    return Stacks[0].StackStatus == "CREATE_COMPLETE";
  } catch (err) {
    if (err.message.includes("does not exist")) {
      return false;
    }
    throw err;
  }
};

export const createBucketIfNeeded =
  (s3Instance: S3) => async (name: string) => {
    if (!(await doesBucketExist(s3Instance, name))) {
      await s3Instance
        .createBucket({
          Bucket: name,
          ACL: "private",
        })
        .promise();
    }
    await s3Instance
      .putPublicAccessBlock({
        Bucket: name,
        PublicAccessBlockConfiguration: {
          /* required */ BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      })
      .promise();
  };

const doesBucketExist = async (s3: S3, bucketName: string) => {
  try {
    await s3
      .headBucket({
        Bucket: bucketName,
      })
      .promise();
    return true;
  } catch (error) {
    if (error.statusCode === 404) {
      return false;
    }
    throw error;
  }
};

export const getAwsAccountId = async (profile?: string) => {
  if (CODEBUILD_BUILD_ARN) {
    console.log("Using codebuild ARN for accountId", CODEBUILD_BUILD_ARN);
    // cannot use getUser when running as a role in codebuild, and
    // codebuild does not document exposing the account ID in its own var.
    // arn format:
    //    `arn:aws:codebuild:region-ID:account-ID:build/codebuild-demo-project:b1e6661e-e4f2-4156-9ab9-82a19EXAMPLE`
    const arnParts = CODEBUILD_BUILD_ARN.split(":");
    return arnParts[4];
  }
  const credentials = profile
    ? new SharedIniFileCredentials({
        profile,
      })
    : undefined;
  const user = await new IAM({ credentials }).getUser().promise();
  const awsAccountId = user.User.Arn.split("arn:aws:iam::")[1].split(
    /:user|:root/
  )[0] as string;

  return awsAccountId;
};

export const validateDomain = async (
  profile: string | undefined,
  domain: string
) => {
  const credentials = profile
    ? new SharedIniFileCredentials({
        profile,
      })
    : undefined;

  // only certain regions allow querying this endpint, but the domains are considered global
  const allDomains = await new Route53Domains({
    credentials,
    region: "us-east-1",
  })
    .listDomains()
    .promise();

  const d = allDomains.Domains.find((d) => domain.includes(d.DomainName));
  if (!d) {
    throw new Error(
      `AWS Route53 domain was not found for ${domain}. Did you mean to use an existing custom domain instead?`
    );
  }
};

export const getAwsCertArnForDomain = async (
  profile: string | undefined,
  region: string,
  domain: string
) => {
  const credentials = profile
    ? new SharedIniFileCredentials({
        profile,
      })
    : undefined;
  const allCerts = await new ACM({ credentials, region })
    .listCertificates()
    .promise();
  const cert = allCerts?.CertificateSummaryList?.find((c) =>
    [`*.${domain}`, domain].includes(c.DomainName!)
  );
  if (!cert || !cert.CertificateArn) {
    throw new Error(
      `AWS ACM is missing a certificate for ${domain} in region ${region}. Check the region for the certificate, if it was already created. Found ${
        allCerts?.CertificateSummaryList?.length ?? 0
      } certs. ${allCerts?.CertificateSummaryList?.map((c) => c.DomainName!)}`
    );
  }

  return cert.CertificateArn;
};

export const validateSenderEmail = async (
  profile: string | undefined,
  region: string,
  senderEmail: string
) => {
  const senderDomain = senderEmail.split("@")[1];
  if (!senderDomain) {
    throw new Error("Unexpected email format!");
  }
  const credentials = profile
    ? new SharedIniFileCredentials({
        profile,
      })
    : undefined;
  const ses = new SES({ credentials, region });
  const { Identities: identities } = await ses
    .listIdentities({
      MaxItems: 1000,
    })
    .promise();

  const blurb = `The address ${senderEmail} must be verified with SES to continue. Email addresses are case sensitive.`;
  if (!identities || !identities.length) {
    throw new Error(
      `No verified SES email sender identities were found for ${region}. ${blurb}`
    );
  }

  const identity = identities.find((emailOrDomain) => {
    const identityIsDomain = !emailOrDomain.includes("@");
    if (identityIsDomain) {
      return emailOrDomain === senderDomain;
    }
    return emailOrDomain === senderEmail;
  });
  if (!identity) {
    throw new Error(
      `${blurb} Found ${
        identities.length
      } other verified sender identities in ${region}: ${identities.join(", ")}`
    );
  }
  // They added the email or domain.
  // Is it verified?
  const {
    VerificationAttributes: { [identity]: identityVerification },
  } = await ses
    .getIdentityVerificationAttributes({
      Identities: [identity],
    })
    .promise();
  if (identityVerification.VerificationStatus !== "Success") {
    throw new Error(
      `Found SES sender identity, but it is not yet verified by AWS.`
    );
  }
  // ok
};

// extracts cloudformation templates to a folder `templates` within `containingFolder`, overwriting
// templates if they existed
export const processTemplatesReturningFolder = async (
  containingFolder: string,
  zipFileName: string
) => {
  const extractToFolder = `${containingFolder}/templates`;
  console.log("  Extracting templates to:", extractToFolder);
  execSync(`rm -rf ${extractToFolder}`);
  execSync(`mkdir -p ${extractToFolder}`);

  execSync(`unzip ${containingFolder}/${zipFileName} -d ${extractToFolder}`, {
    cwd: process.cwd(),
  });

  return extractToFolder;
};

export const stackResult = async (
  client: CF,
  name: string,
  allowRollbackOk?: boolean
) => {
  while (true) {
    const response = await client
      .describeStacks({
        StackName: name,
      })
      .promise();
    const { Stacks } = response;

    if (!Stacks) {
      console.log("Error fetching stack results", response);
      throw new Error("Error fetching stack status: " + name);
    }

    const status = Stacks[0].StackStatus;

    switch (status) {
      case "CREATE_COMPLETE":
      case "UPDATE_COMPLETE":
      case "DELETE_COMPLETE":
      case "ROLLBACK_COMPLETE":
      case "IMPORT_COMPLETE":
      case "IMPORT_ROLLBACK_COMPLETE":
        console.log("Stack task complete:\n ", status, name);

        const outputs = Stacks[0].Outputs,
          res: Record<string, string> = {};

        if (outputs) {
          for (let { OutputKey, OutputValue } of outputs) {
            res[OutputKey!] = OutputValue!;
          }
        }

        return res;
      case "CREATE_IN_PROGRESS":
      case "UPDATE_IN_PROGRESS":
      case "UPDATE_ROLLBACK_COMPLETE":
      case "UPDATE_COMPLETE_CLEANUP_IN_PROGRESS":
      case "UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS":
      case "DELETE_IN_PROGRESS":
      // failures will trigger rollback straight away, rather than an error state
      case allowRollbackOk ? "ROLLBACK_IN_PROGRESS" : "__Not_Allowed":
      case "IMPORT_IN_PROGRESS":
      case "IMPORT_ROLLBACK_IN_PROGRESS":
        console.log(" ", status, name);
        await new Promise((resolve) => setTimeout(resolve, 10000));
        break;
      default:
        console.log("Error status:", response);
        throw new Error("Error creating stack: " + name);
    }
  }
};

export const waitForBuild = async (codeBuild: CodeBuild, buildId: string) => {
  while (true) {
    const { builds } = await codeBuild
      .batchGetBuilds({ ids: [buildId] })
      .promise();
    if (!builds) {
      throw new Error(`Failed waiting for build ${buildId}!`);
    }
    if (!builds[0]) {
      throw new Error(`Build ${buildId} not found!`);
    }
    const status = builds[0].buildStatus;
    switch (status) {
      case "IN_PROGRESS":
        console.log(" ", status, "build", buildId);
        await new Promise((resolve) => setTimeout(resolve, 10000));
        break;
      case "SUCCEEDED":
        console.log(" ", status, "build", buildId);
        return;
      default:
        throw new Error(`Build ${buildId} reached bad status ${status}`);
    }
  }
};

export const getLatestBuild = async (
  codebuild: CodeBuild,
  codebuildProjectName: string
): Promise<
  | (Pick<CodeBuild.Build, "id" | "buildNumber" | "buildStatus"> & {
      environmentVariables: CodeBuild.EnvironmentVariables;
    })
  | null
> => {
  const { ids } = await codebuild
    .listBuildsForProject({
      projectName: codebuildProjectName,
      sortOrder: "DESCENDING",
    })
    .promise();
  const buildId = ids?.[0];
  if (!buildId) {
    return null;
  }
  const { builds } = await codebuild
    .batchGetBuilds({ ids: [buildId] })
    .promise();
  const build = builds?.[0];
  if (!build) {
    return null;
  }
  const { id, buildStatus, buildNumber, environment } = build!;
  const environmentVariables = environment!
    .environmentVariables as CodeBuild.EnvironmentVariables;
  return { id, buildStatus, buildNumber, environmentVariables };
};

export const dangerouslyDeleteS3BucketsWithConfirm = async (params: {
  s3: S3;
  all: boolean;
  filterIgnore?: string;
  filterInclude?: string;
  dryRun?: boolean;
  force?: boolean;
}) => {
  const { s3, all, filterIgnore, filterInclude, dryRun, force } = params;
  const { Buckets: allBuckets } = await s3.listBuckets().promise();
  let filteredBuckets =
    allBuckets?.filter((b) => b.Name?.includes("envkey-")) || [];
  if (filterIgnore) {
    filteredBuckets = filteredBuckets.filter(
      (b) => !b.Name?.includes(filterIgnore)
    );
  } else if (filterInclude) {
    filteredBuckets = filteredBuckets.filter((b) =>
      b.Name?.includes(filterInclude)
    );
  }
  if (!filteredBuckets.length) {
    console.log("  No buckets found");
    return;
  }

  console.log("  Buckets found:", filteredBuckets.length);
  if (dryRun) {
    console.log(" ", filteredBuckets.map((b) => b.Name).join("\n  "));
    return;
  }

  if (all && !force) {
    console.log(filteredBuckets.map((b) => b.Name));
    const res = await waitForEnterKeyPromise(
      `\n  Delete all ${filteredBuckets.length} envkey buckets!? Enter number of buckets:  `
    );
    if (res !== filteredBuckets.length.toString()) {
      console.log("Aborted!");
      return;
    }
  }

  for (const bucket of filteredBuckets) {
    console.log("");
    const name = bucket.Name!;
    if (!force) {
      const res = await waitForEnterKeyPromise(
        `\n  Delete bucket ${name} ?? [n/y]  `
      );
      if (res !== "y") {
        console.log("  Skipping bucket", name);
        continue;
      }
    }

    try {
      let marker;
      let objects: S3.ObjectList = [];
      while (true) {
        const { Contents, Marker } = await s3
          .listObjects({
            Bucket: name,
            MaxKeys: 100,
          })
          .promise();
        marker = Marker;
        if (Contents) {
          objects.push(...Contents);
        }
        if (!Contents?.length || !Marker) {
          break;
        }
      }

      console.log("  Emptying bucket:", name);
      console.log("    Items:", objects?.length);

      if (objects?.length) {
        for (const o of objects) {
          const { Versions } = await s3
            .listObjectVersions({ Bucket: name, Prefix: o.Key! })
            .promise();
          if (Versions?.length) {
            for (const v of Versions) {
              try {
                console.log("    Deleting version", o.Key, v.VersionId);
                await s3
                  .deleteObject({
                    Bucket: name,
                    Key: o.Key!,
                    VersionId: v.VersionId,
                  })
                  .promise();
              } catch (err) {
                console.error("    ", err.message);
              }
            }
            continue;
          }
          await s3.deleteObject({ Bucket: name, Key: o.Key! }).promise();
        }
      }
    } catch (err) {
      console.error(err.message);
      console.error("  Delete objects problem.");
      console.log("  Will try to delete bucket, still:", name);
    }

    console.log("  Deleting bucket:", name);
    await s3.deleteBucket({ Bucket: name }).promise();
    console.log("  Deleted bucket successfully:", name);
  }
};

export const listCodebuildProjects = async (
  codeBuild: CodeBuild,
  deploymentTag: string
): Promise<string[]> => {
  const tagProjects: string[] = [];
  let nextToken: string | undefined;
  while (true) {
    const { projects, nextToken: nt } = await codeBuild
      .listProjects(nextToken ? { nextToken } : {})
      .promise();
    nextToken = nt;
    if (projects?.length) {
      tagProjects.push(
        ...projects.filter(
          (projectName) =>
            projectName.includes("envkey") &&
            projectName.includes(deploymentTag)
        )
      );
    }
    if (!nextToken || !projects?.length) {
      break;
    }
  }
  return tagProjects;
};

export const dangerouslyDeleteSecretsWithConfirm = async (params: {
  secretsManager: SecretsManager;
  all: boolean;
  force?: boolean;
  filterIgnore?: string;
  filterInclude?: string;
  dryRun?: boolean;
}) => {
  const { secretsManager, all, force, filterIgnore, filterInclude, dryRun } =
    params;
  const { SecretList } = await secretsManager
    .listSecrets({
      MaxResults: 100,
      Filters: [
        {
          Key: "name",
          Values: ["envkey-"],
        },
      ],
    })
    .promise();
  let secrets = SecretList || [];

  if (filterIgnore) {
    secrets = secrets.filter((b) => !b.Name?.includes(filterIgnore));
  } else if (filterInclude) {
    secrets = secrets.filter((b) => b.Name?.includes(filterInclude));
  }
  if (!secrets.length) {
    console.log("No secrets found");
    return;
  }
  console.log("Secrets found:", secrets.length);
  if (dryRun) {
    console.log(" ", secrets.map((b) => b.Name).join("\n  "));
    return;
  }

  if (all && !force) {
    console.log(secrets.map((s) => s.Name));
    const res = await waitForEnterKeyPromise(
      `\nDelete all ${secrets.length} envkey secrets!? Enter number of secrets:  `
    );
    if (res !== secrets.length.toString()) {
      console.log("Aborted!");
      return;
    }
  }

  for (const secret of secrets) {
    console.log("");
    const name = secret.Name;
    if (!all) {
      const res = await waitForEnterKeyPromise(
        `\nDelete secret ${name}? [n/y]  `
      );
      if (res !== "y") {
        console.log("Skipping secret", name);
        continue;
      }
    }

    console.log("  Deleting secret:", name);
    await secretsManager
      .deleteSecret({ RecoveryWindowInDays: 7, SecretId: name! })
      .promise();
    console.log("  Deleted secret successfully:", name);
  }
};

export const putDeployTag = async (params: {
  profile: string | undefined;
  primaryRegion: string;
  deploymentTag: string;
}) => {
  const credentials = params.profile
    ? new SharedIniFileCredentials({
        profile: params.profile,
      })
    : undefined;
  const ssm = new SSM({ region: params.primaryRegion, credentials });
  const tags = [...(await listDeploymentTags(params)), params.deploymentTag];

  await ssm
    .putParameter({
      Name: parameterStoreDeploymentKey,
      Value: tags.join(","),
      Type: "StringList",
      Overwrite: true,
    })
    .promise();

  return listDeploymentTags(params);
};

export const deleteDeployTag = async (params: {
  profile: string | undefined;
  primaryRegion: string;
  deploymentTag: string;
}): Promise<string[]> => {
  const credentials = params.profile
    ? new SharedIniFileCredentials({
        profile: params.profile,
      })
    : undefined;
  const ssm = new SSM({ region: params.primaryRegion, credentials });

  const existing = await listDeploymentTags(params);
  const tags = existing.filter((t) => t !== params.deploymentTag).join(",");
  if (!tags.length) {
    await ssm
      .deleteParameter({
        Name: parameterStoreDeploymentKey,
      })
      .promise();
  } else {
    await ssm
      .putParameter({
        Name: parameterStoreDeploymentKey,
        Value: tags,
        Type: "StringList",
        Overwrite: true,
      })
      .promise();
  }

  return listDeploymentTags(params);
};

export const listDeploymentTags = async (params: {
  profile: string | undefined;
  primaryRegion: string;
}): Promise<string[]> => {
  const credentials = params.profile
    ? new SharedIniFileCredentials({
        profile: params.profile,
      })
    : undefined;
  const ssm = new SSM({ region: params.primaryRegion, credentials });

  const existing = await safeGetParameter(ssm, parameterStoreDeploymentKey);
  if (existing) {
    return existing.split(",");
  }

  return [];
};

export const safeGetParameter = async (
  ssm: SSM,
  paramName: string
): Promise<string | undefined> => {
  try {
    const param = (await ssm.getParameter({ Name: paramName }).promise())
      ?.Parameter?.Value;
    return param;
  } catch (err) {
    if (err.code !== "ParameterNotFound") {
      // this is how parameter store tells us the parameter does not exist
      throw err;
    }
  }
  return undefined;
};
