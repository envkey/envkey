import { Api } from "@core/types";

// default env
export const env = (<any>process.env) as Api.Env;

export const ensureEnv = <T extends Api.Env>(...addKeys: (keyof T)[]) => {
  for (let k of <const>[
    "NODE_ENV",
    "SENDER_EMAIL",
    "DATABASE_HOST",
    "DATABASE_NAME",
    "DATABASE_CREDENTIALS_JSON",
    ...addKeys,
  ]) {
    if ((env as any)[k] === undefined) {
      const msg = `${k} environment variable is required`;
      console.log(msg);
      throw new Error(msg);
    }
  }
};

export const getApiFullBaseUrl = (): string => {
  return `https://${env.SUBDOMAIN ? env.SUBDOMAIN + "." : ""}${env.DOMAIN}`;
};
