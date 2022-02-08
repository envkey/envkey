export type BaseArgs = {
  $0: string;
  silent?: boolean;
  account?: string;
  org?: string;
  "cli-envkey"?: string;
  json?: boolean;
  verbose?: boolean;
  detectedApp?: DetectedApp;
};

export type DetectedApp = {
  appId: string;
  accountId: string;
  orgName: string;
  appName: string;
  dotenvFile: string | undefined;
  dotenvkeyFile: string | undefined;
  foundEnvkey: string | undefined;
  envkeyFromEnvironment: boolean;
  environmentId: string | undefined;
  localKeyId: string | undefined;
};
