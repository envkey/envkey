import { style } from "typestyle";
import { multi } from "../helpers";
import * as colors from "../colors";

export const MultiSelect = style({
  $nest: {
    ".field.filter": {
      marginBottom: 0,
    },
    ".options": {
      overflowY: "auto",
    },
    ".option": {
      display: "flex",
      alignItems: "center",
      justifyContent: "left",
      height: 50,

      paddingLeft: 20,
      paddingRight: 20,
      $nest: {
        ...multi(["&", "& *"], {
          cursor: "pointer",
        }),
        "&:not(:last-of-type)": {
          borderBottom: "1px solid rgba(0,0,0,0.2)",
        },
        "input[type=checkbox]": {
          margin: 0,
          marginRight: 15,
          pointerEvents: "none",
        },

        label: {
          fontSize: "15px",
          display: "flex",
          flex: 1,
          alignItems: "center",
          justifyContent: "left",
          color: colors.DARK_TEXT,
          fontWeight: 500,
        },

        "&:hover": {
          background: "rgba(0,0,0,0.04)",
        },
        "&.selected": {
          background: "rgba(0,0,0,0.08)",
        },

        ".small": {
          color: "rgba(0,0,0,0.5)",
          fontSize: "12.5px",
          flex: 1,
          textAlign: "right",
          fontWeight: 400,
          $nest: {
            strong: {
              fontWeight: 500,
              color: "rgba(0,0,0,0.5)",
              fontSize: "12.5px",
            },
          },
        },
      },
    },
  },
});
