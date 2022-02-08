import { OrgContainer } from "./org_container";
import { style } from "typestyle";
import * as colors from "../colors";
import * as fonts from "../fonts";
import { multi } from "../helpers";
import { color } from "csx";
import { listItem } from "../mixins";

export const SSOSettings =
  OrgContainer +
  " " +
  style({
    $nest: {
      ".back-link": {
        padding: 0,
        margin: 0,
        marginBottom: 20,

        $nest: {
          a: {
            padding: 0,
            color: "rgba(0,0,0,0.4)",
          },

          "a:hover": {
            borderBottom: "none",
            color: "rgba(0,0,0,0.6)",
          },
        },
      },

      ".providers > div": listItem(),

      ".buttons": {
        marginBottom: 40,
      },
      ".field .buttons": {
        marginBottom: 0,
      },
      ".field.cert textarea": {
        height: 300,
      },

      ".certs h4.editing": {
        background: colors.DARKER_BLUE,
      },
    },
  });
