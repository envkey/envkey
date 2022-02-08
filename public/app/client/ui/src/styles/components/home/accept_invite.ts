import { style } from "typestyle";
import * as colors from "../../colors";
import * as fonts from "../../fonts";
import { multi } from "../../helpers";
import { HomeContainerForm } from "./home_container";

export const AcceptInvite =
  HomeContainerForm +
  " " +
  style({
    $nest: {
      ...multi(
        [
          ".fields .field.invite-token > label",
          ".fields .field.encryption-token > label",
        ],
        {
          color: "rgba(255,255,255,0.9)",
          display: "flex",
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
          $nest: {
            ...multi(["&", "& *"], {
              fontFamily: fonts.MAIN,
              fontSize: "18px",
              textTransform: "initial",
            }),
            span: {
              display: "inline-block",
              textAlign: "right",
              maxWidth: "60%",
              color: "rgba(255,255,255,0.9)",
            },

            ".number": {
              fontSize: "50px",
              fontFamily: fonts.CONDENSED,
              fontWeight: 300,
              color: "#000",
            },

            strong: {
              fontWeight: 500,
            },
          },
        }
      ),

      ".field.invite-token > label strong": {
        color: colors.LIGHTEST_BLUE,
      },
      ".field.encryption-token > label strong": {
        color: colors.LIGHT_ORANGE,
      },

      ".field.sent-by": {
        marginBottom: 0,
        $nest: {
          " > label strong": {
            color: colors.LIGHTEST_BLUE,
          },
          " > p strong": {
            color: colors.LIGHTEST_BLUE,
          },
        },
      },
    },
  });
