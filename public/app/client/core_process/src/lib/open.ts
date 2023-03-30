import open from "open";

export const openExternalUrl = (url: string) => {
  open(url, { newInstance: true });
};
