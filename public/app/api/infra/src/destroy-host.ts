import { wait } from "@core/lib/utils/wait";
import { SharedIniFileCredentials } from "aws-sdk";
import IAM from "aws-sdk/clients/iam";
import ECR from "aws-sdk/clients/ecr";
import ECS from "aws-sdk/clients/ecs";
import EC2 from "aws-sdk/clients/ec2";
import ELBv2 from "aws-sdk/clients/elbv2";
import CF from "aws-sdk/clients/cloudformation";
import CodeBuild from "aws-sdk/clients/codebuild";
import Secrets from "aws-sdk/clients/secretsmanager";
import S3 from "aws-sdk/clients/s3";
import SNS from "aws-sdk/clients/sns";
import {
  dangerouslyDeleteS3BucketsWithConfirm,
  dangerouslyDeleteSecretsWithConfirm,
  deleteDeployTag,
  getAwsAccountId,
  getTagFinder,
  getTagFilters,
  listCodebuildProjects,
} from "./aws-helpers";
import {
  CfStack,
  getEcrRepoName,
  getSnsAlertTopicArn,
} from "./stack-constants";
import * as R from "ramda";

export const destroyHost = async (params: {
  deploymentTag: string;
  primaryRegion: string;
  failoverRegion?: string;
  dryRun?: boolean;
  profile?: string;
}): Promise<boolean> => {
  const { dryRun, deploymentTag, profile, primaryRegion, failoverRegion } =
    params;
  const credentials = profile
    ? new SharedIniFileCredentials({
        profile,
      })
    : undefined;
  const s3 = new S3({ region: primaryRegion, credentials });
  const s3Secondary = new S3({ region: failoverRegion, credentials });
  const cfPrimary = new CF({
    region: primaryRegion,
    credentials,
  });
  const cfSecondary = failoverRegion
    ? new CF({
        region: failoverRegion,
        credentials,
      })
    : undefined;
  const codeBuild = new CodeBuild({ region: primaryRegion, credentials });
  const secretsManager = new Secrets({ region: primaryRegion, credentials });
  const sns = new SNS({ region: primaryRegion, credentials });
  const iam = new IAM({ region: primaryRegion, credentials });
  const ecr = new ECR({ region: primaryRegion, credentials });
  const ecs = new ECS({ region: primaryRegion, credentials });
  const elbPrimary = new ELBv2({ region: primaryRegion, credentials });
  const elbSecondary = failoverRegion
    ? new ELBv2({ region: failoverRegion, credentials })
    : undefined;

  const ec2Primary = new EC2({ region: primaryRegion, credentials });
  const ec2Secondary = failoverRegion
    ? new EC2({ region: failoverRegion, credentials })
    : undefined;

  let failed = false;

  if (dryRun) {
    console.log("DRY RUN - no resources will be deleted.");
  }

  const awsAccountId = await getAwsAccountId(profile);

  const tagFinder = getTagFinder(deploymentTag);
  const tagFilters = getTagFilters(deploymentTag);

  const deleteStackAndWait = async (
    cf: CF,
    stack: CfStack,
    timeout?: number
  ) => {
    try {
      await cf
        .describeStacks({
          StackName: [stack, deploymentTag].join("-"),
        })
        .promise()
        .catch(() => ({ Stacks: undefined }))
        .then(({ Stacks }) => {
          if (Stacks && Stacks[0]?.StackId) {
            if (dryRun) {
              console.log("Stack:\n ", stack, "\n ", Stacks[0].StackId);
              return;
            }
            console.log("Stack:\n  Deleting", stack, Stacks[0].StackId);
            return cf.deleteStack({ StackName: Stacks[0].StackId }).promise();
          }
        });
    } catch (err) {
      console.error(err.message);
      failed = true;
    }

    let waitForDelete = true;
    const start = Date.now();
    let elapsed = 0;
    while (waitForDelete) {
      await cf
        .describeStacks({
          StackName: [stack, deploymentTag].join("-"),
        })
        .promise()
        .catch(() => ({ Stacks: undefined }))
        .then(({ Stacks }) => {
          if (!Stacks || Stacks.length == 0) {
            waitForDelete = false;
          }
        });

      await wait(2000);

      elapsed = Date.now() - start;
      if (timeout && elapsed > timeout) {
        waitForDelete = false;
      }
    }
  };

  // delete ecr repo first - CF won't delete ECR repos with --force so it always fails,
  // leaving the stack around
  try {
    const repositoryName = getEcrRepoName(deploymentTag);

    if (dryRun) {
      console.log("Container registry:\n ", repositoryName);
    } else {
      console.log("Deleting container registry:\n ", repositoryName);
      await ecr.deleteRepository({ repositoryName, force: true }).promise();
    }
  } catch (err) {
    if (err.code === "RepositoryNotFoundException") {
      console.error("   no container registry to delete.");
    } else {
      console.error("  ", err.message);
      failed = true;
    }
  }

  // bring down any running fargate tasks and delete the cluster since cloudformation has a hard time deleting it
  const clusterRes = await ecs.listClusters().promise();

  for (let clusterArn of clusterRes.clusterArns ?? []) {
    if (clusterArn.includes(deploymentTag)) {
      console.log("Bringing down cluster: ", clusterArn);

      let serviceRes = await ecs
        .listServices({ cluster: clusterArn })
        .promise();

      console.log("Deleting service...");
      await ecs
        .deleteService({
          service: serviceRes!.serviceArns![0],
          cluster: clusterArn,
          force: true,
        })
        .promise();

      while (serviceRes.serviceArns?.length) {
        console.log("Waiting for service to delete...");
        await wait(2000);
        serviceRes = await ecs.listServices({ cluster: clusterArn }).promise();
      }

      let tasksRes = await ecs.listTasks({ cluster: clusterArn }).promise();

      await Promise.all(
        (tasksRes.taskArns ?? []).map((taskArn) =>
          ecs.stopTask({ cluster: clusterArn, task: taskArn }).promise()
        )
      );

      while (tasksRes.taskArns?.length) {
        console.log("Waiting for tasks to stop...");

        await wait(2000);
        tasksRes = await ecs.listTasks({ cluster: clusterArn }).promise();
      }

      console.log("Deleting cluster...");
      await ecs.deleteCluster({ cluster: clusterArn! }).promise();
    }
  }

  console.log("Deleting listener and privatelink CloudFormation stacks...");
  await Promise.all([
    deleteStackAndWait(cfPrimary, CfStack.ENVKEY_LISTENER_RULES),
    deleteStackAndWait(cfPrimary, CfStack.ENVKEY_PRIVATE_LINK),
  ]);

  console.log("Clearing out lambda stacks...");
  await Promise.all([
    deleteStackAndWait(cfPrimary, CfStack.ENVKEY_CLOUD_BILLING),
    deleteStackAndWait(cfPrimary, CfStack.ENVKEY_FAILOVER_LAMBDA),
    cfSecondary
      ? deleteStackAndWait(cfSecondary, CfStack.ENVKEY_SECONDARY_LAMBDA)
      : undefined,
  ]);

  console.log("Deleting load balancer CloudFormation stacks...");
  await Promise.all([
    deleteStackAndWait(cfPrimary, CfStack.ENVKEY_INTERNAL_LOAD_BALANCERS),
    deleteStackAndWait(cfPrimary, CfStack.ENVKEY_INTERNET_LOAD_BALANCERS),
    cfSecondary
      ? deleteStackAndWait(cfSecondary, CfStack.ENVKEY_SECONDARY_INTERNET)
      : undefined,
  ]);

  console.log("Deleting vpc networking CloudFormation stack...");
  await Promise.all([
    deleteStackAndWait(cfPrimary, CfStack.ENVKEY_VPC_NETWORKING),
  ]);

  console.log(
    "Deleting any networking resources that were created dynamically by api..."
  );

  await Promise.all(
    (
      [
        [ec2Primary, "primary"],
        ...(ec2Secondary ? [[ec2Secondary, "secondary"]] : []),
      ] as [EC2, "primary" | "secondary"][]
    ).map(async ([ec2, region]) => {
      const [igwRes, routeTableRes, subnetsRes, securityGroupsRes] =
        await Promise.all([
          ec2.describeInternetGateways({ Filters: tagFilters }).promise(),
          ec2.describeRouteTables({ Filters: tagFilters }).promise(),
          ec2.describeSubnets({ Filters: tagFilters }).promise(),
          ec2
            .describeSecurityGroups({
              Filters: [
                {
                  Name: "group-name",
                  Values: [`envkey-alb-sg-${deploymentTag}`],
                },
              ],
            })
            .promise(),
        ]);

      const publicRouteTable = (routeTableRes.RouteTables ?? [])[0];
      const publicRouteTableId = publicRouteTable?.RouteTableId;
      const loadBalancerSubnets = subnetsRes.Subnets ?? [];
      const albSecurityGroup = (securityGroupsRes.SecurityGroups ?? [])[0];

      for (let igw of igwRes.InternetGateways!) {
        if ((igw.Tags ?? []).find(tagFinder)) {
          if (publicRouteTableId) {
            console.log(`Deleting api-created public route...`);

            await ec2
              .deleteRoute({
                RouteTableId: publicRouteTableId,
                DestinationCidrBlock: "0.0.0.0/0",
              })
              .promise()
              .catch((err) => {
                console.log("Couldn't delete public route", {
                  routeTableId: publicRouteTableId,
                  err,
                  region,
                });
              });
          }

          if (igw.Attachments && igw.Attachments.length > 0) {
            console.log(
              `Detaching api-created internet gateway in ${region} region...`
            );

            for (let attachment of igw.Attachments) {
              await ec2
                .detachInternetGateway({
                  VpcId: attachment.VpcId!,
                  InternetGatewayId: igw.InternetGatewayId!,
                })
                .promise()
                .catch((err) => {
                  console.log("Couldn't detach internet gateway", {
                    attachment,
                    igw,
                    err,
                    region,
                  });
                });
            }
          }

          console.log(
            `Deleting api-created internet gateway in ${region} region...`
          );
          await ec2
            .deleteInternetGateway({
              InternetGatewayId: igw.InternetGatewayId!,
            })
            .promise()
            .catch((err) => {
              console.log("Couldn't delete internet gateway", {
                igw,
                err,
                region,
              });
            });
        }
      }

      if (publicRouteTable && loadBalancerSubnets.length > 0) {
        console.log(
          `Disassociating api-created route table from all subnets in ${region} region...`
        );
        await Promise.all(
          loadBalancerSubnets.map(async (subnet) => {
            const association = (publicRouteTable.Associations ?? []).find(
              (assoc) => assoc.SubnetId == subnet.SubnetId!
            );
            if (association) {
              return ec2
                .disassociateRouteTable({
                  AssociationId: association.RouteTableAssociationId!,
                })
                .promise()
                .catch((err) => {
                  console.log("Couldn't disassociate route table", {
                    association,
                    err,
                    region,
                  });
                });
            }
          })
        );
      }

      if (publicRouteTableId) {
        console.log(
          `Deleting api-created public route table in ${region} region...`
        );
        await ec2
          .deleteRouteTable({ RouteTableId: publicRouteTableId })
          .promise()
          .catch((err) => {
            console.log("Couldn't delete route table", {
              publicRouteTableId,
              err,
              region,
            });
          });
      }

      if (loadBalancerSubnets.length > 0) {
        console.log(`Deleting api-created subnets in ${region} region...`);

        let numAttempts = 0;
        let taggedSubnets = loadBalancerSubnets;

        while (numAttempts < 5) {
          console.log("Deleting subnets...", { numAttempts });
          try {
            await Promise.all(
              taggedSubnets.map((subnet) =>
                ec2.deleteSubnet({ SubnetId: subnet.SubnetId! }).promise()
              )
            );
            break;
          } catch (err) {
            console.log("Error deleting subnets, retrying in 10s...", {
              err,
              numAttempts,
              region,
            });

            const res = await ec2
              .describeSubnets({ Filters: tagFilters })
              .promise();
            taggedSubnets = res.Subnets!;

            await wait(10000);
            numAttempts++;
          }
        }
      }

      if (albSecurityGroup) {
        console.log(`Deleting alb security group in ${region} region...`);
        await ec2
          .deleteSecurityGroup({ GroupId: albSecurityGroup.GroupId! })
          .promise();
      }
    })
  );

  if (ec2Secondary) {
    const secondaryVpcRes = await ec2Secondary.describeVpcs().promise();
    const secondaryVpc = (secondaryVpcRes.Vpcs ?? []).find((vpc) =>
      (vpc.Tags ?? []).find(tagFinder)
    );
    if (secondaryVpc) {
      console.log("Deleting secondary region VPC...");
      await ec2Secondary.deleteVpc({ VpcId: secondaryVpc.VpcId! });
    }
  }

  console.log("Deleting all CloudFormation stacks...");
  for (const stackBaseName of R.reverse(Object.values(CfStack))) {
    const cfClient =
      cfSecondary && stackBaseName.includes("-secondary-")
        ? cfSecondary
        : cfPrimary;
    const stackName = [stackBaseName, deploymentTag].join("-");

    try {
      await cfClient
        .describeStacks({ StackName: stackName })
        .promise()
        .catch(() => ({ Stacks: undefined }))
        .then(({ Stacks }) => {
          if (Stacks && Stacks[0]?.StackId) {
            if (dryRun) {
              console.log("Stack:\n ", stackName, "\n ", Stacks[0].StackId);
              return;
            }
            console.log("Stack:\n  Deleting", stackName, Stacks[0].StackId);
            return cfClient
              .deleteStack({ StackName: Stacks[0].StackId })
              .promise();
          }
        });
    } catch (err) {
      console.error(err.message);
      failed = true;
    }
  }

  // delete codebuild projects by deploymentTag
  const tagProjects = await listCodebuildProjects(codeBuild, deploymentTag);
  console.log("Build projects to delete:", tagProjects.length);
  for (const name of tagProjects) {
    if (dryRun) {
      console.log("  Build project:", name);
      continue;
    }
    console.log("  Deleting build project:", name);
    try {
      await codeBuild
        .deleteProject({
          name,
        })
        .promise();
    } catch (err) {
      console.error(err.message);
      failed = failed || !err.message?.includes("does not exist");
    }
  }

  // delete sns topics
  try {
    const topicArn = getSnsAlertTopicArn(
      deploymentTag,
      primaryRegion,
      awsAccountId
    );
    if (dryRun) {
      console.log("SNS topic:\n ", topicArn);
    } else {
      console.log("Deleting SNS topic:\n ", topicArn);
      await sns.deleteTopic({ TopicArn: topicArn }).promise();
    }
  } catch (err) {
    console.error(err.message);
    failed = failed || !err.message?.includes("does not exist");
  }

  // delete IAM roles
  const roleNames: string[] = [];
  let marker: string | undefined;
  while (true) {
    const { Roles: roles, Marker: m } = await iam
      .listRoles(marker ? { MaxItems: 100, Marker: marker } : { MaxItems: 100 })
      .promise();
    marker = m;
    const filteredRoles = roles.filter((role) =>
      role.RoleName.includes(deploymentTag)
    );
    roleNames.push(...filteredRoles.map((role) => role.RoleName));
    if (!roles.length || !marker) {
      break;
    }
  }
  console.log("IAM roles found:", roleNames.length);
  for (const roleName of roleNames) {
    if (dryRun) {
      console.log("  IAM role:", roleName);
      continue;
    }
    console.log("  Deleting iam role", roleName);
    try {
      await iam.deleteRole({ RoleName: roleName });
    } catch (err) {
      console.error(err.message);
      failed = failed || !err.message?.includes("does not exist");
    }
  }

  // delete all buckets by deploymentTag
  try {
    // primary
    console.log("Primary buckets...");
    await dangerouslyDeleteS3BucketsWithConfirm({
      s3,
      all: true,
      force: true,
      filterInclude: deploymentTag,
      dryRun,
    });
  } catch (err) {
    console.error(err.message);
    failed = failed || !err.message?.includes("does not exist");
  }
  try {
    // secondary
    console.log("Secondary buckets...");
    await dangerouslyDeleteS3BucketsWithConfirm({
      s3: s3Secondary,
      all: true,
      force: true,
      filterInclude: deploymentTag,
      dryRun,
    });
  } catch (err) {
    console.error(err.message);
    failed = failed || !err.message?.includes("does not exist");
  }

  // delete all secrets by deploymentTag
  try {
    await dangerouslyDeleteSecretsWithConfirm({
      secretsManager,
      all: true,
      force: true,
      filterInclude: deploymentTag,
      dryRun,
    });
  } catch (err) {
    console.error(err.message);
    failed = failed || !err.message?.includes("does not exist");
  }

  if (!dryRun && !failed) {
    try {
      await deleteDeployTag({ profile, primaryRegion, deploymentTag });
    } catch (err) {
      console.log(err.message);
      failed = true;
    }
  }

  return failed;
};
