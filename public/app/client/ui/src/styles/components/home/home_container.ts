import { style } from "typestyle";
import * as colors from "../../colors";
import { backLink, baseContainer } from "../../mixins";
import { multi } from "../../helpers";

export const HomeContainer = style({
  width: "100%",
  background: colors.DARK_BG,
  minHeight: "100%",
  display: "flex",
  justifyContent: "center",
  $nest: {
    "> div": {
      textAlign: "center",
      width: 800,
      padding: "0 150px",
      background: "rgba(0,0,0,0.25)",
      borderLeft: `1px solid ${colors.LIGHTEST_BLUE}`,
      borderRight: `1px solid ${colors.LIGHTEST_BLUE}`,
      boxShadow: "0px 0px 2px rgba(0,0,0,0.5)",

      $nest: {
        h3: {
          marginBottom: 30,
          fontSize: "19px",
          color: "rgba(255,255,255,0.9)",
          fontWeight: 300,
          padding: 15,
          background: "rgba(0,0,0,0.9)",
          $nest: {
            strong: {
              color: colors.LIGHT_ORANGE,
              fontWeight: 400,
            },
          },
        },
        "> div": {
          display: "flex",
          flexDirection: "column",
          minHeight: "100%",
        },
        "> div > svg": {
          margin: "50px auto 50px auto",
        },
        ".home-content > *:last-child": {
          marginBottom: 70,
        },
        ".error": {
          color: "#fff",
          padding: "10px 15px",
          background: colors.RED,
          whiteSpace: "pre-wrap",
          wordWrap: "break-word",
          userSelect: "initial",
          $nest: {
            strong: {
              color: "#fff",
            },
          },
        },

        pre: {
          fontFamily: "monospace",
          fontSize: "15px",
        },

        section: {
          background: "rgba(0,0,0,0.9)",
          marginBottom: 34,
          textAlign: "left",
          padding: "8px 34px",

          $nest: {
            ...multi(["p", "strong"], {
              color: "rgba(255,255,255,0.9)",
              fontSize: "19px",
            }),
          },
        },
      },
    },
    "&.anchor-center > div > div": {
      justifyContent: "center",
    },
    ".home-link": {
      marginTop: 30,
      $nest: {
        a: backLink({ bgMode: "dark" }),
      },
    },
  },
});

export const HomeContainerForm = style({
  ...baseContainer({ width: 500, bgMode: "dark" }),
});
