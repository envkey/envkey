import { style } from "typestyle";
import * as colors from "../colors";
import * as fonts from "../fonts";
import * as layout from "../layout";
import { deepMergeStyles, multi } from "../helpers";
import { tertiaryButton } from "../mixins";

export const Logs = style({
  width: "100%",
  display: "flex",
  flexDirection: "row",
  margin: 0,
  paddingLeft: layout.SUB_SIDEBAR_FILTERS_WIDTH,

  $nest: {
    ".logs": {
      width: "100%",
      padding: 25,
    },
    ".summary": {
      width: `calc(100% - ${
        layout.SIDEBAR_WIDTH + layout.SUB_SIDEBAR_FILTERS_WIDTH + 50
      }px)`,
      background: "#fff",
      height: 65,
      borderBottom: "1px solid rgba(0,0,0,0.1)",
      position: "fixed",
      top: layout.MAIN_HEADER_HEIGHT,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      zIndex: 2,
      $nest: {
        button: deepMergeStyles(tertiaryButton({ bgMode: "light" }), {
          fontSize: "16px",
          padding: "5px 10px",
        }),
      },
    },
    "svg.small-loader": {
      $nest: {
        ...multi(["&", "rect", "path"], {
          fill: colors.DARK_BLUE,
        }),
      },
    },
    ".list": {
      paddingTop: 55,
      width: "100%",
    },
    ".transaction": {
      width: "100%",
      background: "rgba(0,0,0,0.07)",
      marginBottom: 20,
      $nest: {
        label: {
          fontFamily: fonts.CONDENSED,
          fontSize: "14px",
          fontWeight: 500,
          textTransform: "uppercase",
          color: "rgba(0,0,0,0.45)",
          marginRight: 15,
          width: 40,
          textAlign: "right",
        },
      },
    },

    ".transaction-summary": {
      $nest: {
        "> div": {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 10px",
          minHeight: 45,
          borderBottom: "1px solid rgba(0,0,0,0.075)",

          $nest: {
            ...multi(["a", "span"], {
              fontSize: "14px",
              display: "inline-flex",
              alignItems: "center",
            }),

            ...multi([".actor", ".device-or-envkey"], {
              width: "60%",
            }),

            ...multi([".ip", ".date"], {
              width: "40%",
            }),

            ".user": {
              fontWeight: 500,
            },

            "a.user": {
              color: colors.DARK_BLUE,
              padding: "1px 0",
              borderTop: "1px solid transparent",
              borderBottom: "1px solid transparent",
              $nest: {
                "&:hover": {
                  borderBottom: `1px solid ${colors.DARK_BLUE}`,
                },
              },
            },

            small: {
              marginLeft: 7,
              fontSize: "13px",
              color: "rgba(0,0,0,0.5)",
            },

            "small.removed": {
              fontSize: "12.5px",
              textTransform: "uppercase",
              padding: "2px 6px",
              background: "rgba(0,0,0,0.08)",
            },
          },
        },
      },
    },

    ".action": {
      $nest: {
        "& > div": {
          padding: "0 10px",
          height: 45,
          display: "flex",
          alignItems: "center",
        },

        "&:not(:last-of-type)": {
          borderBottom: "1px solid rgba(0,0,0,0.1)",
        },
        ".action-type": {
          background: "rgba(0,0,0,0.4)",
          fontFamily: fonts.CODE,
          fontSize: "13px",
          color: "#fff",
          fontWeight: 600,
          padding: "4px 6px 2px",
        },
        ".action-summary": {
          fontSize: "14px",
          margin: 0,
          padding: "0 10px 10px 0",
          paddingLeft: 65,
          $nest: {
            ...multi([".actor", "strong", "span.object"], {
              fontWeight: 500,
            }),
            "a.object": {
              color: colors.DARK_BLUE,
              fontWeight: 500,
              borderTop: "1px solid transparent",
              borderBottom: "1px solid transparent",
              padding: "1px 0",
              $nest: {
                "&:hover": {
                  borderBottom: `1px solid ${colors.DARK_BLUE}`,
                },
              },
            },
          },
        },

        ".log-envs-updated": {
          paddingLeft: 65,
          height: "auto",
          display: "block",
          paddingBottom: 10,
          $nest: {
            ".envs-updated-summary": {
              cursor: "pointer",
              fontSize: "13.5px",
              padding: "1px 0",
              display: "inline-flex",
              alignItems: "center",
              borderTop: "1px solid transparent",
              borderBottom: "1px solid transparent",
              $nest: {
                "svg.triangle": {
                  width: 10,
                  height: 10,
                  marginRight: 3,
                  transform: "rotate(90deg)",
                  fill: "rgba(0,0,0,0.3)",
                },

                ".actor": {
                  fontWeight: 500,
                  marginRight: 3,
                },

                "&:hover": {
                  borderBottom: `1px solid rgba(0,0,0,0.15)`,
                  $nest: {
                    "svg.triangle": {
                      fill: "rgba(0,0,0,0.5)",
                    },
                  },
                },

                "&.expanded svg.triangle": {
                  transform: "rotate(180deg)",
                },
              },
            },

            ".envs-updated-list": {
              $nest: {
                ".env-parent": {
                  display: "flex",
                  alignItems: "center",
                  border: "1px solid rgba(0,0,0,0.1)",
                  marginTop: 10,
                  // background: "rgba(0,0,0,0.075)",
                },
                ".env-parent > span": {
                  display: "inline-block",
                  padding: 10,

                  fontSize: "13.5px",
                  fontWeight: 500,
                  color: "rgba(0,0,0,0.55)",
                  width: "38.196%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  textAlign: "left",
                },

                ".environments": {
                  width: `${100 - 38.196}%`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  flexBasis: "100%",
                  flexWrap: "wrap",
                  borderLeft: "1px solid rgba(0,0,0,0.1)",
                  padding: 10,
                },

                ".environments > span": {
                  fontSize: "13px",
                  fontFamily: fonts.CONDENSED,
                  color: "#fff",
                  background: colors.DARK_BLUE,
                  textTransform: "uppercase",
                  fontWeight: 500,
                  padding: "4px 6px",
                  margin: "2px 7.5px 2px 0",
                  whiteSpace: "nowrap",

                  $nest: {
                    "&.sub": {
                      background: colors.LIGHT_BLUE,
                    },
                    "&.locals": {
                      background: colors.LIGHT_BLUE,
                    },
                  },
                },
              },
            },

            ".environments": {
              paddingLeft: 10,
            },
          },
        },
      },
    },
  },
});
