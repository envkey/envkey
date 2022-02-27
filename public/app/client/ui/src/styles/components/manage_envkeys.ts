import { style } from "typestyle";
import * as colors from "../colors";
import * as fonts from "../fonts";
import { multi } from "../helpers";
import { AssocManagerContainer, AssocManager } from "./assoc_manager_container";
import { color } from "csx";

export const ManageEnvkeys =
  AssocManager +
  " " +
  style({
    $nest: {
      ".buttons": {
        marginBottom: 30,
      },
      "form .buttons": {
        marginTop: -20,
      },

      ".assoc-list > div.generated-envkey": {
        background: colors.DARK_BLUE,
        $nest: {
          ".title": {
            color: "#fff",
          },
          ".subtitle": {
            color: "rgba(255,255,255,0.7)",
          },
          ".envkey": {
            color: "rgba(255,255,255,0.9)",
            fontSize: "17px",
          },
          ".generated-envkey-copy": {
            display: "block",
            width: "100%",
            marginBottom: 20,
            $nest: {
              label: {
                display: "block",
                fontFamily: fonts.CONDENSED,
                color: colors.LIGHTEST_BLUE,
                width: "100%",
                textTransform: "uppercase",
                marginBottom: 10,
                fontSize: "20px",
              },
              p: {
                width: "100%",

                marginBottom: 0,
                $nest: {
                  ...multi(["&", "& strong"], {
                    color: "rgba(0,0,0,0.6)",
                    fontSize: "15.5px",
                    userSelect: "auto",
                  }),
                },
              },
              a: {
                color: colors.LIGHTEST_BLUE,
                $nest: {
                  "&:hover": {
                    borderBottomColor: colors.LIGHTEST_BLUE,
                  },
                },
              },
            },
          },
          ".actions button.primary": {
            background: colors.DARK_BG,
            color: "rgba(255,255,255,0.9)",
            border: `1px solid #fff`,
            $nest: {
              ...multi(["&:hover", "&:focus"], {
                color: "#fff",
                background: color(colors.DARK_BG).darken(0.15).toHexString(),
                border: `1px solid #fff`,
                boxShadow: "none",
              }),
            },
          },
          ".actions button.secondary": {
            color: "rgba(255,255,255,0.9)",
            border: `1px solid rgba(255,255,255,0.9)`,
            $nest: {
              ...multi(["&:hover", "&:focus"], {
                color: "#fff",
                background: "rgba(0,0,0,0.2)",
                border: `1px solid rgba(255,255,255,0.9)`,
                boxShadow: "none",
              }),
            },
          },
        },
      },

      ".sub-environments": {
        width: 500,
        paddingLeft: 20,
      },

      ".onboard-app-envkeys": {
        marginBottom: 40,
      },

      ".local-envkeys:not(:first-of-type)": {
        marginTop: 40,
      },
    },
  });

export const ManageEnvkeysContainer =
  AssocManagerContainer + " " + ManageEnvkeys;
