import { style } from "typestyle";
import { multi } from "../helpers";
import * as colors from "../colors";
import * as fonts from "../fonts";
import { color } from "csx";
import * as layout from "../layout";
import { OrgContainer } from "./org_container";
import { Modal } from "./modal";

export const Diffs = style({
  $nest: {
    h4: {
      padding: 0,
      paddingLeft: 15,
    },

    ".env-parent:not(:first-of-type)": {
      marginTop: 30,
    },

    ".env-parent h4": {
      height: layout.ENV_LABEL_ROW_HEIGHT,
      background: colors.DARKER_BLUE,
      $nest: {
        "> span": {
          fontFamily: fonts.CONDENSED,
          color: "rgba(0,0,0,0.5)",
          fontSize: "14px",
          textTransform: "uppercase",
        },
      },
    },

    ".environment": {
      marginLeft: 15,
    },

    ".environment:first-of-type": {
      marginTop: 10,
    },

    ".environment:not(:first-of-type)": {
      marginTop: 20,
    },

    ".environment h4": {
      height: layout.ENV_LABEL_ROW_HEIGHT,
      fontSize: "14px",
      background: colors.DARK_BG,
      marginBottom: 0,
      $nest: {
        "> span": {
          color: "rgba(255,255,255,0.6)",
        },
      },
    },

    ".key-change": {
      marginLeft: 20,
      marginTop: 20,

      $nest: {
        "&:not(.conflict) h4 .small-loader": {
          $nest: multi(["&", "rect", "path"], {
            fill: "rgba(0,0,0,0.7)",
          }),
        },
      },
    },
  },
});

export const KeyChange = style({
  background: "rgba(0,0,0,0.07)",
  borderBottom: "1px solid rgba(0,0,0,0.1)",
  $nest: {
    h4: {
      height: layout.ENV_LABEL_ROW_HEIGHT,
      marginBottom: 0,
      paddingRight: layout.ENV_LABEL_ROW_BUTTON_WIDTH + 20,
      $nest: {
        label: {
          fontFamily: fonts.CODE,
          fontSize: "15px",
          background: "rgba(0,0,0,0.3)",
          color: "#fff",
          padding: "3.5px 10px 0 10px",
          height: "100%",
          display: "flex",
          alignItems: "center",
        },
      },
    },

    "&:not(.conflict) h4": {
      background: "rgba(0,0,0,0.125)",
      $nest: {
        "> span": {
          color: "rgba(0,0,0,0.5)",
        },
        "svg.right-caret": {
          fill: "rgba(0,0,0,0.15)",
        },
        ".actions > span": {
          borderLeft: "1px solid rgba(0,0,0,0.1)",
          $nest: {
            svg: {
              fill: "rgba(0,0,0,0.25)",
            },
          },
        },
        ".actions > span:hover": {
          $nest: {
            svg: {
              fill: "rgba(0,0,0,0.5)",
            },
          },
        },
      },
    },

    "&.conflict h4": {
      background: color(colors.RED).fadeOut(0.1).toString(),
      $nest: {
        label: {
          color: "rgba(255,255,255,0.9)",
        },
        "> span": {
          color: "rgba(0,0,0,0.7)",
        },
        "svg.right-caret": {
          fill: "rgba(0,0,0,0.15)",
        },
      },
    },

    ".change": {
      $nest: {
        "> div": {
          height: layout.ENV_ROW_HEIGHT,
          display: "flex",
          borderBottom: "1px solid rgba(0,0,0,0.1)",

          $nest: {
            "&:last-of-type": {
              borderBottom: "none",
            },

            "> label": {
              fontFamily: fonts.CONDENSED,
              fontSize: "13.5px",
              fontWeight: 600,
              textTransform: "uppercase",
              color: "rgba(0,0,0,0.5)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderLeft: "1px solid rgba(0,0,0,0.1)",
              width: 90,
              height: "100%",
              borderRight: "1px solid rgba(0,0,0,0.1)",
            },

            "> span": {
              width: "calc(100% - 90px)",
              display: "inline-flex",
              height: "100%",
              alignItems: "center",
              justifyContent: "center",
              background: "#fff",
              borderRight: "1px solid rgba(0,0,0,0.1)",
              whiteSpace: "nowrap",
              $nest: {
                span: {
                  position: "relative",
                },
                "*": {
                  fontFamily: fonts.CODE,
                  fontSize: "14px",
                  color: color(colors.DARK_TEXT).fadeOut(0.3).toString(),
                },
                ".special > span": {
                  top: 2,
                },
                ".special *": {
                  fontFamily: fonts.MAIN,
                  color: "rgba(0,0,0,0.45)",

                  $nest: {
                    label: {
                      textTransform: "lowercase",
                      color: colors.DARK_BLUE,
                      fontWeight: 500,
                      marginLeft: 5,
                    },
                  },
                },
                "> span": {
                  maxWidth: "90%",
                },
                "> span > span": {
                  width: "auto",
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "inline-block",
                  userSelect: "all",
                  top: 5,
                },
              },
            },

            "&.update > span > span:not(.special) *": {
              color: colors.DARK_TEXT,
            },

            ".strikethrough": {
              display: "block",
              width: "calc(100% + 10px)",
              position: "absolute",
              height: 1,
              background: color(colors.DARK_TEXT).lighten(0.2).toHexString(),
              left: "-5px",
              top: "47.5%",
              transform: "translateY(-50%)",
            },
          },
        },

        ".set-by": {
          $nest: {
            "> span > span": {
              top: 0,
            },
            "> span *": {
              fontFamily: fonts.MAIN,
              color: "rgba(0,0,0,0.5)",
            },
            strong: {
              color: colors.DARK_BLUE,
            },
            ".sep": {
              margin: "0 5px",
              color: "rgba(0,0,0,0.2)",
            },
          },
        },
      },
    },
  },
});

export const DiffsModal =
  OrgContainer +
  " " +
  Diffs +
  " " +
  Modal +
  " " +
  style({
    $nest: {
      ".modal": {
        width: "70%",
        maxWidth: 800,
        minWidth: 700,
        height: "90%",
      },

      h3: {
        marginBottom: 20,
      },
    },
  });
