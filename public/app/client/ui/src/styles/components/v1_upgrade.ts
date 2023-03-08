import * as colors from "../colors";
import { style } from "typestyle";
import { HomeContainerForm } from "./home";

export const V1Upgrade =
  HomeContainerForm +
  " " +
  style({
    $nest: {
      "p.org-import-status": {
        textAlign: "center",
        fontSize: "22px",
        marginTop: 15,
      },
      ".field.select-apps .option": {
        $nest: {
          "&:not(:last-of-type)": {
            borderBottom: "1px solid rgba(255,255,255,0.2)",
          },

          "&:hover": {
            background: "rgba(255,255,255,0.04)",
          },
          "&.selected": {
            background: "rgba(255,255,255,0.08)",
          },

          label: {
            color: "rgba(255,255,255,0.8)",
          },
        },
      },
    },
  });
