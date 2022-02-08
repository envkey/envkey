import * as colors from "../colors";
import * as fonts from "../fonts";
import { style } from "typestyle";

export const ErrorState = style({
  position: "absolute",
  width: "100%",
  height: "100%",
  top: 0,
  left: 0,
  padding: 0,
  margin: 0,
  background: colors.DARK_BG,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  $nest: {
    "> div": {
      background: colors.OFF_BLACK,
      padding: "40px 80px",
      border: `1px solid ${colors.RED}`,
    },
    h2: {
      color: "#fff",
      fontFamily: fonts.CONDENSED,
      fontSize: "24px",
      fontWeight: 300,
    },
    h3: {
      color: "rgba(255,255,255,0.35)",
      fontFamily: fonts.MAIN,
      fontSize: "16px",
      textAlign: "center",
      marginTop: 10,
    },
    ".back": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 20,

      $nest: {
        span: {
          fontSize: "16px",
          fontFamily: fonts.CONDENSED,
          color: "rgba(255,255,255,0.5)",
          textTransform: "uppercase",
        },

        "&:hover span": {
          color: "rgba(255,255,255,0.9)",
        },
      },
    },
  },
});
