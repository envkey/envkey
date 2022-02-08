import { style } from "typestyle";
import * as colors from "../colors";
import * as fonts from "../fonts";
import { listItem } from "../mixins";
import { OrgContainer } from "./org_container";

export const InviteUsers =
  OrgContainer +
  " " +
  style({
    $nest: {
      ".pending-invites": {
        marginBottom: 30,
      },
      ".pending": listItem(),
    },
  });

export const GeneratedInvites = style({
  $nest: {
    ".generated-invites": {
      width: "100%",
      marginBottom: 20,
      $nest: {
        "> div": {
          background: colors.DARK_BLUE,
          marginBottom: 20,
          padding: 20,
          width: "100%",
          position: "relative",

          $nest: {
            small: {
              color: colors.DARK_BLUE,
              position: "absolute",
              top: "calc(100% - 45px)",
              left: "calc(100% + 15px)",
              fontSize: "13px",
              fontWeight: 500,
            },

            ".name": {
              marginBottom: 15,
              $nest: {
                label: {
                  color: "rgba(255,255,255,0.8)",
                  fontSize: "18px",
                  $nest: {
                    strong: {
                      color: "#fff",
                      fontSize: "20px",
                    },
                  },
                },
              },
            },

            ".token": {
              width: "100%",
              $nest: {
                "> div": {
                  display: "flex",
                  width: "100%",
                },
                label: {
                  display: "block",
                  fontFamily: fonts.CONDENSED,
                  textTransform: "uppercase",
                  fontWeight: 400,
                  fontSize: "16px",
                  color: "rgba(255,255,255,0.7)",
                },
                span: {
                  padding: "0 12px",
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: colors.DARKER_BLUE,
                  marginRight: 20,
                  fontFamily: fonts.CODE,
                  color: colors.LIGHTEST_BLUE, //"rgba(0,0,0,0.3)",
                  fontWeight: 500,
                  position: "relative",
                },
              },
            },

            button: {
              border: "1px solid rgba(255,255,255,0.7)",
              background: "none",
              color: "rgba(255,255,255,0.9)",
              fontFamily: fonts.CONDENSED,
              textTransform: "uppercase",
              fontWeight: 500,
              borderRadius: 2,
              padding: "5px 10px",
              cursor: "pointer",
            },
          },
        },
      },
    },
  },
});
