import { style } from "typestyle";
import * as colors from "../../colors";
import * as fonts from "../../fonts";
import { HomeContainerForm } from "./home_container";

export const RedeemRecoveryKey =
  HomeContainerForm +
  " " +
  style({
    $nest: {
      textarea: {
        width: "100%",
        height: 75,
        textAlign: "center",
      },
      "p.important": {
        marginTop: 30,
        marginBottom: 0,
        $nest: {
          a: {
            color: "#fff",
            fontWeight: 500,
            textDecoration: "underline",
          },
        },
      },
    },
  });
