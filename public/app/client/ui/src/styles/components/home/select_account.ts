import { multi } from "../../helpers";
import { height } from "csstips";
import { style } from "typestyle";
import * as colors from "../../colors";
import * as fonts from "../../fonts";
import { backLink } from "../../mixins";

export const SelectAccount = style({
  $nest: {
    ".account": {
      width: "100%",
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      margin: "15px 0",
      color: "#fff",
      background: "rgba(255,255,255,0.02)",
      border: `1px solid rgba(255,255,255,0.2)`,
      fontSize: "14px",
      fontWeight: 400,
      position: "relative",
      $nest: {
        ...multi(["&", "& *"], {
          cursor: "pointer",
        }),
      },
    },
    ".account > span": {
      display: "flex",
      height: "100%",
      alignItems: "center",
    },
    ".remove": {
      borderRight: "1px solid rgba(255,255,255,0.2)",
      $nest: {
        a: {
          width: 120,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "30px 15px",
          color: "rgba(255,255,255,0.8)",
          fontSize: "13px",
          $nest: {
            "&:hover": {
              background: "#000",
              color: colors.LIGHTEST_BLUE,
              $nest: {
                svg: {
                  fill: "rgba(255,255,255,0.6)",
                },
              },
            },
          },
        },
        svg: {
          width: 20,
          height: 20,
          marginRight: 10,
          fill: "rgba(255,255,255,0.3)",
        },
      },
    },
    ".select": {
      textAlign: "left",
      display: "flex",
      justifyContent: "space-between",
      position: "absolute",
      top: 0,
      left: 120,
      width: "calc(100% - 120px)",
      height: "100%",
      padding: "0 20px",

      $nest: {
        svg: {
          marginLeft: 15,
          fill: "rgba(255,255,255,0.3)",
          $nest: {
            "&.right-caret": {
              width: 15,
              height: 15,
            },
          },
        },
        "svg > path": {
          fill: "rgba(255,255,255,0.3)",
        },
        "&:hover": {
          background: "#000",
          $nest: {
            ".org-name": {
              color: colors.LIGHTEST_BLUE,
            },
            ".provider": {
              color: "rgba(255,255,255,0.9)",
            },
            svg: {
              fill: "rgba(255,255,255,0.6)",
            },
            "svg > path": {
              fill: "rgba(255,255,255,0.6)",
            },
          },
        },
      },
    },
    label: {
      color: "#fff",
    },
    ".labels": {
      display: "flex",
      flexDirection: "column",
    },
    ".org-name": {
      textAlign: "left",
      fontWeight: 400,
      color: "rgba(255,255,255,0.9)",
    },
    ".provider": {
      color: "rgba(255,255,255,0.6)",
      fontSize: "13px",
      marginTop: 10,
    },

    ".pending-header": {
      marginTop: 30,
    },
  },
});
