import { deepMergeStyles } from "./../helpers";
import { listItem } from "./../mixins/list";
import { AssocManagerContainer } from "./assoc_manager_container";
import { primaryButton } from "./../mixins/buttons";
import { style } from "typestyle";
import { multi } from "../helpers";
import * as colors from "../colors";
import * as fonts from "../fonts";
import { color } from "csx";
import * as layout from "../layout";
import { OrgContainer } from "./org_container";

export const EnvManager = style({
  paddingTop: layout.ENV_LABEL_ROW_HEIGHT,
  position: "relative",
  $nest: {
    ".title-row": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      height: layout.ENV_LABEL_ROW_HEIGHT,
      background: "rgba(0,0,0,0.1)",

      $nest: {
        ".label": {
          marginLeft: 10,
          display: "flex",
          alignItems: "center",
          $nest: {
            "> span": {
              borderBottom: "1px solid transparent",
            },
          },
        },
        "a.label": {
          $nest: {
            ...multi(["&", "& *"], {
              cursor: "pointer",
            }),
            "&:hover > span": {
              borderBottom: `1px solid rgba(0,0,0,0.2)`,
            },
          },
        },
        label: {
          color: colors.DARK_TEXT,
          fontSize: "15px",
          fontWeight: 500,
        },
        small: {
          fontFamily: fonts.CONDENSED,
          color: "rgba(0,0,0,0.4)",
          textTransform: "uppercase",
          fontSize: "14.5px",
        },
        "svg.triangle": {
          fill: "rgba(0,0,0,0.25)",
          width: 12,
          height: 12,
          marginRight: 5,
        },
        "svg.block": {
          fill: "rgba(0,0,0,0.4)",
          width: 20,
          height: 20,
          marginRight: 5,
        },
        "svg.right-caret": {
          fill: "rgba(0,0,0,0.2)",
          width: 8,
          height: 8,
          marginLeft: 5,
          marginRight: 5,
        },

        ".actions": {
          display: "flex",
          alignItems: "center",
          height: "100%",
          $nest: {
            "> svg.small-loader": {
              width: 24,
              height: 24,
              marginRight: 15,
              $nest: multi(["&", "rect", "path"], {
                fill: "rgba(0,0,0,0.7)",
              }),
            },
            "&.disabled": {
              pointerEvents: "none",
              opacity: 0.7,
            },
            "> span": {
              display: "flex",
              width: layout.ENV_LABEL_ROW_BUTTON_WIDTH,
              height: "100%",
              alignItems: "center",
              justifyContent: "center",
              borderLeft: "1px solid rgba(0,0,0,0.1)",
              $nest: {
                "&:not(.reorder)": { cursor: "pointer" },
              },
            },
            "> span > span": {
              display: "none",
            },
            "> span > svg": {
              fill: "rgba(0,0,0,0.4)",
              width: 15,
              height: 15,
            },
            "> span.remove > svg": {
              width: 13,
              height: 13,
            },
            "> span:hover": {
              background: "rgba(0,0,0,0.1)",
              $nest: {
                "> span": {
                  color: "rgba(0,0,0,0.9)",
                },
                "> svg": {
                  fill: "rgba(0,0,0,0.7)",
                },
              },
            },
          },
        },
      },
    },
    "&.showing-add-form": {
      paddingTop: layout.ENV_LABEL_ROW_HEIGHT + 158,
    },
    "&.editing-multiline": {
      $nest: {
        ...multi([".env-grid", ".env-add-form"], {
          background: "rgba(0,0,0,0.05)",
          $nest: {
            ".cell textarea": {
              width: "100%",
              textAlign: "left",
            },
            ...multi([".row", ".cell"], {
              border: "none",
            }),
            ".entry-col": {
              border: "none",
              background: "#fff",
            },
            ".val-cols": {
              background: "#fff",
              borderLeft: "1px solid rgba(0,0,0,0.1)",
            },
            ".entry-col .cell": {
              borderBottom: "1px solid rgba(0,0,0,0.1)",
              pointerEvents: "none",
            },
            "&.env-add-form": {
              borderBottom: "none",
              paddingBottom: 0,
            },
          },
        }),

        ".entry-form-actions": {
          display: "none",
        },

        ".title-row .actions": {
          display: "none",
        },
      },
    },

    ".multiline-copy": {
      position: "fixed",
      background: "rgba(0,0,0,0.05)",
      paddingBottom: 5,
      $nest: {
        h4: {
          width: "100%",
          textAlign: "center",
          fontFamily: fonts.CONDENSED,
          fontWeight: 600,
          fontSize: "15px",
          padding: "10px 0",
          textTransform: "uppercase",
          background: "rgba(0,0,0,0.05)",
          marginBottom: 5,
          color: "rgba(0,0,0,0.5)",
        },
        h6: {
          width: "100%",
          textAlign: "center",
          fontSize: "13px",
          padding: "5px 0",
          color: "rgba(0,0,0,0.5)",
          $nest: {
            em: {
              fontFamily: fonts.CONDENSED,
              textTransform: "uppercase",
              fontWeight: 600,
              color: colors.DARK_BLUE,
              marginRight: 3,
              fontStyle: "normal",
            },
          },
        },
      },
    },

    ".envs-just-updated": {
      display: "flex",
      justifyContent: "flex-end",
      width: "100%",
      $nest: {
        ".title-row": {
          background: colors.LIGHT_ORANGE,
          paddingLeft: 10,
        },

        ".sep": {
          color: "rgba(0,0,0,0.2)",
          margin: "0 10px",
        },

        ".link-button": {
          color: "rgba(255,255,255,0.8)",
          fontStyle: fonts.CONDENSED,
          fontSize: "12.5px",
          textTransform: "uppercase",
          fontWeight: 600,
          cursor: "pointer",
          padding: "4px 7px",
          background: "rgba(0,0,0,0.25)",
          borderRadius: 2,
          marginLeft: 12,
          $nest: {
            "&:hover": {
              color: "#fff",
              background: "rgba(0,0,0,0.35)",
            },
          },
        },

        label: {
          color: "rgba(0,0,0,0.6)",
        },
      },
    },

    ".loading-envs > svg.small-loader": {
      margin: "5px 15px",
      $nest: {
        ...multi(["&", "rect", "path"], {
          fill: colors.DARK_BLUE,
        }),
      },
    },
  },
});

export const EnvGrid = style({
  $nest: {
    ".entry-col": {
      display: "flex",
      alignItems: "center",
      borderRight: "1px solid rgba(0,0,0,0.1)",
      $nest: {
        ".cell": {
          flex: 1,
          paddingLeft: 12,
          justifyContent: "left",
          $nest: {
            "&.comitting": {
              justifyContent: "center",
            },
            "&.editing": {
              paddingLeft: 0,
            },
            textarea: {
              textAlign: "left",
              paddingLeft: 10,
            },
          },
        },
      },
    },

    ".val-cols": {
      flex: 1,
      display: "flex",
      $nest: {
        ".cell:not(:last-of-type)": {
          borderRight: "1px solid rgba(0,0,0,0.1)",
        },
        ".cells": {
          display: "inline-flex",
          flex: 1,
        },
      },
    },

    ".row": {
      display: "flex",
      borderBottom: "1px solid rgba(0,0,0,0.15)",

      $nest: {
        "&:first-of-type": {
          borderTop: "1px solid rgba(0,0,0,0.15)",
        },
        "&.show-left-nav .entry-col": {
          borderRight: "1px solid rgba(0,0,0,0.1)",
        },
        // "&:not(.highlight-row).odd": {
        //   background: "rgba(0,0,0,0.025)",
        // },
        "&.highlight-row": {
          transition: "background",
          transitionDuration: "0.2s",
          background: color(colors.LIGHTEST_BLUE).fadeOut(0.65).toString(),
        },
        "&:not(.highlight-row) .cell:not(.editing).pending": {
          background: color(colors.LIGHTEST_BLUE).fadeOut(0.825).toString(),
        },
        "&.confirming-remove": {
          height: layout.ENV_ROW_HEIGHT * 1.5,
          display: "flex",
          alignItems: "center",
          paddingLeft: 10,
          background: colors.DARK_BLUE,

          $nest: {
            label: {
              marginRight: 20,
              fontSize: "14px",
              color: "#fff",
            },
            "label > strong": {
              fontFamily: fonts.CODE,
              fontSize: "14px",
              fontWeight: 500,
              color: "#fff",
            },
            button: {
              fontFamily: fonts.CONDENSED,
              fontSize: "14px",
              textTransform: "uppercase",
              padding: "5px 15px",
              cursor: "pointer",
              borderRadius: 2,
              $nest: {
                "&.secondary": {
                  background: "none",
                  border: "1px solid rgba(0,0,0,0.4)",
                  color: "rgba(0,0,0,0.8)",
                  $nest: {
                    "&:hover": {
                      background: "rgba(255,255,255,0.15)",
                      color: "rgba(0,0,0,0.9)",
                    },
                  },
                },
                "&.primary": {
                  marginLeft: 10,
                  background: "rgba(0,0,0,0.6)",
                  border: "1px solid rgba(0,0,0,0.6)",
                  color: "rgba(255,255,255,0.9)",
                  $nest: {
                    "&:hover": {
                      background: "rgba(0,0,0,0.8)",
                      color: "#fff",
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    ".cell": {
      flex: 1,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      $nest: {
        "&:not(.editing) > span": {
          position: "absolute",
          maxWidth: "90%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        },
        "*": {
          fontFamily: fonts.CODE,
          fontSize: "13px",
        },

        "svg.small-loader": {
          $nest: {
            ...multi(["&", "rect", "path"], {
              fill: colors.DARK_BLUE,
            }),
          },
        },
        "svg.na": {
          fill: "rgba(0,0,0,0.15)",
          width: 25,
          height: 25,
        },
        "&.masked > span": {
          fontSize: "10px",
          color: "rgba(0,0,0,0.5)",
        },
        "&.special": {
          $nest: {
            "& *": {
              color: "rgba(0,0,0,0.6)",
              fontFamily: fonts.MAIN,
              pointerEvents: "none",

              $nest: multi(["&.remove", "&.copy"], {
                pointerEvents: "initial",
              }),
            },
            "&.inherits label": {
              color: colors.DARK_BLUE,
              fontWeight: 500,
              textTransform: "lowercase",
              fontSize: "14px",
            },
            "&.inherits small": {
              marginRight: 4,
            },
          },
        },
        textarea: {
          width: "calc(100% - 1px)",
          height: "100%",
          border: "none",
          padding: 10,
          resize: "none",
          textAlign: "center",
          background: "none",
          $nest: {
            "&::placeholder": {
              fontFamily: fonts.MAIN,
            },
          },
        },
        small: {
          fontFamily: fonts.MAIN,
          color: "rgba(0,0,0,0.5)",
        },

        "&:not(.editing).writable": {
          $nest: {
            ...multi(["&", "& *"], {
              cursor: "pointer",
            }),
            "&:hover": {
              boxShadow: `inset 0px 0px 3px 1px ${colors.LIGHT_BLUE}`,
            },
          },
        },

        "&.editing": {
          boxShadow: `inset 0px 0px 3px 1px ${colors.LIGHT_ORANGE}`,
        },

        "&.not-writable": {
          cursor: "not-allowed",
        },

        ...multi(["div.remove", "div.copy"], {
          display: "none",
          width: layout.ENV_LABEL_ROW_BUTTON_WIDTH,

          alignItems: "center",
          justifyContent: "center",
          height: "calc(100% - 4px)",
          cursor: "pointer",
          position: "absolute",
          top: 2,
          background: "#fff",
          $nest: {
            svg: {
              fill: "rgba(0,0,0,0.2)",
            },
            "&:hover": {
              background: "#f2f2f2",
              $nest: {
                svg: {
                  fill: "rgba(0,0,0,0.5)",
                },
              },
            },
            "&.remove": {
              right: 1,
              borderLeft: "1px solid rgba(0,0,0,0.1)",
              $nest: {
                svg: {
                  width: 11,
                  height: 11,
                },
              },
            },
            "&.copy": {
              left: 1,
              borderRight: "1px solid rgba(0,0,0,0.1)",
              $nest: {
                svg: {
                  width: 22,
                  height: 22,
                },
              },
            },
          },
        }),

        "&:hover": {
          $nest: multi([".remove", ".copy"], {
            display: "flex",
          }),
        },

        "&.copied": {
          background: colors.LIGHT_BLUE,
          $nest: {
            small: {
              fontSize: "13px",
              color: "#fff",
              fontWeight: 500,
            },
          },
        },
      },
    },

    ".arrow-col": {
      width: layout.ENV_LABEL_ROW_BUTTON_WIDTH,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "18px",
      fontWeight: 500,
      color: "rgba(0,0,0,0.175)",
      userSelect: "none",
      $nest: {
        "&.left": {
          borderRight: "1px solid rgba(0,0,0,0.1)",
        },
        "&.right": {
          borderLeft: "1px solid rgba(0,0,0,0.1)",
        },
        ...multi(["&", "*"], {
          cursor: "pointer",
        }),
        "&:hover": {
          color: "rgba(0,0,0,0.6)",
          background: "rgba(0,0,0,0.05)",
        },
      },
    },

    ".empty-placeholder": {
      display: "flex",
      alignItems: "center",
      height: layout.ENV_ROW_HEIGHT,
      paddingLeft: 10,
      borderTop: "1px solid rgba(0,0,0,0.2)",
      $nest: {
        span: {
          color: "rgba(0,0,0,0.5)",
          fontSize: "14px",
        },
      },
    },
  },
});

export const CellAutocomplete = style({
  position: "absolute",
  left: 0,
  width: "100%",
  top: "100%",
  background: "#fff",
  borderTop: "1px solid rgba(0,0,0,0.1)",
  boxShadow: "0px 1px 1px rgba(0,0,0,0.4)",
  zIndex: 3,
  $nest: {
    ".option": {
      cursor: "pointer",
      textAlign: "center",
      padding: "8px 10px",
      $nest: {
        ...multi(["&", "span", "strong"], {
          fontFamily: fonts.MAIN,
          $nest: {
            strong: {
              marginLeft: 4,
              fontWeight: 500,
              textTransform: "lowercase",
              color: colors.DARK_BLUE,
            },
          },
        }),
        "&.selected": {
          $nest: multi(["&", "span", "strong"], {
            background: colors.DARK_BLUE,
            color: "#fff",
          }),
        },
        "&:not(:last-of-type)": {
          borderBottom: "1px solid rgba(0,0,0,0.1)",
        },
      },
    },
  },
});

export const EnvLabelArrowButton = style({
  display: "flex",
  width: layout.ENV_LABEL_ROW_BUTTON_WIDTH,
  height: "100%",
  alignItems: "center",
  justifyContent: "center",
  color: "#c1d7e0",
  borderRight: "1px solid rgba(0,0,0,0.15)",
  fontSize: "18px",
  fontWeight: 500,
  cursor: "pointer",
  $nest: {
    "&.double-arrow": {
      letterSpacing: -10,
      paddingRight: 10,
    },
    "&:hover": {
      background: "rgba(0,0,0,0.3)",
      color: "#dfe7eb",
    },
  },
});

export const EnvLabelRow = style({
  display: "flex",
  position: "fixed",
  top: layout.MAIN_HEADER_HEIGHT,
  right: 0,
  zIndex: 4,
  $nest: {
    ".entry-col": {
      background: colors.DARK_BG,
      $nest: {
        "& > div": {
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: 10,
        },
        label: {
          fontFamily: fonts.CONDENSED,
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.9)",
          fontSize: "16px",
        },
        ".actions": {
          height: "100%",
          display: "flex",
          $nest: {
            ".toggle": {
              display: "flex",
              alignItems: "center",
              borderLeft: "1px solid rgba(255,255,255,0.15)",
              padding: "0 10px",
              height: "100%",
              $nest: {
                input: {
                  transform: "scale(0.9)",
                  border: "none",
                },
                svg: {
                  marginLeft: 10,
                  width: 20,
                  height: 20,
                  $nest: multi(["&", "path", "rect"], {
                    fill: "rgba(255,255,255,0.5)",
                  }),
                },
                ...multi(["&", "& *"], {
                  cursor: "pointer",
                }),
                "&:hover": {
                  background: "rgba(255,255,255,0.05)",
                },
                "&.checked svg": {
                  $nest: multi(["&", "path", "rect"], {
                    fill: "rgba(255,255,255,0.9)",
                  }),
                },
              },
            },

            button: {
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              width: layout.ENV_LABEL_ROW_BUTTON_WIDTH,
              background: "none",
              border: "none",
              borderLeft: "1px solid rgba(255,255,255,0.15)",
              cursor: "pointer",
              $nest: {
                "&:hover:not(.selected)": {
                  background: "rgba(255,255,255,0.05)",
                },

                "&.add": {
                  $nest: {
                    svg: {
                      width: 15,
                      height: 15,
                      fill: colors.LIGHT_ORANGE,
                    },
                    "&.selected": {
                      background: colors.ORANGE,
                      $nest: {
                        svg: {
                          fill: "#fff",
                        },
                      },
                    },
                  },
                },

                "&.search": {
                  $nest: {
                    svg: {
                      width: 16,
                      height: 16,
                      fill: "rgba(255,255,255,0.7)",
                    },
                  },
                },
              },
            },
          },
        },

        "&.filtering": {
          $nest: {
            "> div": {
              paddingLeft: 0,
            },
            "span.search": {
              width: layout.ENV_LABEL_ROW_BUTTON_WIDTH,
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            },
            "svg.search": {
              fill: "rgba(255,255,255,0.7)",
              width: 16,
              height: 16,
            },

            input: {
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.9)",
              flex: 1,
              fontSize: "14px",
              $nest: {
                "&::placeholder": {
                  color: "rgba(255,255,255,0.7)",
                },
              },
            },

            "button.close": {
              background: "none",
              border: "none",
              cursor: "pointer",
              width: layout.ENV_LABEL_ROW_BUTTON_WIDTH,
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              $nest: {
                svg: {
                  width: 12,
                  height: 12,
                  fill: "rgba(255,255,255,0.7)",
                },
                "&:hover": {
                  background: colors.OFF_BLACK,
                },
                "&:hover svg": {
                  fill: "rgba(255,255,255,0.9)",
                },
              },
            },
          },
        },
      },
    },

    ".val-cols": {
      flex: 1,
      display: "flex",
    },

    ".cell": {
      display: "inline-flex",
      height: "100%",
      alignItems: "center",
      position: "relative",
      borderLeft: "1px solid rgba(0,0,0,0.15)",
      $nest: {
        ".title": {
          flex: 1,
          position: "relative",
          margin: "0 10px",
        },
        "a.title": {
          $nest: {
            "&:hover > span": {
              textDecoration: "underline",
            },
          },
        },
        ".title > span": {
          fontFamily: fonts.CONDENSED,
          color: "#fff",
          textTransform: "uppercase",
          fontSize: "16px",
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%,-50%)",
          width: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          $nest: {
            "svg.lock": {
              fill: "rgba(0,0,0,0.25)",
              width: 18,
              height: 18,
              marginRight: 6,
              position: "relative",
              top: -1,
            },
          },
        },
        ":not(svg).subenvs": {
          height: "100%",
          borderRight: "1px solid rgba(0,0,0,0.15)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: layout.ENV_LABEL_ROW_BUTTON_WIDTH,
          position: "relative",
          $nest: {
            svg: {
              fill: "rgba(255,255,255,0.7)",
              width: 18,
              height: 18,
            },
            "&:hover": {
              background: "rgba(0,0,0,0.3)",
              $nest: {
                svg: {
                  fill: "rgba(255,255,255,0.9)",
                },
              },
            },
            ".num": {
              position: "absolute",
              top: 0,
              right: 0,
              transform: "translateX(50%)",
              fontFamily: fonts.CONDENSED,
              color: "rgba(255,255,255,0.9)",
              minWidth: 10,
              textAlign: "center",
              fontSize: "13px",
              fontWeight: 600,
              padding: "0 5px",
              zIndex: 3,
              boxSizing: "border-box",
            },

            "&.spacer": {
              display: "hidden",
              pointerEvents: "none",
              borderRight: "1px solid transparent",
            },
          },
        },

        ".menu": {
          height: "100%",
          border: "none",
          background: "none",
          borderLeft: "1px solid rgba(0,0,0,0.15)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: layout.ENV_LABEL_ROW_BUTTON_WIDTH,
          cursor: "pointer",
          $nest: {
            span: {
              color: "rgba(255,255,255,0.7)",
              fontSize: "24px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              transform: "translateY(-5px)",
            },
            "&.spacer": {
              display: "hidden",
              pointerEvents: "none",
              borderLeft: "1px solid transparent",
            },
          },
        },

        "&.menu-open button.menu": {
          background: "rgba(0,0,0,0.3)",
          $nest: {
            svg: {
              fill: "#fff",
            },
          },
        },

        "&:not(.menu-open) button.menu:hover": {
          background: "rgba(0,0,0,0.3)",
          $nest: {
            svg: {
              fill: "rgba(255,255,255,0.9)",
            },
          },
        },

        ".title select": {
          display: "block",
          position: "absolute",
          width: "100%",
          height: "100%",
          opacity: 0,
          cursor: "pointer",
        },

        ".title svg.down-caret": {
          fill: "rgba(255,255,255,0.5)",
          width: 12,
          height: 12,
          marginLeft: 7,
        },

        ".title.locals-select:hover": {
          $nest: {
            "> span": {
              textDecoration: "underline",
            },
            "svg.down-caret": {
              fill: "rgba(255,255,255,0.9)",
            },
          },
        },
      },
    },

    ".envs-nav": {
      background: colors.DARKER_BLUE,
      borderRight: "none",
      $nest: {
        "&:hover": {
          background: color(colors.DARKER_BLUE).darken(0.1).toHexString(),
        },
        "&.right": {
          borderLeft: "1px solid rgba(0,0,0,0.15)",
        },
      },
    },

    ".environment-menu": {
      position: "absolute",
      width: "100%",
      top: "100%",
      left: 0,
      background: color(colors.DARKER_BLUE).darken(0.1).toHexString(),
      zIndex: 4,
      $nest: {
        "> div": {
          color: "#fff",
          fontFamily: fonts.CONDENSED,
          textTransform: "uppercase",
          padding: "8px 10px",
          cursor: "pointer",
          fontSize: "14px",
          $nest: {
            "&:not(:last-of-type)": {
              borderBottom: "1px solid rgba(0,0,0,0.2)",
            },
            "&:hover": {
              background: color(colors.DARKER_BLUE).darken(0.2).toHexString(),
            },
          },
        },
      },
    },
  },
});

export const EnvBlocks = style({
  $nest: {
    ".toggle-blocks": {
      borderBottom: "1px solid rgba(0,0,0,0.1)",
      justifyContent: "left",
      $nest: {
        ...multi(["&", "& *"], {
          cursor: "pointer",
        }),
        "&:hover": {
          background: "rgba(0,0,0,0.175)",
        },
        "&.expanded svg.triangle": {
          transform: "rotate(180deg)",
        },
        "&.collapsed svg.triangle": {
          transform: "rotate(90deg)",
        },
      },
    },
    ".env-block": {
      $nest: {
        ".empty-placeholder": {
          borderBottom: "1px solid rgba(0,0,0,0.2)",
        },
      },
    },
  },
});

export const SubEnvs = style({
  display: "flex",
  $nest: {
    ".sub-list": {
      position: "fixed",
      top: layout.MAIN_HEADER_HEIGHT,
      background: "rgba(0,0,0,0.03)",
      overflowY: "auto",
      paddingTop: layout.ENV_LABEL_ROW_HEIGHT,
      zIndex: 3,
      $nest: {
        li: deepMergeStyles(listItem(), {
          marginBottom: 0,
          padding: 0,
          borderBottom: "1px solid rgba(0,0,0,0.1)",
          borderRight: "1px solid rgba(0,0,0,0.1)",
          $nest: {
            "> div": {
              height: layout.ENV_LABEL_ROW_HEIGHT,
            },

            ".select": {
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 10px",
              height: "100%",
              $nest: {
                "> span": {
                  fontSize: "13.5px",
                  fontWeight: 500,
                  color: "rgba(0,0,0,0.6)",
                },
                svg: {
                  fill: "rgba(0,0,0,0.2)",
                  width: 12,
                  height: 12,
                },
              },
            },

            ".remove": {
              width: 44,
              borderRight: "1px solid rgba(0,0,0,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              cursor: "pointer",
              $nest: {
                svg: {
                  fill: "rgba(0,0,0,0.2)",
                  width: 12,
                  height: 12,
                },
                "&:hover": {
                  background: "rgba(0,0,0,0.1)",
                  $nest: {
                    svg: {
                      fill: "rgba(0,0,0,0.3)",
                    },
                  },
                },
              },
            },

            "&.selected": {
              background: color(colors.DARKER_BLUE).darken(0.15).toHexString(),
              $nest: {
                ".select span": {
                  color: "#fff",
                },
                ".remove": {
                  borderRight: "1px solid rgba(255,255,255,0.2)",
                },
                ".remove svg": {
                  fill: "rgba(255,255,255,0.4)",
                },
                ".remove:hover": {
                  background: "rgba(0,0,0,0.3)",
                  $nest: {
                    svg: {
                      fill: "rgba(255,255,255,0.8)",
                    },
                  },
                },
                ".select svg": {
                  fill: "rgba(255,255,255,0.6)",
                },
              },
            },

            "&:not(.selected)": {
              $nest: {
                ".select": {
                  cursor: "pointer",
                },
                ".select:hover": {
                  background: "rgba(0,0,0,0.1)",
                  $nest: {
                    svg: {
                      fill: "rgba(0,0,0,0.3)",
                    },
                  },
                },
              },
            },

            "&.sub-label": {
              position: "fixed",
              userSelect: "none",
              top: layout.MAIN_HEADER_HEIGHT,
              fontSize: "16px",
              borderRadius: 0,
              borderBottom: "none",
              height: layout.ENV_LABEL_ROW_HEIGHT,
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: colors.DARKER_BLUE,
              fontFamily: fonts.CONDENSED,
              textTransform: "uppercase",
              color: "#fff",
              zIndex: 1,
              $nest: {
                ".actions": {
                  height: "100%",
                },
                "span.add": {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: layout.ENV_LABEL_ROW_BUTTON_WIDTH,
                  height: "100%",
                  borderLeft: "1px solid rgba(0,0,0,0.15)",
                  $nest: {
                    svg: {
                      fill: "rgba(255,255,255,0.7)",
                      width: 15,
                      height: 15,
                    },
                  },
                },
                "&:not(.selected) span.add:hover": {
                  background: "rgba(0,0,0,0.3)",
                  $nest: {
                    svg: {
                      fill: "#dfe7eb",
                    },
                  },
                },
                "&.selected span.add": {
                  background: colors.LIGHT_BLUE,
                  $nest: {
                    svg: {
                      fill: "#fff",
                    },
                  },
                },
              },
            },
          },
        }),
      },
    },

    ".sub-selected": {
      flex: 1,
    },
  },
});

export const NewSubEnvForm =
  OrgContainer +
  " " +
  style({
    margin: "50px auto",
    $nest: {
      ...multi(["p", "p strong"], {
        fontSize: "16px",
      }),
      ".field": {
        marginBottom: 20,
      },
    },
  });

export const EnvAddForm = style({
  position: "fixed",
  top: layout.MAIN_HEADER_HEIGHT + layout.ENV_LABEL_ROW_HEIGHT,
  width: `calc(100% - ${layout.SIDEBAR_WIDTH}px)`,
  background: "#fff",
  zIndex: 3,
  paddingBottom: 20,
  borderBottom: "1px solid rgba(0,0,0,0.1)",
  $nest: {
    ".tabs": {
      width: "100%",
      background: colors.OFF_BLACK,
      position: "relative",
      $nest: {
        "> span:not(.close)": {
          fontFamily: fonts.CONDENSED,
          color: "rgba(255,255,255,0.6)",
          padding: 10,
          textTransform: "uppercase",
          display: "inline-block",
          fontSize: 14,
          cursor: "pointer",
          $nest: {
            "&.selected": {
              color: colors.LIGHT_ORANGE,
            },
            "&:hover:not(.selected)": {
              color: "rgba(255,255,255,0.9)",
            },
          },
        },

        ".close": {
          position: "absolute",
          right: 0,
          top: 0,
          height: "100%",
          width: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          background: "rgba(255,255,255,0.2)",
          $nest: {
            svg: {
              width: 12,
              height: 12,
              fill: "rgba(255,255,255,0.7)",
            },
            "&:hover": {
              background: "rgba(255,255,255,0.3)",
              $nest: {
                svg: {
                  fill: "#fff",
                },
              },
            },
          },
        },
      },
    },

    ".entry-form-actions": {
      padding: "15px 0 0 10px",
      $nest: {
        button: {
          height: layout.ENV_ROW_HEIGHT,
        },
        "button.primary": {
          ...primaryButton({ bgMode: "light" }),
          fontSize: "16px",
          padding: 0,
        },
      },
    },
  },
});

export const EnvConnectBlocks =
  AssocManagerContainer +
  " " +
  style({
    marginLeft: 20,
    marginTop: 20,
    $nest: {
      ".filter input": {
        fontSize: "14px",
      },
      ".buttons input.primary": {
        fontSize: "16px",
        padding: "10px 0",
      },
    },
  });
