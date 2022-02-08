import { types } from "typestyle";

export const customSelect = (
  arrowColor: string,
  paddingRight: number
): types.NestedCSSProperties => ({
  position: "relative",
  $nest: {
    "> select": {
      appearance: "none",
      background: "none",
      border: "none",
      cursor: "pointer",
      width: "100%",
    },
    "> svg": {
      width: 10,
      height: 10,
      fill: arrowColor,
      pointerEvents: "none",
      position: "absolute",
      right: paddingRight,
      top: "calc(50% - 5px)",
    },
  },
});
