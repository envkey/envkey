import * as fonts from "../fonts";
import * as colors from "../colors";
import * as R from "ramda";
import { types } from "typestyle";
import { color } from "csx";
import {
  primaryButton,
  secondaryButton,
  tertiaryButton,
  backLink,
  modalLink,
} from "./buttons";
import { deepMergeStyles, multi } from "../helpers";
import { customSelect } from "./select";

export const baseContainer = (params: {
  width: number;
  bgMode: "light" | "dark";
  hAlign?: "start" | "center";
}): types.NestedCSSProperties => {
  return {
    width: params.width,
    display: "flex",
    flexDirection: "column",
    alignItems: params.hAlign ?? "center",
    textAlign: "left",
    $nest: {
      ...[
        multi(["textarea", "input:not([type=submit])"], {
          border:
            params.bgMode == "dark"
              ? "1px solid rgba(0,0,0,0.1)"
              : "1px solid rgba(0,0,0,0.2)",
        }),
        multi(["textarea:focus", "input:not([type=submit]):focus"], {
          border: `1px solid ${colors.LIGHT_ORANGE}`,
          boxShadow: `0 0 1px 1px ${colors.LIGHT_ORANGE}`,
        }),

        multi(
          [
            "input:not([type])",
            "input[type=text]",
            "input[type=email]",
            "input[type=password]",
            "input[type=number]",
            "textarea",
          ],
          {
            fontSize: "16px",
            display: "inline-block",
            width: "100%",
            padding: 10,
            borderRadius: "2px",

            $nest: {
              "&[disabled]": {
                background:
                  params.bgMode == "dark" ? "rgba(255,255,255,0.7)" : "#eee",
                color:
                  params.bgMode == "dark"
                    ? "rgba(0,0,0,0.6)"
                    : "rgba(0,0,0,0.6)",
              },
            },
          }
        ),
      ].reduce(R.mergeDeepRight, {}),

      ...multi(
        [
          "input:not(:last-child)",
          ".select:not(:last-child)",
          "textarea:not(:last-child)",
        ],
        {
          marginBottom: 15,
        }
      ),

      ".select": deepMergeStyles(customSelect("rgba(0,0,0,0.2)", 15), {
        background: params.bgMode == "dark" ? "#fff" : "none",
        borderRadius: 2,
        border: "1px solid rgba(0,0,0,0.2)",
        cursor: "pointer",
        $nest: {
          "> select": {
            color: "rgba(0,0,0,0.8)",
            padding: 10,
            $nest: {
              "&[disabled]": {
                background:
                  params.bgMode == "dark"
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(0,0,0,0.1)",
              },
            },
          },
          "&:not(.disabled):hover": {
            background: color("#fff").darken(0.025).toString(),
            $nest: {
              svg: {
                fill: "rgba(0,0,0,0.4)",
              },
            },
          },
        },
      }),

      ".radio-options": {
        width: "100%",
        $nest: {
          "> div": {
            width: "100%",
            marginBottom: 20,
            cursor: "pointer",
            background:
              params.bgMode == "dark"
                ? "rgba(255,255,255,0.02)"
                : "rgba(0,0,0,0.02)",
            border:
              params.bgMode == "dark"
                ? "1px solid rgba(255,255,255,0.2)"
                : "1px solid rgba(0,0,0,0.2)",

            $nest: {
              "> div": {
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 20,
                $nest: {
                  "&:not(:last-of-type)": {
                    borderBottom:
                      params.bgMode == "dark"
                        ? "1px solid rgba(255,255,255,0.2)"
                        : "1px solid rgba(0,0,0,0.2)",
                  },
                },
              },

              p: {
                color:
                  params.bgMode == "dark"
                    ? "rgba(255,255,255,0.7)"
                    : "rgba(0,0,0,0.7)",
                fontSize: "15px",
                fontWeight: 300,
                margin: 0,
              },

              ...multi(["label", "label *"], {
                fontFamily: fonts.CONDENSED,
                fontSize: "17px",
                fontWeight: 300,
                textTransform: "uppercase",
                color:
                  params.bgMode == "dark"
                    ? "rgba(255,255,255,0.9)"
                    : "rgba(0,0,0,0.9)",

                $nest: {
                  strong: {
                    color:
                      params.bgMode == "dark"
                        ? colors.LIGHTEST_BLUE
                        : colors.DARK_BLUE,
                  },
                },
              }),

              ".radio-circle": {
                width: 15,
                height: 15,
                borderRadius: 15,
                background:
                  params.bgMode == "dark"
                    ? "rgba(255,255,255,0.125)"
                    : "rgba(0,0,0,0.125)",
              },

              "&.selected": {
                background:
                  params.bgMode == "dark"
                    ? color(colors.DARKER_BLUE).darken(0.15).toString()
                    : "rgba(0,0,0,0.08)",
                border:
                  params.bgMode == "dark"
                    ? "1px solid rgba(255,255,255,0.4)"
                    : "1px solid rgba(0,0,0,0.4)",
                $nest: {
                  ".radio-circle": {
                    background:
                      params.bgMode == "dark"
                        ? colors.LIGHTEST_BLUE
                        : colors.DARK_BLUE,
                  },
                },
              },

              "&:not(.selected):hover": {
                background:
                  params.bgMode == "dark"
                    ? "rgba(255,255,255,0.05)"
                    : "rgba(0,0,0,0.05)",
                border:
                  params.bgMode == "dark"
                    ? "1px solid rgba(255,255,255,0.3)"
                    : "1px solid rgba(0,0,0,0.3)",
                $nest: {
                  ".radio-circle": {
                    background:
                      params.bgMode == "dark"
                        ? "rgba(255,255,255,0.25)"
                        : "rgba(0,0,0,0.25)",
                  },
                },
              },
            },
          },
        },
      },

      "input[type=checkbox]": {
        transform: "scale(1.25)",
      },

      ...multi(
        ["button.primary", "input[type=submit].primary", "a.primary"],
        primaryButton({
          bgMode: params.bgMode,
        })
      ),

      ...multi(
        ["button.secondary", "input[type=submit].secondary", "a.secondary"],
        secondaryButton({ bgMode: params.bgMode })
      ),

      ...multi(
        ["button.tertiary", "input[type=submit].tertiary", "a.tertiary"],
        tertiaryButton({ bgMode: params.bgMode })
      ),

      ".back-link": {
        marginTop: 40,
        textAlign: "center",
        $nest: {
          a: backLink({ bgMode: params.bgMode, fontSize: "16px" }),
        },
      },

      ".buttons": {
        width: params.width,
        display: "flex",
        $nest: {
          "> *": {
            flex: 1,
          },
          "> *:not(:last-child)": {
            marginRight: 15,
          },
        },
      },

      ".field": {
        width: params.width,
        marginBottom: 40,
        position: "relative",
      },

      ".field.no-margin": {
        marginBottom: 0,
      },

      ".field > .primary": {
        width: "100%",
      },

      ".field > .small-loader": {
        width: 35,
        height: 35,
        display: "block",
        margin: "0 auto",
        $nest: {
          ...multi(["&", "rect", "path"], {
            fill:
              params.bgMode == "dark"
                ? "rgba(255,255,255,0.6)"
                : colors.DARK_BLUE,
          }),
        },
      },

      ".field.checkbox": {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        cursor: "pointer",
        padding: 20,
        border: `1px solid ${
          params.bgMode == "dark" ? "rgba(0,0,0,0.9)" : "rgba(0,0,0,0.15)"
        }`,
        borderRadius: "2px",

        $nest: {
          "*": {
            cursor: "pointer",
          },
          "&:not([disabled]):hover": {
            background:
              params.bgMode == "dark"
                ? "rgba(255,255,255,0.02)"
                : "rgba(0,0,0,0.02)",
            border: `1px solid ${
              params.bgMode == "dark" ? "#000" : "rgba(0,0,0,0.2)"
            }`,
          },
          "&.selected": {
            background:
              params.bgMode == "dark"
                ? "rgba(255,255,255,0.04)"
                : "rgba(0,0,0,0.04)",
          },
          "&.disabled": {
            opacity: 0.6,
          },
        },
      },

      ".field.radio-group > div": {
        display: "flex",
        alignItems: "center",
        width: "100%",
        $nest: {
          label: {
            flex: 1,
            cursor: "pointer",
            padding: 15,
            border: "1px solid rgba(0,0,0,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            $nest: {
              "&:first-of-type": {
                borderRight: "none",
              },
              "&.selected": {
                background: "rgba(0,0,0,0.03)",
                $nest: {
                  span: {
                    color: colors.DARKER_BLUE,
                  },
                },
              },
              "&:not(.selected):hover": {
                background: "rgba(0,0,0,0.015)",
              },
              input: {
                transform: "scale(1.25)",
                margin: 0,
              },
              span: {
                fontFamily: fonts.CONDENSED,
                fontSize: "16px",
                textTransform: "uppercase",
                color: "rgba(0,0,0,0.5)",
              },
            },
          },
        },
      },

      ".field > label": {
        position: "relative",
        color:
          params.bgMode == "dark" ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.4)",
        $nest: {
          ...multi(["&", "& *"], {
            fontFamily: fonts.CONDENSED,
            fontWeight: params.bgMode == "dark" ? 300 : 400,
            fontSize: "18px",
            textTransform: "uppercase",
          }),
          strong: {
            color:
              params.bgMode == "dark" ? colors.LIGHTEST_BLUE : colors.DARK_BLUE,
          },
          ".modal-link": modalLink(params),
        },
      },

      ".field .sep": {
        color: "rgba(0,0,0,0.3)",
        margin: "0 7px",
      },

      ".field:not(.checkbox) > label": {
        display: "block",
        marginBottom: 20,
      },

      ".field.empty-placeholder": {
        marginBottom: 20,
        $nest: {
          span: {
            marginLeft: 10,
            color: "rgba(0,0,0,0.4)",
          },
        },
      },

      ".field button.copy": {
        fontFamily: fonts.CONDENSED,
        cursor: "pointer",
        background:
          params.bgMode == "dark"
            ? "rgba(255, 255, 255, 0.2)"
            : "rgba(0,0,0,0.1)",
        color:
          params.bgMode == "dark" ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.5)",
        textTransform: "uppercase",
        fontSize: "14px",
        border: "none",
        borderRadius: 2,
        padding: "3px 6px",
        float: "right",
        $nest: {
          "&:hover": {
            background:
              params.bgMode == "dark"
                ? "rgba(255, 255, 255, 0.25)"
                : "rgba(0,0,0,0.15)",
            color:
              params.bgMode == "dark"
                ? "rgba(255,255,255,0.9)"
                : "rgba(0,0,0,0.6)",
          },
        },
      },
      ".field small.copied": {
        position: "absolute",
        left: "100%",
        marginLeft: 15,
        top: 5,
        color:
          params.bgMode == "dark" ? colors.LIGHTEST_BLUE : colors.DARK_BLUE,
        fontWeight: 500,
      },

      ".field.search": {
        $nest: {
          "svg.search": {
            position: "absolute",
            left: 10,
            width: 20,
            top: "50%",
            transform: "translateY(-50%)",
            fill:
              params.bgMode == "dark"
                ? "rgba(255,255,255,0.2)"
                : "rgba(0,0,0,0.2)",
          },

          input: {
            paddingLeft: 40,
          },
        },
      },

      ".field.dir-path": {
        $nest: {
          ".dir-input": {
            marginBottom: 20,
            position: "relative",
            cursor: "pointer",

            $nest: {
              "&:hover": {
                $nest: {
                  input: {
                    background:
                      params.bgMode == "dark"
                        ? "rgba(255,255,255,0.02)"
                        : "rgba(0,0,0,0.02)",
                  },
                },
              },
            },
          },

          svg: {
            width: 30,
            height: 30,

            position: "absolute",
            top: "50%",
            left: 10,
            transform: "translateY(-50%)",

            $nest: {
              path: {
                fill:
                  params.bgMode == "dark"
                    ? "rgba(255,255,255,0.25)"
                    : "rgba(0,0,0,0.25)",
              },
            },
          },

          input: {
            paddingLeft: 50,
            textAlign: "right",
            pointerEvents: "none",
          },
        },
      },

      p: {
        width: params.width,
        marginTop: 0,
        marginBottom: 30,
        textAlign: "left",
        $nest: {
          ...multi(["&", "& *"], {
            color:
              params.bgMode == "dark"
                ? "rgba(255,255,255,0.9)"
                : colors.DARK_TEXT,
            fontSize: "18px",
          }),
          strong: {
            fontWeight: 500,
            color:
              params.bgMode == "dark" ? colors.LIGHTEST_BLUE : colors.DARK_BLUE,
          },
          em: {
            fontWeight: 500,
            fontStyle: "normal",
            color:
              params.bgMode == "dark" ? colors.LIGHT_ORANGE : colors.ORANGE,
          },

          code: {
            fontWeight: 500,
            fontFamily: fonts.CODE,
            fontSize: "16px",
            display: "inline-block",
            margin: "0px 1px",
            padding: "3px 6px",
            background: colors.OFF_BLACK,
            color: "#fff",
          },

          "&.important": {
            padding: 20,
            background: colors.DARKER_BLUE,
            color: "#fff",
            fontWeight: 400,
            $nest: {
              h4: {
                color: "rgba(0,0,0,0.55)",
                background: "none",
                padding: 0,
                fontFamily: fonts.CONDENSED,
                marginBottom: 10,
                paddingBottom: 10,
                borderBottom: "1px solid rgba(0,0,0,0.2)",
                textAlign: "center",
                fontSize: "19px",
                textTransform: "uppercase",
              },
            },
          },
        },
      },

      ...multi(["p a", "span a"], {
        color: params.bgMode == "dark" ? colors.LIGHT_ORANGE : colors.ORANGE,
        paddingTop: 1,
        paddingBottom: 1,
        borderBottom: `1px solid transparent`,
        $nest: {
          "&:hover": {
            borderBottom: `1px solid ${
              params.bgMode == "dark" ? colors.LIGHT_ORANGE : colors.ORANGE
            }`,
          },
        },
      }),

      ".field p:not(.error):not(.important)": {
        paddingLeft: 5,
        $nest: multi(["&", "& *"], {
          fontSize: "16px",
        }),
      },

      h3: {
        width: params.width,
        textAlign: "center",
      },

      ".error": {
        color: "#fff",
        padding: "10px 15px",
        background: colors.RED,
        userSelect: "initial",
        $nest: {
          strong: {
            color: "#fff",
          },
        },
      },
    },
  };
};

export const hoverable = (
  bg: string,
  hoverBg: string,
  $nest?: types.NestedCSSProperties["$nest"],
  cursor?: string,
  allowUserSelect?: true
): types.NestedCSSProperties => ({
  userSelect: allowUserSelect ? "inherit" : "none",
  background: bg,
  $nest: {
    ...multi(["&", "& *"], {
      cursor: cursor ?? "pointer",
    }),
    "&:hover": {
      background: hoverBg,

      ...($nest ? { $nest } : {}),
    },
  },
});
