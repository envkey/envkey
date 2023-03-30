import * as layout from "../layout";
import { style } from "typestyle";
import * as colors from "../colors";
import { Modal } from "./modal";
import { OrgContainer } from "./org_container";
import { multi } from "../helpers";
import { button } from "../mixins/buttons";
import { deepMergeStyles } from "../helpers";
import { color } from "csx";

export const ReportError =
  OrgContainer +
  " " +
  Modal +
  " " +
  style({
    $nest: {
      ".modal": {
        height: 560,
      },
      textarea: {
        minHeight: 120,
      },
    },
  });
