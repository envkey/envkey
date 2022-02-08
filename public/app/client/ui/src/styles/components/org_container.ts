import { style } from "typestyle";
import * as colors from "../colors";
import * as fonts from "../fonts";
import { deepMergeStyles, multi } from "../helpers";
import { baseContainer, listItem, modalLink } from "../mixins";
import { color } from "csx";

export const OrgContainer = style(
  deepMergeStyles(
    {
      ...baseContainer({ width: 500, bgMode: "light", hAlign: "start" }),
      margin: 30,
    },
    {
      $nest: {
        h3: {
          marginBottom: 30,
          fontSize: "18px",
          color: "rgba(255,255,255,0.9)",
          fontWeight: 300,
          padding: 12,
          background: "rgba(0,0,0,0.9)",
          position: "relative",
          width: "100%",
          minWidth: 500,
          $nest: {
            strong: {
              color: colors.LIGHT_ORANGE,
              fontWeight: 400,
            },
            ".sep": {
              fontWeight: 500,
              color: "rgba(255,255,255,0.3)",
            },
          },
        },

        h4: {
          fontSize: "17px",
          padding: "10px 15px",
          marginBottom: 20,
          fontFamily: fonts.CONDENSED,
          fontWeight: 400,
          textTransform: "uppercase",
          background: colors.DARK_BG,
          color: "#fff",
          width: "100%",
          position: "relative",
          display: "flex",
          alignItems: "center",

          $nest: {
            "svg.right-caret": {
              fill: "rgba(255,255,255,0.2)",
              width: 12,
              height: 12,
              margin: "0 5px",
            },

            "& > span": {
              display: "flex",
              alignItems: "center",
            },

            span: {
              fontFamily: fonts.CONDENSED,
              fontWeight: 400,
              textTransform: "uppercase",
              color: "#fff",
              fontSize: "18px",

              $nest: {
                ...multi(["&.base", "&.sep"], {
                  color: "rgba(255,255,255,0.7)",
                  $nest: {
                    "&.sep": {
                      marginLeft: 8,
                      marginRight: 8,
                    },
                  },
                }),
              },
            },

            ".actions": {
              display: "flex",
              height: "100%",
              position: "absolute",
              top: 0,
              right: 0,
              $nest: {
                ...multi(["> span", "> a"], {
                  cursor: "pointer",
                  display: "flex",
                  height: "100%",
                  alignItems: "center",
                  paddingRight: 17,
                  borderLeft: "1px solid rgba(255,255,255,0.15)",
                  paddingLeft: 17,
                  position: "relative",
                  $nest: {
                    "> span": {
                      textTransform: "none",
                      fontSize: "13px",
                      fontWeight: 500,
                      display: "none",
                      color: "#fff",
                      minWidth: "100%",
                      textAlign: "center",
                    },
                    svg: {
                      fill: "rgba(255,255,255,0.5)",
                      width: 15,
                      height: 15,
                    },
                    "&.reorder": {
                      cursor: "grab",
                    },
                    "&.delete > svg": {
                      width: 13,
                      height: 13,
                    },
                    "&:hover": {
                      background: "rgba(0,0,0,0.2)",
                      $nest: {
                        svg: {
                          fill: "rgba(255,255,255,0.9)",
                        },
                        "> span": {
                          display: "inline-block",
                          position: "absolute",
                          top: "100%",
                          right: 0,
                          background: colors.OFF_BLACK,
                          padding: "5px 10px",
                          whiteSpace: "nowrap",
                          zIndex: 2,
                        },
                      },
                    },
                  },
                }),
              },
            },

            ".modal-link": deepMergeStyles(modalLink({ bgMode: "dark" }), {
              right: 10,

              $nest: {
                span: {
                  display: "none",
                },
              },
            }),

            "&.toggle-header": {
              paddingLeft: 36,
            },

            ".toggle": {
              cursor: "pointer",
              display: "flex",
              height: "100%",
              alignItems: "center",
              justifyContent: "center",
              paddingLeft: 14,
              paddingRight: 10,
              left: 0,
              top: 0,
              position: "absolute",
              $nest: {
                svg: {
                  width: 12,
                  height: 12,
                  fill: "rgba(255,255,255,0.5)",
                },
                "&.expanded svg": {
                  transform: "rotate(180deg)",
                },
                "&.collapsed svg": {
                  transform: "rotate(90deg)",
                },
                "&:hover svg": {
                  fill: "rgba(255,255,255,0.9)",
                },
              },
            },

            small: {
              color: "rgba(255,255,255,0.7)",
              textTransform: "none",
              flex: 1,
              textAlign: "right",
              paddingRight: 35,

              $nest: {
                "span.sep": {
                  color: "rgba(255,255,255,0.4)",
                  fontSize: "14px",
                },
              },
            },
          },
        },

        h5: {
          padding: "10px 15px",
          marginBottom: 20,
          background: color(colors.DARK_BG).lighten(0.275).toHexString(),
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",

          $nest: {
            "& > span": {
              display: "flex",
              alignItems: "center",
            },

            span: {
              fontFamily: fonts.CONDENSED,
              fontWeight: 400,
              textTransform: "uppercase",
              color: "#fff",
              fontSize: "16px",

              $nest: {
                ...multi(["&.base", "&.sep"], {
                  color: "rgba(255,255,255,0.7)",
                  $nest: {
                    "&.sep": {
                      marginLeft: 8,
                      marginRight: 8,
                    },
                  },
                }),
              },
            },

            small: {
              fontFamily: fonts.CONDENSED,
              fontWeight: 500,
              textTransform: "uppercase",
              color: "rgba(0,0,0,0.6)",
              fontSize: "15px",
            },

            svg: {
              width: 22,
              height: 22,
              fill: "rgba(255,255,255,0.7)",
              marginRight: 10,
            },
          },
        },

        ...multi(["h3 .small-loader", "h4 .small-loader"], {
          position: "absolute",
          top: `calc(50% - ${15}px)`,
          right: 20,
          $nest: {
            ...multi(["&", "rect", "path"], {
              fill: "rgba(255,255,255,0.9)",
            }),
          },
        }),

        ".danger-zone": {
          marginTop: 40,
          paddingTop: 40,
          borderTop: "1px solid rgba(0,0,0,0.2)",
          $nest: {
            h3: {
              color: "#fff",
              borderLeft: `20px solid ${colors.RED}`,
              borderRight: `20px solid ${colors.RED}`,
            },
          },
        },

        ".active": {
          background: "rgba(0,0,0,0.07)",
          width: "100%",
          marginTop: 8,
          marginBottom: 13,
          padding: 15,
          $nest: {
            ".title": {
              fontWeight: 600,
              color: "rgba(0,0,0,0.6)",
              display: "block",
              marginTop: 3,
              marginBottom: 5,
            },
            button: {
              float: "right",
              padding: "3px 8px",
              fontWeight: 500,
              fontSize: 14,
            },
          },
        },

        ".back-link": {
          marginTop: 0,
          marginBottom: 20,
          $nest: {
            a: {
              padding: 0,
            },
            "&:hover": {},
          },
        },
      },
    }
  )
);
