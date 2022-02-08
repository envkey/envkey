import { ManageEnvkeys } from "./manage_envkeys";
import { style } from "typestyle";
import { multi } from "../helpers";
import * as colors from "../colors";
import * as fonts from "../fonts";
import { color } from "csx";
import * as layout from "../layout";
import { OrgContainer } from "./org_container";
import { Modal } from "./modal";

export const OrgArchiveImporter =
  OrgContainer +
  " " +
  Modal +
  " " +
  style({
    $nest: {
      ".modal": {
        width: 650,
        height: "90%",
      },

      ...multi([".field", "p", ".buttons"], {
        width: "100%",
      }),

      h3: {
        marginBottom: 20,
      },

      "p.org-import-status": {
        textAlign: "center",
        fontSize: "22px",
        marginTop: 15,
      },

      ".import-complete-tabs": {
        width: "100%",
        display: "flex",
        alignItems: "center",
        marginBottom: 30,
        $nest: {
          "& > div": {
            userSelect: "none",
            flex: 1,
            textAlign: "center",
            width: "33.33%",
            padding: "11px 0",
            fontFamily: fonts.CONDENSED,
            fontSize: "18px",
            textTransform: "uppercase",
            background: colors.DARKER_BLUE,
            color: "#fff",
            $nest: {
              "&:not(:last-of-type)": {
                borderRight: "1px solid rgba(0,0,0,0.2)",
              },
              "&.selected": {
                background: colors.LIGHT_BLUE,
              },
              "&:not(.selected)": {
                cursor: "pointer",
                $nest: {
                  "&:hover": {
                    background: color(colors.DARKER_BLUE)
                      .lighten(0.05)
                      .toString(),
                  },
                },
              },
              small: {
                color: "rgba(255,255,255,0.6)",
                marginLeft: 6,
                position: "relative",
                top: -1,
                fontFamily: fonts.CONDENSED,
                fontSize: "16px",
              },
            },
          },
        },
      },
    },
  });

export const OrgImportEnvkeys =
  ManageEnvkeys +
  " " +
  style({
    margin: 0,

    $nest: {
      "h3 strong": {
        color: colors.LIGHTEST_BLUE,
      },
      ".sub-environments": {
        width: "auto",
      },
    },
  });
