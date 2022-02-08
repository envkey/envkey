import { style } from "typestyle";
import * as colors from "../../colors";
import * as fonts from "../../fonts";
import { HomeContainerForm } from "./home_container";

export const LockSetPassphrase =
  HomeContainerForm +
  " " +
  style({
    $nest: {
      ".field p.error": {
        marginBottom: 0,
      },
    },
  });
