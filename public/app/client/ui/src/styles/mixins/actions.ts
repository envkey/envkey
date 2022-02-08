import { types } from "typestyle";
import * as colors from "../colors";
import * as fonts from "../fonts";
import { multi } from "../helpers";
import { color } from "csx";

export const actionRow = (): types.NestedCSSProperties => ({
  display: "flex",
  alignItems: "center",
  $nest: {
    "&.disabled": {
      pointerEvents: "none",
      opacity: 0.7,
    },
    "svg.small-loader": {
      width: 20,
      height: 20,
    },
    "> span": {
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      $nest: {
        svg: {
          width: 16,
          height: 16,
          fill: "rgba(0,0,0,0.2)",
        },
        span: {
          color: "rgba(0,0,0,0.5)",
          marginLeft: 5,
          fontSize: "13px",
          fontWeight: 500,
        },
        "&.disabled": {
          opacity: 0.7,
        },
        "&:not(:first-of-type)": {
          marginLeft: 15,
        },
        "&.delete svg": {
          width: 13,
          height: 13,
        },
        "&:hover": {
          $nest: {
            svg: {
              fill: "rgba(0,0,0,0.4)",
            },
            span: {
              color: "rgba(0,0,0,0.8)",
            },
          },
        },
      },
    },
    button: {
      background: "none",
      fontFamily: fonts.CONDENSED,
      fontSize: "15px",
      textTransform: "uppercase",
      padding: "3px 8px",
      borderRadius: 2,
      cursor: "pointer",
      $nest: {
        "&:not(:first-of-type)": {
          marginLeft: 8,
        },
        "&.secondary": {
          background: "none",
          color: colors.DARK_TEXT,
          border: "1px solid rgba(0,0,0,0.4)",
          $nest: {
            ...multi(["&:hover", "&:focus"], {
              background: "rgba(0,0,0,0.04)",
              border: "1px solid rgba(0,0,0,0.4)",
              boxShadow: "none",
            }),
          },
        },
        "&.primary": {
          background: colors.DARK_BG,
          color: "rgba(255,255,255,0.9)",
          border: `1px solid ${colors.DARK_BG}`,
          $nest: {
            ...multi(["&:hover", "&:focus"], {
              color: "#fff",
              background: color(colors.DARK_BG).darken(0.15).toHexString(),
              border: `1px solid ${colors.DARK_BG}`,
              boxShadow: "none",
            }),
          },
        },
      },
    },
    "&.confirm label": {
      fontSize: "14px",
      marginRight: 12,
      fontWeight: 500,
    },
  },
});
