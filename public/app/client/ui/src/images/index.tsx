import React from "react";

const SvgComponents = {
  add: require("./add.svg").default,
  dash: require("./dash.svg").default,
  "down-caret": require("./down-caret.svg").default,
  "right-caret": require("./right-caret.svg").default,
  hide: require("./hide.svg").default,
  search: require("./search.svg").default,
  subenvs: require("./subenvs.svg").default,
  triangle: require("./triangle.svg").default,
  list: require("./list.svg").default,
  lock: require("./lock.svg").default,
  plane: require("./plane.svg").default,
  gear: require("./gear.svg").default,
  restore: require("./restore.svg").default,
  "x-circle": require("./x-circle.svg").default,
  x: require("./x.svg").default,
  reorder: require("./reorder.svg").default,
  "edit-circle": require("./edit-circle.svg").default,
  edit: require("./edit.svg").default,
  exit: require("./exit.svg").default,
  "envkey-logo": require("./envkey-logo.svg").default,
  "small-loader": require("./small-loader.svg").default,
  block: require("./block.svg").default,
  na: require("./na.svg").default,
  check: require("./check.svg").default,
  revert: require("./revert.svg").default,
  copy: require("./copy.svg").default,
  info: require("./info.svg").default,
  folder: require("./folder.svg").default,
  reset: require("./reset.svg").default,
  "powered-by-stripe": require("./powered-by-stripe.svg").default,
} as Record<string, React.FC<React.SVGProps<SVGSVGElement>>>;

const UseOwnDefaultViewBox = new Set<keyof typeof SvgComponents>([
  "list",
  "gear",
  "edit",
  "x",
  "subenvs",
  "na",
  "check",
  "revert",
  "copy",
  "info",
  "powered-by-stripe",
]);

type SvgComponentType = keyof typeof SvgComponents;

type SvgParams = {
  type: SvgComponentType;
  height?: number | string;
  width?: number | string;
  viewBox?: string;
};

export const SvgImage = (params: SvgParams) => {
  const SvgComponent = SvgComponents[params.type];

  return (
    <SvgComponent
      className={params.type}
      width={params.width ?? 100}
      height={params.height ?? 100}
      {...(params.viewBox || !UseOwnDefaultViewBox.has(params.type)
        ? { viewBox: params.viewBox ?? "0 0 100 100" }
        : {})}
    />
  );
};

export const EnvkeyLogo = (
  params: Omit<SvgParams, "type" | "viewBox" | "width" | "height"> & {
    scale?: number;
  }
) =>
  SvgImage({
    type: "envkey-logo",
    viewBox: "0 0 132 34",
    width: 132 * (params.scale ?? 1),
    height: 34 * (params.scale ?? 1),
    ...params,
  });

export const SmallLoader = (
  params: Omit<SvgParams, "type" | "viewBox" | "width" | "height"> & {
    scale?: number;
  }
) =>
  SvgImage({
    type: "small-loader",
    viewBox: "0 0 24 30",
    width: 24 * (params.scale ?? 1),
    height: 30 * (params.scale ?? 1),
    ...params,
  });
