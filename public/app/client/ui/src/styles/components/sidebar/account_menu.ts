import { deepMergeStyles } from "../../helpers";
import * as layout from "../../layout";
import * as fonts from "../../fonts";
import * as colors from "../../colors";
import { hoverable } from "../../mixins";
import { color } from "csx";
import { style } from "typestyle";

export const AccountMenu = style({
  height: layout.MAIN_HEADER_HEIGHT,
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 15px",
  cursor: "pointer",
  background: colors.OFF_BLACK,
  userSelect: "none",
  $nest: {
    "> label": {
      fontFamily: fonts.MAIN,
      fontWeight: 500,
      color: "#fff",
      fontSize: "14px",
      opacity: 0.9,
    },
    "> svg": {
      width: 12,
      height: 12,
      fill: "#fff",
      opacity: 0.5,
    },
    "&.expanded": {
      background: colors.LIGHT_BLUE,
      $nest: {
        "> label": { opacity: 1 },
        "> svg": {
          opacity: 0.9,
        },
        "&:hover": {
          background: colors.LIGHT_BLUE,
        },
      },
    },
    "&:hover": {
      background: color(colors.OFF_BLACK).lighten(0.07).toString(),
      $nest: {
        "> label": {
          opacity: 1,
        },
        "> svg": {
          opacity: 0.9,
        },
      },
    },
  },
});

export const ExpandedAccountMenu = style({
  position: "absolute",
  background: colors.OFF_BLACK,
  width: "100%",
  height: `calc(100% - ${layout.MAIN_HEADER_HEIGHT}px)`,
  zIndex: 2,
  opacity: 0,
  pointerEvents: "none",
  $nest: {
    "&.expanded": {
      opacity: 1,
      pointerEvents: "initial",
    },
    "> ul": {
      width: "100%",
      borderBottom: `1px solid ${color(colors.DARKER_BLUE).darken(0.15)}`,
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
            color: "rgba(255,255,255,0.9)",
            fontFamily: fonts.CONDENSED,
            fontSize: "14px",
            fontWeight: 500,
            textTransform: "uppercase",
          },
          hoverable(
            color(colors.DARKER_BLUE).darken(0.1).toHexString(),
            color(colors.DARKER_BLUE).darken(0.2).toHexString(),
            {
              "&": {
                color: "#fff",
              },
            }
          )
        ),
      },
    },
  },
});

export const ExpandedAccountMenuSummary = style({
  background: "#000",
  display: "flex",
  $nest: {
    div: {
      display: "inline-block",
      flex: 1.33,
    },
    label: {
      fontSize: "13.5px",
      color: "#fff",
      fontFamily: fonts.CONDENSED,
      fontWeight: 400,
      padding: "10px 15px",
      display: "inline-block",
    },
    ".org-name": {
      flex: 1,
      textAlign: "center",
      borderLeft: "1px solid rgba(255,255,255,0.2)",
      $nest: {
        label: {
          textTransform: "uppercase",
          color: colors.LIGHTEST_BLUE,
          fontWeight: 600,
          fontSize: "12.5px",
        },
      },
    },
  },
});
