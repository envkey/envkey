import { style } from "typestyle";
import * as colors from "../colors";
import * as layout from "../layout";
import * as fonts from "../fonts";
import { backLink } from "../mixins";
import { multi } from "../helpers";

export const SelectedObjectContainer = style({
  paddingTop: layout.MAIN_HEADER_HEIGHT,
});

export const SelectedObjectHeader = style({
  background: colors.OFF_BLACK,
  height: layout.MAIN_HEADER_HEIGHT,
  width: `calc(100% - ${layout.SIDEBAR_WIDTH}px)`,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  userSelect: "none",
  padding: "0 10px",
  position: "fixed",
  top: 0,
  zIndex: 2,
  $nest: {
    h1: {
      margin: 0,
      display: "flex",
      alignItems: "center",
      height: "100%",

      $nest: {
        "> span": {
          display: "flex",
          alignItems: "center",
          fontFamily: fonts.CONDENSED,
          fontWeight: 300,
          fontSize: "20px",
          color: "#fff",
          opacity: 0.6,
          textTransform: "uppercase",
        },
        "> span > svg": {
          width: 9,
          height: 9,
          fill: "#fff",
          marginLeft: 6.5,
        },
        "> label": {
          marginLeft: 6.5,
          fontSize: "16px",
          color: "#fff",
          fontWeight: 500,
          position: "relative",
          top: -1,
        },
      },
    },
  },
});

export const SelectedObjectTabs = style({
  display: "flex",
  height: "100%",
  alignItems: "center",
  $nest: {
    "> a": {
      display: "flex",
      alignItems: "center",
      height: "100%",
      padding: "0 15px",
      cursor: "pointer",
      $nest: {
        "> label": {
          cursor: "pointer",
          color: "rgba(255,255,255,0.9)",
          fontSize: "13.5px",
          fontFamily: fonts.MAIN,
          fontWeight: 400,
          position: "relative",
          top: -1,
        },
        "&:hover": {
          background: "rgba(255,255,255,0.15)",
          $nest: {
            "> label": {
              color: "#fff",
            },
          },
        },
        "&.selected": {
          background: "rgba(255,255,255,0.15)",
          $nest: {
            "> label": {
              color: colors.LIGHTEST_BLUE,
              fontWeight: 500,
            },
          },
        },
      },
    },
  },
});

export const SelectedObjectSubTabs = style({
  width: "100%",
  paddingLeft: 30,
  background: colors.DARK_BLUE,
  $nest: {
    a: {
      padding: "0 15px",
      fontSize: "14px",
      display: "inline-flex",
      height: 40,
      alignItems: "center",
      $nest: {
        ...multi(["&", "& *"], {
          cursor: "pointer",
        }),
        label: {
          color: "rgba(0,0,0,0.7)",
        },
        "&.selected": {
          background: "rgba(0,0,0,0.075)",
        },
        "&.selected > label": {
          color: "#fff",
          fontWeight: 500,
        },
        "&:not(.selected):hover > label": {
          color: "rgba(255,255,255,0.7)",
        },
      },
    },
    "&.add": {
      background: colors.ORANGE,
    },
  },
});

export const SelectedObjectBackLink = style({
  ...backLink({ bgMode: "light" }),
  display: "flex",
  height: 40,
  alignItems: "center",
  width: "100%",
  background: "#fff",
  borderBottom: "none", // "1px solid rgba(0,0,0,0.1)",
  margin: 0,
  padding: "0 30px",
  fontSize: "14px",
  $nest: {
    "&:hover": {
      borderBottom: "none", // "1px solid rgba(0,0,0,0.1)",
      background: "rgba(0,0,0,0.05)",
    },
  },
});
