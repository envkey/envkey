import { style } from "typestyle";
import * as colors from "../colors";
import * as fonts from "../fonts";
import * as layout from "../layout";
import { color } from "csx";
import { multi } from "../helpers";
import { OrgContainer } from "./org_container";

export const FilterSidebar =
  OrgContainer +
  " " +
  style({
    background: colors.DARKER_BLUE,
    width: layout.SUB_SIDEBAR_FILTERS_WIDTH,
    margin: 0,
    padding: "20px 25px",
    position: "fixed",
    overflowY: "auto",
    $nest: {
      ".field": {
        width: "100%",
        marginBottom: 20,
      },

      ".field:not(.checkbox) > label": {
        fontSize: "14.5px",
        fontWeight: 400,
        color: "rgba(255,255,255,0.65)",
        marginBottom: 10,
      },

      ".select": {
        background: "#fff",
        border: "none",
        $nest: {
          select: {
            fontSize: "13.5px",
            color: colors.DARK_TEXT,
          },
          "&:hover": {
            background: color("#fff").darken(0.01).toHexString(),
          },
        },
      },

      "button.primary": {
        background: "rgba(0,0,0,0.4)",
        $nest: {
          "&:not([disabled]):not(.disabled):hover": {
            background: "rgba(0,0,0,0.6)",
          },
        },
      },

      "input[type=text]": {
        fontSize: "13.5px",
        borderRadius: 0,
        border: "none",
        $nest: {
          "&:focus": {
            border: "none",
            boxShadow: `0px 0px 0px 2px ${colors.LIGHTEST_BLUE}`,
          },
        },
      },
    },
  });
