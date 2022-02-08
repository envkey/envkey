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

export type UpgradeProgress = {
  clientProject: "desktop" | "cli" | "envkeysource";
  downloadedBytes: number;
  totalBytes: number;
};

export type ClientUpgradeProgress = {
  desktop?: UpgradeProgress;
  cli?: UpgradeProgress;
  envkeysource?: UpgradeProgress;
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
      handler: (progress: UpgradeProgress) => void
    ) => void;

    registerUpgradeCompleteHandler: (handler: () => void) => void;

    registerUpgradeErrorHandler: (handler: () => void) => void;

    downloadAndInstallUpgrades: () => void;
  };
}
