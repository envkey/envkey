import { style } from "typestyle";
import * as colors from "../../colors";
import * as fonts from "../../fonts";
import { HomeContainerForm } from "./home_container";
import { multi } from "../../helpers";

export const SignIn =
  HomeContainerForm +
  " " +
  style({
    $nest: {
      ".field > label.initial-email": {
        display: "flex",
        width: "100%",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 20,
        border: "1px solid #000",
        $nest: {
          span: {
            color: "#fff",
            textTransform: "none",
            fontSize: "16px",
          },
        },
      },
      ".error": {
        marginTop: "34px",
        $nest: {
          "a svg": { color: "#aaa" },
        },
      },
      table: {
        marginBottom: "34px",
      },
      ...multi(["table td", "table th"], {
        padding: "8px 21px",
        margin: 0,
        color: "#ccc",
      }),
      "table th": {
        textAlign: "right",
        color: "#aaa",
      },
      ".saml-user-info": {
        $nest: {
          ...multi(["label", "p"], {
            textAlign: "center",
          }),
        },
      },
    },
  });
