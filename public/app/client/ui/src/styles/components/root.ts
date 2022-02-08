import { style } from "typestyle";

export const Root = style({
  width: "100%",
  height: "100%",
  background: "#fff",
  $nest: {
    "#content": {
      width: "100%",
      height: "100%",
      background: "#fff",
    },
  },
});
