import { multi } from "./../helpers";
import { style } from "typestyle";
import * as colors from "../colors";
import * as fonts from "../fonts";
import { Modal } from "./modal";
import { OrgContainer } from "./org_container";
import { color } from "csx";

export const RbacInfo =
  OrgContainer +
  " " +
  Modal +
  " " +
  style({
    $nest: {
      ".modal": {
        padding: 0,
        height: "80%",
        width: "80%",
        display: "flex",
        flexDirection: "column",
        $nest: {
          h4: {
            height: 55,
            justifyContent: "center",
            margin: 0,
            $nest: {
              select: {
                display: "block",
                position: "absolute",
                width: "100%",
                height: "100%",
                opacity: 0,
                cursor: "pointer",
              },
              "svg.down-caret": {
                fill: "rgba(255,255,255,0.5)",
                width: 12,
                height: 12,
                marginLeft: 7,
              },
              "&:hover": {
                background: color(colors.DARK_BG).lighten(0.02).toString(),
                $nest: {
                  "svg.down-caret": {
                    fill: colors.LIGHTEST_BLUE,
                  },
                },
              },
            },
          },

          "> div": {
            height: "calc(100% - 55px)",
            width: "100%",
            display: "flex",
          },

          ".roles": {
            width: "28%",
            height: "100%",
            background: "rgba(0,0,0,0.08)",
            overflow: "auto",

            $nest: {
              "> div": {
                padding: "12px 10px",
                borderBottom: "1px solid rgba(0,0,0,0.1)",
                fontFamily: fonts.CONDENSED,
                textTransform: "uppercase",
                fontSize: "14.5px",
                color: "rgba(0,0,0,0.6)",
                cursor: "pointer",
                $nest: {
                  "&:not(.selected):hover": {
                    background: "rgba(0,0,0,0.05)",
                  },
                  "&.selected": {
                    background: colors.DARKER_BLUE,
                    color: "#fff",
                  },
                },
              },
            },
          },

          ".details": {
            flex: 1,
            height: "100%",
            overflow: "auto",
            padding: 20,

            $nest: {
              h3: {
                width: "100%",
                minWidth: "initial",
                background: "none",
                padding: 0,
                marginBottom: 15,
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                $nest: {
                  ...multi(["&", "& *"], {
                    fontFamily: fonts.CONDENSED,
                    fontSize: "20px",
                    fontWeight: 300,
                    color: "rgba(0,0,0,0.4)",
                    textTransform: "uppercase",
                  }),
                  strong: {
                    color: colors.DARKER_BLUE,
                    fontWeight: 400,
                  },
                  "svg.right-caret": {
                    fill: "rgba(0,0,0,0.2)",
                    width: 10,
                    height: 10,
                    margin: "0 7px",
                  },

                  "&.auto-app-role": {
                    color: colors.LIGHT_BLUE,
                    fontWeight: 400,
                    fontSize: "18px",
                  },
                },
              },
              ".field": {
                width: "100%",
                marginBottom: 15,
                $nest: {
                  label: {
                    fontSize: "16px",
                    marginBottom: 10,
                    $nest: {
                      strong: {
                        fontSize: "16px",
                        color: colors.LIGHT_BLUE,
                      },
                    },
                  },
                  ".permission": {
                    display: "block",
                    marginBottom: 10,
                    $nest: {
                      ".bullet": {
                        color: colors.LIGHT_BLUE,
                        marginRight: 5,
                        opacity: 0.7,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
