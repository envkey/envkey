import open from "open";

export const openExternalUrl = (url: string) => {
  if (process.env.IS_ELECTRON) {
    const { shell } =
      typeof __non_webpack_require__ == "undefined"
        ? require("electron")
        : __non_webpack_require__("electron");
    shell.openExternal(url);
  } else {
    open(url, { newInstance: true });
  }
};
