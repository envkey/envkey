import { style } from "typestyle";
import * as colors from "../colors";
import * as fonts from "../fonts";
import * as layout from "../layout";
import { color } from "csx";
import { multi } from "../helpers";
import { OrgContainer } from "./org_container";

export const Versions = style({
  width: "100%",
  display: "flex",
  flexDirection: "row",
  margin: 0,
  paddingLeft: layout.SUB_SIDEBAR_FILTERS_WIDTH,
  $nest: {
    ".list": {
      flex: 1,
      padding: 25,
      maxWidth: "100%",

      $nest: {
        "svg.small-loader": {
          $nest: {
            ...multi(["&", "rect", "path"], {
              fill: colors.DARK_BLUE,
            }),
          },
        },
      },
    },

    ".changeset": {
      marginBottom: 20,
    },

    ".num": {
      fontSize: "15.5px",
      fontFamily: fonts.CONDENSED,
      fontWeight: 500,
      textTransform: "uppercase",
    },

    ".commit-info": {
      marginBottom: 1,
      $nest: {
        "> div": {
          display: "flex",
          justifyContent: "space-between",
          background: colors.DARK_BG,
          padding: "10px 15px",
        },
        ".num": {
          color: "rgba(255,255,255,0.9)",
        },
        ".sep": {
          fontSize: "14px",
          color: "rgba(255,255,255,0.3)",
          margin: "0 7px",
        },

        ".user": {
          fontSize: "14px",
          color: "rgba(255,255,255,0.75)",
          fontWeight: 500,
        },

        "a.user": {
          color: "rgba(255,255,255,0.9)",
          $nest: {
            "&:hover": {
              textDecoration: "underline",
            },
          },
        },

        ".created-at": {
          fontSize: "14px",
          color: "rgba(255,255,255,0.75)",
        },

        ".message": {
          fontSize: "14px",
          color: colors.DARK_TEXT,
          background: "rgba(0,0,0,0.075)",
          padding: 15,
          width: "100%",
          margin: 0,
        },
      },
    },

    ".version": {
      marginBottom: 1,
      background: "rgba(0,0,0,0.075)",
      padding: "15px 20px",
      position: "relative",
      $nest: {
        ".num": {
          color: colors.DARKER_BLUE,
        },

        ".changes": {
          margin: "15px 0",
        },

        ".key-change:not(:last-of-type)": {
          marginBottom: 20,
        },

        ".key-change h4": {
          padding: 0,
          height: layout.ENV_LABEL_ROW_HEIGHT,
          background: colors.DARKER_BLUE,
          $nest: {
            label: {
              background: "none",
            },
          },
        },

        ".title-row": {
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        },

        ".actions-tags": {
          display: "flex",
          alignItems: "center",
          $nest: {
            "& > *": {
              marginLeft: 15,
            },
          },
        },

        ".version-tag": {
          fontFamily: fonts.CONDENSED,
          textTransform: "uppercase",
          color: "#fff",
          fontSize: "13px",
          padding: "3px 6px",
          fontWeight: 500,
          background: colors.DARKER_BLUE,
          $nest: {
            "&.equals-pending": {
              background: colors.ORANGE,
            },
            "&.equals-current": { background: colors.DARK_BLUE },
          },
        },

        "button.revert": {
          background: "none",
          border: "none",
          borderBottom: `1px solid transparent`,
          padding: "2px 0",
          cursor: "pointer",

          $nest: {
            ...multi(["&", "& *"], {
              fontFamily: fonts.CONDENSED,
              textTransform: "uppercase",
              color: colors.DARKER_BLUE,
              fontSize: "13.5px",
            }),

            "svg.revert": {
              width: 15,
              height: 15,
              fill: colors.DARKER_BLUE,
              marginRight: 5,
              position: "relative",
              top: 2,
            },

            "&:hover": {
              borderBottom: `1px solid ${colors.DARKER_BLUE}`,
            },
          },
        },
      },
    },
  },
});
