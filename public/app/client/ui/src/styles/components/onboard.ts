import { style } from "typestyle";
import { multi } from "../helpers";
import * as colors from "../colors";
import * as fonts from "../fonts";
import { color } from "csx";
import * as layout from "../layout";
import { OrgContainer } from "./org_container";

export const OnboardHelp =
  OrgContainer +
  " " +
  style({
    background: "#fff",
    border: `40px solid rgba(0,0,0,0.1)`,
    padding: 20,
    margin: 0,
    borderRadius: 0,
    position: "relative",
    width: "auto",
    $nest: {
      ".close": {
        position: "absolute",
        left: -40,
        top: -40,
        borderBottom: "1px solid rgba(0,0,0,0.1)",
        borderRight: "1px solid rgba(0,0,0,0.1)",
        cursor: "pointer",
        width: 40,
        height: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",

        $nest: {
          svg: {
            width: 12,
            height: 12,
            fill: "rgba(0,0,0,0.2)",
          },

          "&:hover": {
            background: "rgba(255,255,255,0.3)",
            $nest: {
              svg: {
                fill: "rgba(0,0,0,0.25)",
              },
            },
          },
        },
      },

      p: {
        width: "auto",
      },

      "p:last-of-type": {
        marginBottom: 0,
      },

      ".add-button": {
        display: "inline-flex",
        width: 30,
        height: 30,
        background: colors.DARK_BG,
        alignItems: "center",
        justifyContent: "center",
        margin: "0 2px",
        $nest: {
          svg: {
            fill: colors.LIGHT_ORANGE,
            width: 12,
            height: 12,
          },
        },
      },

      ".tab": {
        display: "inline-block",
        padding: "4px 8px",
        color: "#fff",
        background: colors.OFF_BLACK,
        fontSize: "14px",
        margin: "0 2px",
      },
    },
  });
