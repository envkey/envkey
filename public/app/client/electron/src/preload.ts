import { contextBridge, remote, ipcRenderer } from "electron";
import {
  ElectronWindow,
  AvailableClientUpgrade,
  UpgradeProgress,
} from "@core/types/electron";

const { dialog, app } = remote;

let progressHandler:
  | ((event: any, progress: UpgradeProgress) => void)
  | undefined;

const exposeInterface: ElectronWindow["electron"] = {
  chooseFilePath: async (title, defaultPath) => {
    const { filePath } = await dialog.showSaveDialog({
      title,
      defaultPath,
    });
    return filePath;
  },

  chooseFile: async (message, filters) => {
    const { filePaths } = await dialog.showOpenDialog({
      message,
      filters,
    });
    if (filePaths.length == 1) {
      return filePaths[0];
    }
    return undefined;
  },

  chooseDir: async (message) => {
    const { filePaths } = await dialog.showOpenDialog({
      message,
      properties: ["openDirectory"],
    });
    if (filePaths.length == 1) {
      return filePaths[0];
    }
    return undefined;
  },

  quit: () => app.quit(),

  registerUpgradeAvailableHandler: (handler) =>
    ipcRenderer.on("upgrade-available", (event, available) => {
      console.log("on upgrade-available", available);

      handler(available as AvailableClientUpgrade);
    }),

  registerUpgradeProgressHandler: (handler) => {
    if (progressHandler) {
      ipcRenderer.off("upgrade-progress", progressHandler);
    }

    progressHandler = (event, progress) => {
      console.log("on upgrade-progress", progress);
      handler(progress as UpgradeProgress);
    };

    ipcRenderer.on("upgrade-progress", progressHandler);
  },

  registerUpgradeCompleteHandler: (handler) =>
    ipcRenderer.on("upgrade-complete", (event) => {
      console.log("on upgrade-complete");

      handler();
    }),

  registerUpgradeErrorHandler: (handler) =>
    ipcRenderer.on("upgrade-error", (event) => {
      console.log("on upgrade-error");

      handler();
    }),

  downloadAndInstallUpgrades: () => ipcRenderer.send("install-update"),
};

contextBridge.exposeInMainWorld("electron", exposeInterface);
