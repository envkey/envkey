export type Env = {
  NODE_ENV?: "development" | "production";
  ENVKEY_CLOUD_PROD_HOST?: string;
  LOCAL_DEV_CLOUD_HOST?: string;
  ENVKEY_CORE_DISPATCH_DEBUG_ENABLED?: "1";

  // for local testing of upgrades (core_process check) for self-hosted
  ENVKEY_RELEASES_BUCKET?: string;
  ENVKEY_RELEASES_S3_CREDS_JSON?: string;
};

export const env = process.env as Env;

export const LOCAL_DEV_SELF_HOSTED_HOST =
  "localdev-self-hosted.envkey.com:2999";

const LOCAL_DEV_CLOUD_HOST =
  env.LOCAL_DEV_CLOUD_HOST ?? "localdev-cloud.envkey.com:2999";
const CLOUD_PROD_HOST = env.ENVKEY_CLOUD_PROD_HOST ?? "api-v2.envkey.com";

export const getDefaultApiHostUrl = () => {
  if (env.NODE_ENV == "development") {
    return LOCAL_DEV_CLOUD_HOST;
  }

  return CLOUD_PROD_HOST;
};
