import { style } from "typestyle";
import * as colors from "../colors";
import * as fonts from "../fonts";
import { HomeContainerForm } from "./home";
import { OrgContainer } from "./org_container";
import { listItem } from "../mixins";
import { multi } from "../helpers";

export const RequireRecoveryKey =
  HomeContainerForm +
  " " +
  style({
    $nest: {
      "> p:first-of-type": {
        marginTop: 0,
      },
      ".recovery-key": {
        border: "1px dashed rgba(255,255,255,0.2)",
        $nest: {
          span: {
            color: "rgba(255,255,255,0.9)",
          },
          ".small-loader": {
            width: 35,
            height: 35,
            marginRight: 15,
            $nest: multi(["&", "rect", "path"], {
              fill: "rgba(255,255,255,0.7)",
            }),
          },
        },
      },
    },
  });

export const SettingsManageRecoveryKey =
  OrgContainer +
  " " +
  style({
    $nest: {
      ".active": {
        ...listItem(),
        width: "100%",
      },
      ".recovery-key": {
        border: "1px dashed rgba(0,0,0,0.15)",
      },
    },
  });

export const ManageRecoveryKey = style({
  $nest: {
    ".recovery-key": {
      width: 500,
      padding: 20,
      textAlign: "center",
      marginBottom: 30,
      whiteSpace: "normal",
      $nest: {
        span: {
          userSelect: "initial",
          fontSize: "18px",
          marginRight: 10,
        },
      },
    },
  },
});
