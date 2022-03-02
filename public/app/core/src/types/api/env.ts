export type Env = {
  NODE_ENV: "production" | "development";

  SENDER_EMAIL: string;

  DISABLE_DB_MIGRATIONS?: string;

  DATABASE_HOST: string;
  DATABASE_PORT?: string;
  DATABASE_NAME: string;
  // '{"user": "root", "password": ""}'
  DATABASE_CREDENTIALS_JSON: string;

  SOCKET_CLUSTER_AUTH?: string;

  EMAILS_PER_SECOND?: string;

  API_VERSION_NUMBER?: string;
  INFRA_VERSION_NUMBER?: string;
  DEPLOYMENT_TAG?: string;

  FAILOVER_SIGNING_PUBKEY?: string;
  FAILOVER_BUCKET?: string;
  LOGS_BUCKET?: string;
  FAILOVER_LOGS_INTERVAL?: string;

  IS_CLOUD?: boolean;
  IS_ENTERPRISE?: boolean;

  COMMUNITY_AUTH_HASH?: string;

  EXPRESS_PORT?: string;
  SOCKET_PORT?: string;
  CLUSTER_PORT?: string;

  EMAIL_TOKEN_EXPIRATION_MS?: string;
  EXTERNAL_AUTH_SESSION_EXPIRATION_MS?: string;

  REGISTER_ACTION_JSON?: string;
  INIT_INSTRUCTIONS_JSON?: string;

  // deployed app subdomain part like "am3bk2z0pd3"
  SUBDOMAIN?: string;
  // deployed app domain part like "quite-secure.com"
  DOMAIN?: string;

  // Choose either SES (enterprise) or nodemailer config below

  // '{ accessKeyId: string, secretAccessKey: string }
  SES_SMTP_CREDENTIALS_JSON?: string;

  // See nodemailer SMTP JSON object https://nodemailer.com/smtp/
  SMTP_TRANSPORT_JSON?: string;

  API_TARGET_RAM_UTILIZATION?: string;
};
