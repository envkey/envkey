import { style } from "typestyle";
import * as colors from "../../colors";
import * as fonts from "../../fonts";
import { important } from "csx";
import { HomeContainerForm } from "./home_container";
import { imgLink } from "../../mixins";

export const Unlock =
  HomeContainerForm +
  " " +
  style({
    $nest: {
      h3: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "18px",
      },
      "h3 > svg": {
        width: 20,
        height: 20,
        fill: colors.LIGHTEST_BLUE,
        marginRight: 8,
      },
      "h3 > strong": {
        marginLeft: 6,
        marginRight: 6,
        color: important(colors.LIGHTEST_BLUE),
        textTransform: "uppercase",
        fontWeight: 600,
        fontFamily: fonts.CONDENSED,
        fontSize: "20px",
      },
      "p.error": {
        marginTop: 40,
        marginBottom: 0,
      },
      ".forgot-passphrase": {
        width: 500,
        marginTop: 50,
        paddingTop: 40,
        borderTop: "1px solid #000",
        textAlign: "center",
        $nest: {
          h4: {
            color: "rgba(255,255,255,0.6)",
            fontSize: "16px",
            marginBottom: 30,
          },
          ".actions": {
            display: "flex",
            justifyContent: "center",
          },

          a: imgLink({ bgMode: "dark", fontSize: "14px" }),
        },
      },
    },
  });
