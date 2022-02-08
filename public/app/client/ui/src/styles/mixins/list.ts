import { types } from "typestyle";
import * as colors from "../colors";
import * as fonts from "../fonts";
import { multi } from "../helpers";
import { color } from "csx";
import { actionRow } from "./actions";

export const listItem = (): types.NestedCSSProperties => ({
  background: "rgba(0,0,0,0.07)",
  marginBottom: 20,
  padding: 15,
  position: "relative",

  $nest: {
    "&.indent": {
      marginLeft: 25,
    },
    "&.toggle-item .title": {
      paddingLeft: 19,
    },
    "> div": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      $nest: {
        "&:first-of-type:not(:last-of-type)": {
          marginBottom: 10,
        },
      },
    },
    ".sep": {
      color: "rgba(0,0,0,0.2)",
      margin: "0 5px",
    },
    ".title": {
      color: colors.DARK_TEXT,
      fontWeight: 500,
      fontSize: "15.5px",
      marginBottom: 3,
      paddingBottom: 2,
      $nest: {
        a: {
          color: colors.DARKER_BLUE,
        },
        "a:hover": {
          borderBottom: `1px solid ${colors.DARKER_BLUE}`,
        },
        ".toggle": {
          cursor: "pointer",
          justifyContent: "center",
          paddingLeft: 15,
          paddingTop: 15,
          paddingBottom: 5,
          paddingRight: 4,
          position: "absolute",
          top: 0,
          left: 0,
          $nest: {
            svg: {
              width: 12,
              height: 12,
              fill: "rgba(0,0,0,0.3)",
            },
            "&.expanded svg": {
              transform: "rotate(180deg)",
            },
            "&.collapsed svg": {
              transform: "rotate(90deg)",
            },
            "&:hover svg": {
              fill: "rgba(0,0,0,0.6)",
            },
          },
        },
      },
    },
    ".subtitle": {
      color: "rgba(0,0,0,0.6)",
      fontSize: "13.5px",
      $nest: {
        "&.error": {
          color: "#fff",
          padding: "2px 6px",
        },
      },
    },
    ...multi([".role", ".connections", ".locals-link"], {
      $nest: {
        ...multi(["&", "& *"], {
          color: "rgba(0,0,0,0.5)",
          fontWeight: 400,
          fontSize: "14px",
          fontFamily: fonts.CONDENSED,
          textTransform: "uppercase",
          $nest: {
            "& a": {
              color: colors.ORANGE,
              cursor: "pointer",
              $nest: {
                "&:hover": {
                  paddingBottom: 2,
                  borderBottom: `1px solid ${colors.ORANGE}`,
                },
              },
            },
            "& strong": {
              color: colors.LIGHT_BLUE,
            },

            "&.locals-link a": {
              color: colors.DARKER_BLUE,
              $nest: {
                "&:hover": {
                  borderBottom: `1px solid ${colors.DARKER_BLUE}`,
                },
              },
            },
          },
        }),
      },
    }),
    ".apps": {
      fontWeight: 500,
      fontSize: "14px",
      color: "rgba(0,0,0,0.8)",
    },
    ".timestamp": {
      fontSize: "14px",
      color: "rgba(0,0,0,0.6)",
    },
    ".access": {
      display: "flex",
      alignItems: "center",
    },
    ".envkey": {
      fontFamily: fonts.CODE,
      fontSize: "15px",
      $nest: {
        small: {
          color: "rgba(0,0,0,0.6)",
          fontWeight: 500,
          marginLeft: 15,
          fontSize: "14px",
        },
      },
    },
    ".actions": actionRow(),
  },
});
