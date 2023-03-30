import { Infra } from "@core/types";

export const API_ZIP_FILE =
  process.env.ENVKEY_OVERRIDE_API_ZIP_FILE || "api.enterprise.zip"; // Will be set in CLI or CodeBuild, but not on API.

export const API_PROJECT_NAME =
  (process.env.ENVKEY_OVERRIDE_API_PROJECT_NAME as "apicloud" | undefined) ||
  "apienterprise";

// our release artifact buckets will always be in that region, at least for now
export const RELEASE_ASSET_REGION = "us-east-1";
// the buckets can be overriden for cloud
export const ENVKEY_RELEASES_BUCKET =
  process.env.ENVKEY_RELEASES_BUCKET || "envkey-releases";
// the following creds can be overriden for cloud or development, when pulling updates from a private bucket
export const envkeyReleasesS3Creds: Infra.OptionalAwsCreds = process.env
  .ENVKEY_RELEASES_S3_CREDS_JSON
  ? (JSON.parse(process.env.ENVKEY_RELEASES_S3_CREDS_JSON) as {
      accessKeyId: string;
      secretAccessKey: string;
    })
  : undefined;

export const PARAM_API_VERSION_NUMBER = "ApiVersionNumber";
export const PARAM_INFRA_VERSION_NUMBER = "InfraVersionNumber";

export const githubLatestVersionFiles: Record<Infra.ProjectType, string> = {
  apicommunity: `releases/apicommunity/apicommunity-version.txt`,
  apienterprise: `releases/apienterprise/apienterprise-version.txt`,
  apicloud: `releases/apicloud/apicloud-version.txt`,
  cli: `releases/cli/cli-version.txt`,
  desktop: `releases/desktop/desktop-version.txt`,
  infra: `releases/infra/infra-version.txt`,
  failover: `releases/failover/failover-version.txt`,
  envkeysource: `releases/envkeysource/envkeysource-version.txt`,
};

export const githubApiMinInfraVersionFile =
  "public/app/api-version-to-minimum-infra-version.json";
export const apiToMinInfraMap = <Record<string, string>>(
  require("../../../api-version-to-minimum-infra-version.json")
);

export const installerFile = "installer.zip";
export const failoverFile = "failover.zip";
export const updaterFile = "updater.zip";
export const installerBuildspec = "installer-buildspec.yml";
export const updaterBuildspec = "updater-inception-buildspec.yml";

// Important: order matters as they will be destroyed in reverse order of below
export enum CfStack {
  ENVKEY_VPC = "envkey-vpc",
  ENVKEY_VPC_NETWORKING = "envkey-vpc-networking",
  ENVKEY_DB = "envkey-db",
  ENVKEY_FAILOVER_BUCKET = "envkey-failover-bucket",
  ENVKEY_FAILOVER_SINGLE_REGION = "envkey-failover-single-region",
  ENVKEY_FAILOVER_MULTI_REGION = "envkey-failover-multi-region",
  ENVKEY_FAILOVER_LAMBDA = "envkey-failover-lambda",
  ENVKEY_INTERNET_LOAD_BALANCERS = "envkey-internet-load-balancers",
  ENVKEY_INTERNAL_LOAD_BALANCERS = "envkey-internal-load-balancers",
  ENVKEY_LISTENER_RULES = "envkey-listener-rules",
  ENVKEY_FARGATE_API = "envkey-fargate-api",
  ENVKEY_SECONDARY_BUCKET = "envkey-secondary-bucket",
  ENVKEY_SECONDARY_LAMBDA = "envkey-secondary-lambda",
  ENVKEY_SECONDARY_INTERNET = "envkey-secondary-internet",
  ENVKEY_PRIVATE_LINK = "envkey-private-link",
  ENVKEY_PRIVATE_LINK_DNS_VERIFICATION = "envkey-private-link-dns-verification",
  ENVKEY_ALERTS = "envkey-alerts",
  ENVKEY_DNS = "envkey-dns",
  ENVKEY_WAF_API = "envkey-waf-api",
  ENVKEY_WAF_FAILOVER = "envkey-waf-failover",
  ENVKEY_WAF_SECONDARY = "envkey-waf-secondary",
  ENVKEY_CLOUD_BILLING = "envkey-cloud-billing",
  ENVKEY_CLOUD_OUTGOING_PROXY = "envkey-cloud-outgoing",
  ENVKEY_CLOUD_INTEGRATION_VANTA = "envkey-cloud-integration-vanta",
  ENVKEY_CLOUD_ERROR_REPORTING = "envkey-cloud-error-reporting",
}

export const CAPABILITIES = ["CAPABILITY_IAM", "CAPABILITY_NAMED_IAM"];

export const getFargateStackName = (deploymentTag: string) =>
  [CfStack.ENVKEY_FARGATE_API, deploymentTag].join("-");

export type DbVpcParams = {
  vpc: string;
  privateSubnets: string;
  dbSecurityGroup: string;
  fargateContainerSecurityGroup: string;
  dbCredentials: string;
  dbHost: string;
  privateRouteTable: string;
};

export const parseDbVpcParams = (jsonParams: string): DbVpcParams => {
  let dbVpcParams: DbVpcParams;
  try {
    dbVpcParams = JSON.parse(jsonParams);
  } catch (err) {
    console.log("DB and VPC params failed to parse", jsonParams, err);
    throw err;
  }

  for (let k of [
    <const>"vpc",
    <const>"privateSubnets",
    <const>"dbSecurityGroup",
    <const>"dbCredentials",
    <const>"dbHost",
    <const>"privateRouteTable",
  ]) {
    if (typeof dbVpcParams[k] !== "string" || !dbVpcParams[k]) {
      const err = new Error(
        `DB and VPC params invalid key: ${k}=${dbVpcParams[k]}`
      );
      console.log(err);
      throw err;
    }
  }

  return dbVpcParams;
};

const virginia = "us-east-1";
const ohio = "us-east-2";
const norcal = "us-west-1";
const oregon = "us-west-2";
const canadaCentral = "ca-central-1";
const saoPaolo = "sa-east-1";
const singapore = "ap-southeast-1";
const sydney = "ap-southeast-2";
const ireland = "eu-west-1";
const london = "eu-west-2";
const paris = "eu-west-3";
const frankfurt = "eu-central-1";
const stockholm = "eu-north-1";
const mumbai = "ap-south-1";
const tokyo = "ap-northeast-1";
const seoul = "ap-northeast-2";

export const regionLabels = {
  [virginia]: "Virgina",
  [ohio]: "Ohio",
  [norcal]: "Northern California",
  [oregon]: "Oregon",
  [canadaCentral]: "Central Canada",
  [saoPaolo]: "São Paulo",
  [sydney]: "Sydney",
  [ireland]: "Ireland",
  [frankfurt]: "Frankfurt",
  [stockholm]: "Stockholm",
  [singapore]: "Singapore",
  [london]: "London",
  [paris]: "Paris",
  [mumbai]: "Mumbai",
  [tokyo]: "Tokyo",
  [seoul]: "Seoul",
};

export type Region = keyof typeof regionLabels;

export const regions: Region[] = [
  virginia,
  ohio,
  norcal,
  oregon,
  canadaCentral,
  saoPaolo,
  sydney,
  ireland,
  london,
  paris,
  frankfurt,
  stockholm,
  mumbai,
  singapore,
  tokyo,
  seoul,
];

export const defaultFailoverRegions: Record<Region, Region> = {
  [virginia]: ohio,
  [ohio]: virginia,
  [norcal]: oregon,
  [oregon]: norcal,
  [canadaCentral]: oregon,
  [saoPaolo]: virginia,
  [singapore]: sydney,
  [sydney]: singapore,
  [ireland]: london,
  [london]: ireland,
  [paris]: london,
  [frankfurt]: paris,
  [stockholm]: london,
  [mumbai]: singapore,
  [tokyo]: seoul,
  [seoul]: tokyo,
};

export const parameterStoreDeploymentKey = "/envkey/deployment_tags";

export const codebuildProjectNames = {
  initialInstall: (deploymentTag: string) =>
    `envkey-install-runner-${deploymentTag}`,
  updater: (deploymentTag: string) =>
    `envkey-api-update-runner-${deploymentTag}`,
};

export const getSnsAlertTopicName = (deploymentTag: string) =>
  `envkey-app-alert-topic-${deploymentTag}`;
export const getSnsAlertTopicArn = (
  deploymentTag: string,
  primaryRegion: string,
  awsAccountId: string
) =>
  `arn:aws:sns:${primaryRegion}:${awsAccountId}:${getSnsAlertTopicName(
    deploymentTag
  )}`;

export const getSourcesBucketName = (deploymentTag: string) =>
  `envkey-sources-${deploymentTag}`;

export const getFailoverBucketName = (deploymentTag: string) =>
  `envkey-in-region-code-${deploymentTag}`;

export const getSecondaryFailoverBucketName = (deploymentTag: string) =>
  `envkey-secondary-code-${deploymentTag}`;

export const getEcrRepoName = (deploymentTag: string) =>
  `envkey-api-${deploymentTag}`;

export const getCodebuildRoleName = (deploymentTag: string) =>
  `envkey-codebuild-role-${deploymentTag}`;
export const getCodebuildInstallLink = (
  deploymentTag: string,
  primaryRegion: string,
  awsAccountId: string
) =>
  `https://console.aws.amazon.com/codesuite/codebuild/${awsAccountId}/projects/${codebuildProjectNames.initialInstall(
    deploymentTag
  )}/history?region=${primaryRegion}`;

export const getCodebuildUpdateLink = (
  deploymentTag: string,
  primaryRegion: string,
  awsAccountId: string
) =>
  `https://console.aws.amazon.com/codesuite/codebuild/${awsAccountId}/projects/${codebuildProjectNames.updater(
    deploymentTag
  )}/history?region=${primaryRegion}`;

// the secret value is json of type `OptionalAwsCreds`
export const getS3CredsSecretName = (deploymentTag: string) =>
  `envkey-s3-releases-creds-${deploymentTag}`;
