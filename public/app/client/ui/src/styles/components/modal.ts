import * as colors from "../colors";
import * as fonts from "../fonts";
import { style } from "typestyle";

export const Modal = style({
  position: "fixed",
  width: "100%",
  height: "100%",
  top: 0,
  left: 0,
  zIndex: 5,
  padding: 0,
  margin: 0,
  $nest: {
    ".overlay": {
      width: "100%",
      height: "100%",
      position: "fixed",
      background: "rgba(0,0,0,0.9)",
      zIndex: 6,

      $nest: {
        "&:not(.disabled)": {
          cursor: "pointer",
        },

        ".back": {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "fixed",
          padding: 20,
          top: 0,
          left: 0,
          zIndex: 7,

          $nest: {
            span: {
              fontSize: "20px",
              fontFamily: fonts.CONDENSED,
              color: "#999",
              textTransform: "uppercase",
            },
          },
        },

        "&.disabled .back": {
          display: "none",
        },

        "&:hover .back": {
          $nest: {
            span: {
              color: "#fff",
            },
          },
        },
      },
    },

    ".modal": {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translateX(-50%) translateY(-50%)",
      background: "#fff",
      zIndex: 7,
      maxHeight: "90%",
      padding: 20,
      overflowY: "auto",
    },
  },
});
