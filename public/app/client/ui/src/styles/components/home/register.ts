import { multi } from "./../../helpers";
import { style } from "typestyle";
import * as colors from "../../colors";
import * as fonts from "../../fonts";
import { HomeContainerForm } from "./home_container";

export const Register =
  HomeContainerForm +
  " " +
  style({
    $nest: {
      "div > span": {
        color: "#aaa",
      },
      "div > span strong": {
        color: "#bbb",
      },

      "&.choose-host .radio-options": {
        marginBottom: 10,
      },

      ".deploy-self-hosted-status": {
        $nest: {
          p: {
            textAlign: "center",
          },
          ".small-loader": {
            width: 35,
            height: 35,
            $nest: {
              ...multi(["&", "rect", "path"], {
                fill: "rgba(255,255,255,0.6)",
              }),
            },
          },
        },
      },
    },
  });
