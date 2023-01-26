process.env.IS_ELECTRON = "1";

import { initFileLogger, log } from "@core/lib/utils/logger";
import url from "url";
import { app, screen, BrowserWindow, Menu, MenuItem, ipcMain } from "electron";
import { Client } from "../../../core/src/types";
import { stopInlineCoreProcess } from "./core_proc";
import { terminateWorkerPool } from "@core/worker/start";
import path from "path";
import {
  runCheckUpgradesLoop,
  checkUpgrade,
  downloadAndInstallUpgrade,
  stopCheckUpgradesLoop,
} from "./app_upgrades";
import { startup } from "./startup";

// allows for self-signed certs on TLS requests in development
if (process.env.NODE_ENV != "production") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const indexHtml = require("./index.html").default;
const devIndexHtml = require("./index.dev.html").default;
const stripeFormHtml = require("./stripe_form.html").default;
const devStripeFormHtml = require("./stripe_form.dev.html").default;

let appReady = false;
let win: BrowserWindow | undefined;
let stripeWin: BrowserWindow | undefined;
let authToken: string | undefined;

let appWillAutoExit = false;

export const enableAppWillAutoExitFlag = () => {
  appWillAutoExit = true;
};

export const getWin = () => win;

// When the core process is started outside this desktop app, logs written
// from the desktop app don't work because the log file stream is already
// held open by the core process.
initFileLogger("desktop");

app.on("ready", () => {
  log("on:ready", { version: app.getVersion() });
  setupAppUpdateMenu();

  ipcMain.on("install-update", () => {
    downloadAndInstallUpgrade();
  });

  ipcMain.on("open-stripe-form", (e, json) => {
    if (stripeWin) stripeWin.close();
    createStripeWindow(json);
  });

  ipcMain.on("focus-main-window", () => {
    if (win) {
      win.show();
    }
  });

  createWindow();

  startup((authTokenRes) => {
    appReady = true;
    authToken = authTokenRes;
    loadUi().then(() => runCheckUpgradesLoop());
  });
});

// Quit when all windows are closed, except on Mac where closing window is expected to behave like minimizing
// on mac there's no way to create a new window via menu yet.
app.on("window-all-closed", () => {
  log("on:window-all-closed", {
    currentAppVersion: app.getVersion(),
  });
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async (e) => {
  if (!appWillAutoExit) {
    e.preventDefault();
  }
  log("on:before-quit", {
    currentAppVersion: app.getVersion(),
    appWillAutoExit,
  });
  try {
    log("Stopping check updates loop...");
    stopCheckUpgradesLoop();
    // if it's running inline, core process must be stopped before the worker pool, since the core process itself relies on workers.
    log("stopping core process if it's running inline...");
    stopInlineCoreProcess(async (stopped) => {
      if (stopped) {
        log("stopped inline core process.");
      } else {
        log("core process wasn't running inline.");
      }

      // manually terminating worker pool seems to cause more harm than good now.
      // at one point it had seemed necessary.
      // log("terminating worker pool...");
      // try {
      //   await terminateWorkerPool().catch((err) => {
      //     log(".catch error terminating worker pool", { err });
      //   });
      // } catch (err) {
      //   log("try/catch error terminating worker pool", { err });
      // }

      app.exit();
    });
  } catch (err) {
    log("before-exit cleanup failed", { err });
  }
  if (appWillAutoExit) {
    return;
  }
});

app.on("activate", () => {
  log("on:activate", {
    currentAppVersion: app.getVersion(),
  });
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (appReady && !win) {
    createWindow();
    loadUi();
  }
});

const createWindow = () => {
  // Create the browser window.
  const { width: screenW, height: screenH } =
    screen.getPrimaryDisplay().workAreaSize;

  win = new BrowserWindow({
    width: Math.min(1400, Math.floor(screenW * 0.95)),
    height: Math.min(800, Math.floor(screenH * 0.95)),
    minWidth: 850,
    minHeight: 650,
    center: true,
    backgroundColor: "#404040",
    title: "EnvKey " + app.getVersion(),
    icon: path.join.apply(this, [
      ...(process.env.ICON_DIR_FROM_ELECTRON_RESOURCES
        ? [process.resourcesPath, process.env.ICON_DIR_FROM_ELECTRON_RESOURCES]
        : [process.env.ICON_DIR!]),
      "64x64.png",
    ]),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: true,
      preload: path.join(app.getAppPath(), "preload.js"),
    },
  });

  win.loadURL(
    url.format({
      pathname: path.join(
        app.getAppPath(),
        process.env.NODE_ENV == "production" ? indexHtml : devIndexHtml
      ),
      protocol: "file:",
      slashes: true,
    })
  );

  win.on("page-title-updated", (e) => e.preventDefault());

  // Emitted when the window is closed.
  win.on("closed", () => {
    log("on:closed", {
      currentAppVersion: app.getVersion(),
    });
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    win = undefined;
  });
};

const loadUi = async () => {
  if (!(win && authToken)) {
    throw new Error("Cannot load EnvKey UI");
  }

  log("Setting User-Agent with OS keyring auth token");
  win.webContents.userAgent = `${Client.CORE_PROC_AGENT_NAME}|Electron|${authToken}`;
};

const setupAppUpdateMenu = () => {
  const menu = Menu.getApplicationMenu();
  if (!menu) {
    return;
  }

  const menuVersionInfo = new MenuItem({
    enabled: false,
    label: `v${app.getVersion()}`,
  });

  const menuCheckAppUpdate = new MenuItem({
    label: "Check for Updates",
    click: () => checkUpgrade(true),
  });

  // const switchAccount = new MenuItem({
  //   label: "Switch Account",
  //   click: () => win?.loadURL("http://localhost:19047/envkey-ui#/select-account"),
  // })

  // Add all items in order to the first menu. On mac, that's the "EnvKey" menu, on other
  // platforms it's the File menu.
  menu.items?.[0].submenu?.insert(1, menuVersionInfo);
  menu.items?.[0].submenu?.insert(2, menuCheckAppUpdate);
  // menu.items?.[0].submenu?.insert(4, switchAccount);

  Menu.setApplicationMenu(menu);
};

const createStripeWindow = (json: string) => {
  const { width: screenW, height: screenH } =
    screen.getPrimaryDisplay().workAreaSize;
  const type = JSON.parse(decodeURIComponent(json)).type;
  const qs = `?data=${json}`;

  stripeWin = new BrowserWindow({
    width: 650,
    height: 450,
    parent: win,
    alwaysOnTop: true,
    center: true,
    title: "EnvKey " + app.getVersion() + " Payment Method",
    webPreferences: {
      nodeIntegration: false,
    },
  });

  stripeWin.on("page-title-updated", (e) => e.preventDefault());

  stripeWin.loadURL(
    url.format({
      pathname: path.join(
        app.getAppPath(),
        process.env.NODE_ENV == "production"
          ? stripeFormHtml
          : devStripeFormHtml
      ),
      protocol: "file:",
      slashes: true,
      search: qs,
    })
  );

  stripeWin.on("closed", () => {
    if (win) win.webContents.send("close-stripe-form");
    stripeWin = undefined;
  });
};

["SIGINT", "SIGUSR1", "SIGUSR2", "SIGTERM", "SIGHUP"].forEach((eventType) => {
  process.on(eventType, () => {
    log(`EnvKey Electron exiting due to ${eventType}.`);
    if (app) {
      app.quit();
    }
  });
});

process.on("unhandledRejection", (reason, promise) => {
  log(`EnvKey Electron unhandledRejection.`, { reason });

  if (
    (reason as any)?.message?.startsWith(
      "Workerpool Worker terminated Unexpectedly"
    )
  ) {
    log(`Exiting due to uncaught workerpool error.`);
    if (app) {
      app.quit();
    }
  }
});

process.on("uncaughtException", (err) => {
  log(`EnvKey Electron uncaughtException.`, { err });

  log(`Exiting due to uncaughtException.`);
  if (app) {
    app.quit();
  }
});
