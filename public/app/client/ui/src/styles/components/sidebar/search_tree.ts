import { deepMergeStyles as deepMergeStyles } from "../../helpers";
import { style } from "typestyle";
import * as layout from "../../layout";
import * as colors from "../../colors";
import * as fonts from "../../fonts";
import { hoverable, customSelect } from "../../mixins";
import { hsl } from "csx";
import { multi } from "../../helpers";

export const SearchTreeContainer = style({
  height: `calc(100% - ${layout.MAIN_HEADER_HEIGHT}px)`,
  width: "100%",
  display: "flex",
  flexDirection: "column",
});

export const SearchTreeSearch = style(
  deepMergeStyles(
    {
      width: "100%",
      height: layout.SECONDARY_HEADER_HEIGHT,
      borderBottom: "1px solid rgba(255,255,255,0.2)",
      display: "flex",
      alignItems: "center",
      cursor: "text",
      $nest: {
        "> input": {
          display: "inline-block",
          height: "100%",
          border: "none",
          background: "none",
          flexGrow: 1,
          fontSize: "13.5px",
          fontWeight: 400,
          paddingLeft: 10,
          color: "#fff",
          $nest: {
            "&::placeholder": {
              color: "rgba(255,255,255,0.8)",
            },
          },
        },
        "> svg": {
          display: "inline",
          opacity: 0.8,
          marginLeft: 15,
          fill: "#fff",
          width: 16,
          height: 16,
        },
      },
    },
    hoverable(
      "rgba(255,255,255,0)",
      "rgba(255, 255, 255, 0.08)",
      {
        "> input::placeholder": {
          color: "#fff",
        },
        "> svg": {
          opacity: 1,
        },
      },
      "text"
    )
  )
);

export const SearchTreeActions = style({
  display: "flex",
  height: layout.SECONDARY_HEADER_HEIGHT,
  borderBottom: "1px solid rgba(255,255,255,0.2)",
  $nest: {
    "> div:first-child": {
      borderRight: "1px solid rgba(255,255,255,0.2)",
      $nest: {
        "&:last-child": {
          borderRight: "none",
        },
      },
    },
  },
});

export const SearchTreeCategories = style(
  deepMergeStyles(
    deepMergeStyles(
      {
        flex: 1,
        height: "100%",
        $nest: {
          "> select": {
            paddingLeft: 15,
            display: "inline-block",
            width: "100%",
            height: "100%",
            fontSize: 12.5,
            fontWeight: 500,
            color: "rgba(255,255,255,0.8)",
          },
        },
      },
      customSelect("rgba(255,255,255,0.6)", 15),
      hoverable(
        "rgba(255,255,255,0)",
        "rgba(255, 255, 255, 0.08)",
        {
          "> select": {
            color: "#fff",
          },
          "> svg": {
            fill: "rgba(255,255,255,0.8)",
          },
        },
        "pointer"
      )
    )
  )
);

export const SearchTreeAdd = style({
  flex: 1,
  height: "100%",
  $nest: {
    "> div": {
      height: "100%",
      padding: "0 15px",
      display: "flex",
      alignItems: "center",
      background: "rgba(255,255,255,0)",
      justifyContent: "space-between",
      cursor: "pointer",
      $nest: {
        "> label": {
          fontWeight: 500,
          color: colors.LIGHT_ORANGE,
          textTransform: "uppercase",
          fontFamily: fonts.CONDENSED,
          fontSize: "14px",
        },
        "> svg": {
          width: 12,
          height: 12,
          fill: colors.LIGHT_ORANGE,
        },
        "&:hover": {
          background: "rgba(255,255,255,0.08)",
        },
      },
    },
    "> ul": {
      background: colors.DARK_BG_LEFT_TO_RIGHT_GRADIENT,
      width: "100%",
      position: "absolute",
      height: `calc(100% - ${
        layout.MAIN_HEADER_HEIGHT + layout.SECONDARY_HEADER_HEIGHT * 2
      }px)`,
      zIndex: 2,
      left: 0,
      opacity: 0,
      pointerEvents: "none",
      $nest: {
        li: {
          width: "100%",
        },
        a: deepMergeStyles(
          {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: layout.SECONDARY_HEADER_HEIGHT,
            width: "100%",
            padding: "0 15px",

            $nest: {
              span: {
                color: "#fff",
                fontFamily: fonts.CONDENSED,
                fontSize: "14px",
                fontWeight: 500,
                textTransform: "uppercase",
              },
              svg: {
                width: 12,
                height: 12,
                fill: colors.LIGHT_ORANGE,
                opacity: 0,
              },
            },
          },
          hoverable(hsl(0, 0, 0.1).toHexString(), "#000", {
            "> span": {
              color: colors.LIGHT_ORANGE,
            },
            svg: {
              opacity: 1,
            },
          })
        ),
      },
    },

    "&.expanded > ul": {
      opacity: 1,
      pointerEvents: "initial",
    },
    "&.expanded > div": {
      opacity: 1,
      pointerEvents: "initial",
      background: colors.ORANGE,
      $nest: {
        "> label": {
          color: "#fff",
        },
        "> svg": {
          fill: "#fff",
        },
        "&:hover": {
          background: colors.ORANGE,
        },
      },
    },
  },
});

export const SearchTree = style({
  flex: 1,
  overflow: "auto",
  position: "relative",
  $nest: {
    li: {
      alignItems: "center",
      paddingRight: 15,
      userSelect: "none",
      display: "flex",
      $nest: {
        label: {
          height: "100%",
          alignItems: "center",
          cursor: "pointer",
          flex: 1,
          display: "flex",
          paddingLeft: 5,
          $nest: {
            "> svg": {
              width: 10,
              height: 10,
              fill: "#fff",
              opacity: 0,
            },
            "&:hover": {
              opacity: 1,
              $nest: {
                "> svg": {
                  opacity: 1,
                },
              },
            },
          },
        },
        a: {
          height: "100%",
          alignItems: "center",
          cursor: "pointer",
          width: "100%",
          display: "flex",
        },
        "&.header-row": {
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          height: 35,
          background: "#101010",
          $nest: {
            "&:hover": {
              background: "#000",
              $nest: {
                ".toggle svg": {
                  fill: "#fff",
                },
              },
            },
            label: {
              color: colors.LIGHTEST_BLUE,
              fontFamily: fonts.CONDENSED,
              fontWeight: 500,
              fontSize: "14px",
              textTransform: "uppercase",
            },
          },
        },
        "&.tree-row": {
          height: 30,

          $nest: {
            "&.even": {
              background: "rgba(0,0,0, 0.03)",
            },
            "&.odd": {
              background: "rgba(255,255,255, 0.03)",
            },

            "&:hover": {
              background: "rgba(255,255,255, 0.09)",
            },
            label: {
              color: "#fff",
              fontFamily: fonts.MAIN,
              fontWeight: 400,
              fontSize: "14px",
            },

            "label > a": {
              color: "#fff",
              fontFamily: fonts.MAIN,
              fontWeight: 400,
              fontSize: "14px",
            },

            ...multi(["&.expandable", "&.expanded"], {
              $nest: {
                "&.even": {
                  background: "rgba(0,0,0, 0.44)",
                },
                "&.odd": {
                  background: "rgba(0,0,0, 0.36)",
                },
                label: {
                  fontFamily: fonts.CONDENSED,
                  textTransform: "uppercase",
                  fontWeight: 500,
                  fontSize: "14px",
                  color: "#fff",
                },
              },
            }),
          },
        },
        ".bullet": {
          display: "flex",
          alignItems: "center",
          height: "100%",
          width: 10,
          cursor: "pointer",
          $nest: {
            svg: {
              fill: hsl(0, 0, 0.5).toHexString(),
              width: 6,
              height: 6,
              position: "relative",
              top: 2,
            },
          },
        },

        ...multi(
          ["&.expandable .toggle:hover svg", "&.expanded .toggle:hover svg"],
          {
            fill: "#fff",
          }
        ),

        "&.expanded .bullet svg": {
          transform: "rotate(180deg)",
          width: 8,
          height: 8,
          top: 0,
        },
        "&.expandable .bullet svg": {
          transform: "rotate(90deg)",
          width: 8,
          height: 8,
          top: 0,
        },
        "&.selected": {
          $nest: {
            ...multi(["&.even", "&.odd"], {
              background: colors.DARK_BLUE,
            }),
            ...multi(["&", "& *", ".toggle"], {
              cursor: "default",
            }),
            ".toggle svg": {
              fill: "rgba(255,255,255,0.4)",
            },
            "label > svg": {
              opacity: 1,
            },
          },
        },

        ".spacer": {
          width: 5,
          display: "inline-block",
        },
        ".toggle": {
          cursor: "pointer",
          display: "flex",
          height: "100%",
          alignItems: "center",
          paddingLeft: "10px",
        },
      },
    },
  },
});
