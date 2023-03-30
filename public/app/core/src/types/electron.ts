import Client from "./client";

export type ClientUpgrade = {
  currentVersion: string | false;
  nextVersion: string;
  notes: Record<string, string>;
};

export type AvailableClientUpgrade = {
  desktop?: ClientUpgrade;
  cli?: ClientUpgrade;
  envkeysource?: ClientUpgrade;
};

export type ClientUpgradeProgress = {
  downloadedBytes: number;
  totalBytes: number;
};

export interface ElectronWindow extends Window {
  electron: {
    chooseFilePath: (
      title: string,
      defaultPath: string
    ) => Promise<string | undefined>;

    chooseFile: (
      message?: string,
      filters?: { extensions: string[]; name: string }[]
    ) => Promise<string | undefined>;

    chooseDir: (message?: string) => Promise<string | undefined>;

    quit: () => void;

    registerUpgradeAvailableHandler: (
      handler: (available: AvailableClientUpgrade) => void
    ) => void;

    registerUpgradeProgressHandler: (
      handler: (progress: ClientUpgradeProgress) => void
    ) => void;

    registerUpgradeCompleteHandler: (handler: () => void) => void;

    registerUpgradeErrorHandler: (handler: () => void) => void;

    downloadAndInstallUpgrades: () => void;

    restartWithLatestVersion: () => void;

    openStripeForm: (params: Client.CloudBillingStripeFormParams) => void;

    closeStripeForm: () => void;

    registerCloseStripeFormHandler: (handler: () => void) => void;

    deregisterCloseStripeFormHandler: (handler: () => void) => void;

    uiLogger: (batch: { msg: string; obj?: any }[]) => void;

    reportError: (msg: string, userId: string, email: string) => void;
  };
}
