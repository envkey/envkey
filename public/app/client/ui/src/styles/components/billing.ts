import { style } from "typestyle";
import * as colors from "../colors";
import * as fonts from "../fonts";
import { multi } from "../helpers";
import { OrgContainer } from "./org_container";

export const Billing =
  OrgContainer +
  " " +
  style({
    $nest: {
      ".current-license": {
        marginBottom: 30,
        $nest: {
          "> h3": {
            marginBottom: 10,
          },
          "> .field": {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 25px",
            margin: 0,
            height: 65,
            $nest: {
              "&:not(:last-of-type)": {
                borderBottom: "1px solid rgba(0,0,0,0.1)",
              },
              label: {
                margin: 0,
                display: "flex",
                alignItems: "center",
                $nest: {
                  ".refresh": {
                    margin: "0 4px",
                    padding: "2px 4px",
                    cursor: "pointer",
                    $nest: {
                      svg: {
                        fill: "rgba(0,0,0,0.3)",
                        width: 12,
                        height: 12,
                      },
                      "&:hover svg": {
                        fill: colors.DARK_BLUE,
                      },
                    },
                  },
                },
              },
              span: {
                color: colors.DARK_BLUE,
                textAlign: "right",
                fontSize: "14.5xpx",
                $nest: {
                  small: {
                    display: "block",
                    fontFamily: fonts.MAIN,
                    color: "rgba(0,0,0,0.4)",
                  },
                },
              },
            },
          },
        },
      },
      ".field.new-license > textarea": {
        height: 350,
      },
      ".field.billing-id span": {
        fontSize: "15px",
        userSelect: "initial",
      },
      ".field.billing-tier span strong": {
        color: colors.DARK_BLUE,
      },

      ".billing-settings .field > span": {
        fontSize: "14px",
        color: "rgba(0,0,0,0.5)",
      },

      ".invoices": {
        width: "100%",
        $nest: {
          ".invoice-list": {
            width: 800,
            borderCollapse: "collapse",
            marginBottom: 40,
            $nest: {
              tr: {
                borderBottom: "1px solid rgba(0,0,0,0.07)",
              },
              ...multi(["th", "td"], {
                padding: "12px 10px",
                textAlign: "center",

                $nest: {
                  "&:is(th)": {
                    textTransform: "uppercase",
                    fontWeight: 600,
                    color: "rgba(0,0,0,0.3)",
                    fontSize: "12px",
                  },
                  "&:is(td)": {
                    fontSize: "14px",
                    verticalAlign: "middle",
                    $nest: {
                      a: {
                        display: "inline-block",
                        width: 60,
                        color: colors.DARK_BLUE,
                        $nest: {
                          "&:hover": {
                            fontWeight: 600,
                          },
                        },
                      },
                    },
                  },
                },
              }),
            },
          },
        },
      },

      "&.stripe-form": {
        height: "100%",
        width: "100%",
        boxSizing: "border-box",
        margin: "auto 0",
        $nest: {
          h3: {
            width: "100%",
            marginBottom: 40,
          },
          form: {
            margin: "0 auto",
          },
          ".buttons": {
            marginTop: 40,
          },
          "p:not(.error)": {
            fontSize: "14px",
            color: "rgba(0,0,0,0.4)",
            textAlign: "center",
            width: "100%",
            marginBottom: 10,
          },
          ".stripe-logo": {
            textAlign: "center",
            width: "100%",
          },
        },
      },

      "&.choose-plan": {
        $nest: {
          ".field": {
            marginBottom: 20,
          },
        },
      },
    },
  });
