import { deepMergeStyles } from "./../helpers";
import { button } from "./../mixins/buttons";
import { style } from "typestyle";
import { multi } from "../helpers";
import * as colors from "../colors";
import { color } from "csx";
import { OrgContainer } from "./org_container";
import { Modal } from "./modal";
import { Diffs } from "./diffs";

export const PendingEnvsFooter = style({
  position: "fixed",
  background: colors.OFF_BLACK,
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 30px",
  overflow: "hidden",
  transition: "height",
  transitionDuration: "0.2s",
  $nest: {
    label: {
      marginRight: 20,
      $nest: {
        ...multi(["&", "& *"], {
          color: "#fff",
          fontSize: "18px",
          fontWeight: 500,
        }),
      },
    },

    textarea: {
      flex: 1,
      marginRight: 20,
      padding: 10,
      resize: "none",
      borderRadius: "2px",
      height: 50,
      $nest: {
        "&:focus": {
          border: `1px solid ${colors.LIGHT_ORANGE}`,
          boxShadow: `0 0 1px 1px ${colors.LIGHT_ORANGE}`,
        },
      },
    },

    ".sep": {
      margin: "0 7px",
      opacity: 0.4,
    },

    ".conflicts": {
      color: colors.RED,
    },

    ".actions": {
      display: "flex",
      alignItems: "center",

      $nest: {
        button: deepMergeStyles(button(), {
          fontSize: "17px",
          padding: "5px 15px",
          $nest: {
            "&:not(:last-of-type)": {
              marginRight: 10,
            },
            "&[disabled]": {
              opacity: 0.7,
              pointerEvents: "none",
            },
          },
        }),

        "button.secondary": {
          background: "none",
          color: "rgba(255,255,255,0.8)",
          boxShadow: "0 0 0 1.5px rgba(255,255,255,0.5)",
          $nest: {
            "&:hover": {
              background: "rgba(255,255,255,0.1)",
              color: "#fff",
              boxShadow: "0 0 0 1.5px rgba(255,255,255,0.8)",
            },
          },
        },

        "button.primary": {
          padding: "5px 75px",
          background: colors.ORANGE,
          color: "#fff",
          border: `1px solid ${colors.ORANGE}`,
          $nest: {
            "&:hover": {
              background: color(colors.ORANGE).darken(0.1).toHexString(),
              color: "#fff",
              border: `1px solid ${color(colors.ORANGE)
                .darken(0.1)
                .toHexString()}`,
            },
          },
        },
      },
    },
  },
});

export const ReviewPending =
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
