import * as layout from "../layout";
import { style } from "typestyle";
import * as colors from "../colors";
import { Modal } from "./modal";
import { OrgContainer } from "./org_container";
import { multi } from "../helpers";
import { button } from "./../mixins/buttons";
import { deepMergeStyles } from "./../helpers";
import { color } from "csx";

export const ClientUpgradesAvailable =
  OrgContainer +
  " " +
  Modal +
  " " +
  style({
    $nest: {
      ".modal": {
        height: "90%",
        display: "flex",
        flexDirection: "column",
        minWidth: 700,
        maxWidth: 1200,
        width: "90%",
      },

      p: {
        textAlign: "center",
        width: "100%",
      },

      "p:not(:last-of-type)": {
        marginBottom: 15,
      },

      ".versions": {
        display: "flex",
        justifyContent: "center",
        $nest: {
          p: {
            textAlign: "center",
            width: "50%",
            padding: "0 20px",
          },
        },
      },

      ".changelog": {
        background: "rgba(0,0,0,0.05)",
        overflow: "auto",
        marginBottom: 30,
        padding: 20,
        flex: 1,
        $nest: {
          "> div": {
            marginBottom: 10,
            display: "flex",

            $nest: {
              label: {
                width: 40,
                color: colors.DARKER_BLUE,
                marginRight: 15,
                fontWeight: 500,
              },

              p: {
                textAlign: "left",
                width: "auto",
                margin: 0,
              },

              "p:last-of-type": {
                marginBottom: 0,
              },
            },
          },

          ".note": {
            $nest: {
              ul: {
                listStyle: "inside",
              },
              "*": {
                fontSize: "16px",
              },
            },
          },
        },
      },

      ".project-changelogs": {
        width: "100%",
        display: "flex",
        height: "calc(100% - 142px)",
        $nest: {
          "> div": {
            display: "flex",
            flexDirection: "column",
            flex: 1,
          },
          "> div:not(:last-of-type)": {
            marginRight: 10,
          },
          h5: {
            background: colors.LIGHT_BLUE,
            margin: 0,
            $nest: {
              small: {
                fontSize: "14px",
                fontWeight: 400,
                color: "rgba(0,0,0,0.5)",
              },
              "small > strong": {
                color: "rgba(255,255,255,0.8)",
                fontWeight: 600,
                marginLeft: 5,
              },
              "small > span.sep": {
                color: "rgba(0,0,0,0.2)",
              },
            },
          },
        },
      },

      ".buttons": {
        marginLeft: "auto",
        marginRight: "auto",
        width: 600,
      },
    },
  });

export const ClientUpgradeStatus = style({
  position: "fixed",
  background: color(colors.DARKER_BLUE).darken(0.15).toHexString(),
  width: "100%",
  display: "flex",
  alignItems: "center",
  padding: "0 30px",
  bottom: 0,
  overflow: "hidden",
  height: layout.DEFAULT_PENDING_FOOTER_HEIGHT,
  $nest: {
    label: {
      color: "#fff",
      marginRight: 20,
      fontSize: "18px",
      fontWeight: 500,
    },
    button: deepMergeStyles(button(), {
      fontSize: "17px",
      padding: "5px 75px",
      background: colors.DARK_BLUE,
      color: "#fff",
      $nest: {
        "&:hover": {
          background: color(colors.DARK_BLUE).lighten(0.05).toHexString(),
          color: "#fff",
        },
      },
    }),
    ".progress": {
      backgroundColor: "rgba(255,255,255,0.125)",
      height: 30,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      width: "calc(100% - 200px)",
      $nest: {
        "svg.small-loader": {
          zIndex: 1,
          $nest: {
            ...multi(["&", "rect", "path"], {
              fill: "#fff",
            }),
          },
        },
        ".bar": {
          height: 30,
          backgroundColor: "rgba(255,255,255,0.5)",
          transition: "width .2s linear",
          position: "absolute",
          left: 0,
        },
      },
    },
  },
});
