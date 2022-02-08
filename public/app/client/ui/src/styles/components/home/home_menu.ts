import { style } from "typestyle";
import * as colors from "../../colors";
import * as fonts from "../../fonts";
import { imgLink } from "../../mixins";

export const HomeMenu = style({
  width: "100%",
  $nest: {
    ".primary": {
      $nest: {
        li: {
          marginBottom: 15,
          width: "100%",
        },
        "li > a": {
          color: "rgba(255,255,255,0.9)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
          padding: 20,
          fontFamily: fonts.CONDENSED,
          fontSize: "16px",
          fontWeight: 300,
          textTransform: "uppercase",
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.2)",
          $nest: {
            "> svg": {
              width: 32,
              height: 32,
              fill: "rgba(0,0,0,0.5)",
            },
            "&:hover": {
              background: "#000",
              color: colors.LIGHTEST_BLUE,
              border: "1px solid rgba(255,255,255,0.4)",
              $nest: {
                "> svg": {
                  fill: "rgba(255,255,255,0.6)",
                },
              },
            },
          },
        },

        "li.create-org > a > svg": {
          width: 25,
          height: 25,
          margin: "3.5px 0",
        },
        "li.accept-invite > a > svg": {
          width: 29,
          height: 29,
          margin: "1.5px 0",
          position: "relative",
          left: "-3.5px",
        },
      },
    },
    ".secondary": {
      display: "flex",
      flexDirection: "row",
      justifyContent: "space-between",
      borderTop: "1px solid rgba(0,0,0,0.5)",
      marginTop: 40,
      paddingTop: 32.5,
      $nest: {
        "li > a": imgLink({ bgMode: "dark", fontSize: "13.5px" }),
      },
    },
  },
});
